import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  ApprovalResumeRequiredError,
  compileSolutionGraph,
  type AgentGraphUpdate,
  type SolutionGraphDeps,
} from "@kf/agent-orchestrator";
import { Command } from "@langchain/langgraph";
import type { Conversation, Message } from "@prisma/client";
import pg from "pg";
import { AUDIT_ACTIONS, AuditService } from "../audit/audit.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { PG_POOL, createCheckpointSaver } from "./checkpointer.js";
import { createGraphPorts } from "./graph-ports.js";
import { MODEL_PORT } from "./model-port.js";

type CompiledGraph = ReturnType<typeof compileSolutionGraph>;

export interface SseEvent {
  event: string;
  data: unknown;
}

export interface SessionPrincipalLike {
  userId: string;
  tenantId: string;
  role: "platform_admin" | "tenant_admin" | "member";
  sessionId: string;
}

interface StateSnapshotLike {
  values: Record<string, unknown>;
  tasks: { interrupts: { value: unknown }[] }[];
}

interface ApprovalInterruptLike {
  type: string;
  changeRequestId?: string;
  planHash?: string;
  summary?: string;
  diffArtifactId?: string;
  previewArtifactId?: string;
}

const DEFAULT_CONVERSATION_TITLE = "New conversation";

/**
 * Conversation workflow service. Exposes the LangGraph solution workflow
 * behind the HTTP layer:
 *   - POST messages runs a turn with conversationId as thread_id and streams
 *     graph state updates over SSE,
 *   - POST resume resumes a paused approval with Command({ resume }),
 *   - while an approval is pending, plain messages are rejected with
 *     ApprovalResumeRequiredError (the graph guard already enforces this; the
 *     service checks before persisting the user message so no orphan message
 *     is written).
 */
@Injectable()
export class ConversationService {
  #graph: CompiledGraph | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(MODEL_PORT) private readonly modelPort: SolutionGraphDeps["modelPort"],
    @Inject(PG_POOL) private readonly pool: pg.Pool,
  ) {}

  async create(tenantId: string, workspaceId: string, title?: string): Promise<Conversation> {
    const workspace = await this.prisma.solutionWorkspace.findFirst({
      where: { id: workspaceId, tenantId },
    });
    if (workspace === null) {
      throw new NotFoundException("workspace");
    }
    const cleanTitle =
      typeof title === "string" && title.trim().length > 0
        ? title.trim()
        : DEFAULT_CONVERSATION_TITLE;
    return this.prisma.conversation.create({
      data: { tenantId, workspaceId, title: cleanTitle },
    });
  }

  async get(tenantId: string, conversationId: string): Promise<Conversation> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, tenantId },
    });
    if (conversation === null) {
      throw new NotFoundException("conversation");
    }
    return conversation;
  }

  async listMessages(tenantId: string, conversationId: string): Promise<Message[]> {
    await this.get(tenantId, conversationId);
    return this.prisma.message.findMany({
      where: { tenantId, conversationId },
      orderBy: { createdAt: "asc" },
    });
  }

  /**
   * Starts a message turn. Persists the user message only after confirming no
   * approval interrupt is pending, then returns a generator of SSE events
   * (graph state updates + a final `done` event). Throws
   * ApprovalResumeRequiredError before any stream starts when the thread is
   * paused.
   */
  async startTurn(
    principal: SessionPrincipalLike,
    conversationId: string,
    content: string,
  ): Promise<AsyncGenerator<SseEvent>> {
    const conversation = await this.get(principal.tenantId, conversationId);
    const text = typeof content === "string" ? content.trim() : "";
    if (text.length === 0) {
      throw new BadRequestException("content is required");
    }
    const graph = await this.getGraph();
    const config = threadConfig(conversationId);

    const snapshot = (await graph.getState(config)) as unknown as StateSnapshotLike;
    if (hasPendingInterrupt(snapshot)) {
      throw new ApprovalResumeRequiredError(conversationId);
    }

    await this.prisma.message.create({
      data: {
        tenantId: principal.tenantId,
        conversationId,
        role: "user",
        content: text,
      },
    });

    const input = {
      tenantId: principal.tenantId,
      userId: principal.userId,
      workspaceId: conversation.workspaceId,
      conversationId,
      stage: "idle",
      recentMessages: [],
    } satisfies AgentGraphUpdate;
    const stream = (await graph.stream(input, config)) as AsyncGenerator<unknown>;
    return this.forwardStream(stream, graph, config);
  }

  private async *forwardStream(
    stream: AsyncGenerator<unknown>,
    graph: CompiledGraph,
    config: Record<string, unknown>,
  ): AsyncGenerator<SseEvent> {
    for await (const chunk of stream) {
      yield { event: "state", data: chunk };
    }
    const final = (await graph.getState(config)) as unknown as StateSnapshotLike;
    yield { event: "done", data: finalStateData(final) };
  }

  /**
   * Resumes a pending approval. Accepts approve/revise/cancel plus the exact
   * planHash the user was shown.
   *
   * Safety (I1): a resume is only meaningful while an approval interrupt is
   * actually pending. The check-then-act (getState → graph resume → audit)
   * sequence is serialized per conversation with a Postgres advisory lock
   * (`pg_advisory_xact_lock`, transaction-scoped, auto-released — the same
   * pattern Task 9 uses for build leases). Two concurrent resumes of the same
   * conversation can therefore never both observe a pending interrupt: the
   * loser waits on the lock, re-checks after the winner committed, finds no
   * pending interrupt and is rejected with 409 NO_PENDING_APPROVAL *without*
   * running the graph or writing audit rows. Audit writes land in the same
   * transaction as the lock, so PLAN_CONFIRMED / BUILD_START can never be
   * fabricated by replay (sequential or concurrent).
   *
   * A planHash mismatch is surfaced as a 409 conflict with
   * PLAN_HASH_MISMATCH (graph returns to idle with no side effects). Graph
   * execution failures are surfaced as structured 409 GRAPH_ERROR responses
   * (mirrors the SSE `error` event on the messages endpoint).
   */
  async resume(
    principal: SessionPrincipalLike,
    conversationId: string,
    body: { action?: string; planHash?: string },
  ): Promise<Record<string, unknown>> {
    const { action, planHash } = body;
    if (action !== "approve" && action !== "revise" && action !== "cancel") {
      throw new BadRequestException(
        apiError("INVALID_RESUME_ACTION", "resume action must be approve, revise, or cancel"),
      );
    }
    if (typeof planHash !== "string" || planHash.length === 0) {
      throw new BadRequestException(apiError("INVALID_RESUME_ACTION", "planHash is required"));
    }
    const conversation = await this.get(principal.tenantId, conversationId);
    const graph = await this.getGraph();
    const config = threadConfig(conversationId);

    return this.prisma.$transaction(
      async (tx) => {
        // Serialize resume processing per conversation. Every concurrent
        // resume takes the same advisory lock; only one proceeds past this
        // point at a time.
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(hashtextextended(${conversationId}, 0))
        `;

        // Lock-internal re-check: any committed state from a winner (including
        // the checkpoint of the graph resume) is visible now.
        const snapshot = (await graph.getState(config)) as unknown as StateSnapshotLike;
        if (!hasPendingInterrupt(snapshot)) {
          throw new ConflictException(
            apiError(
              "NO_PENDING_APPROVAL",
              "conversation has no pending approval to resume; a resume is only valid once per interrupt",
            ),
          );
        }

        const resumeCommand = new Command({ resume: { action, planHash } });
        let final: StateSnapshotLike;
        try {
          const stream = (await graph.stream(
            resumeCommand as unknown as Parameters<typeof graph.stream>[0],
            config,
          )) as AsyncGenerator<unknown>;
          for await (const chunk of stream) {
            void chunk;
            // Drain the run; the final checkpoint holds the outcome.
          }
          final = (await graph.getState(config)) as unknown as StateSnapshotLike;
        } catch (error) {
          throw new ConflictException(
            apiError("GRAPH_ERROR", error instanceof Error ? error.message : String(error)),
          );
        }
        const values = final.values;
        const lastError = values.lastErrorCode;
        if (lastError === "PLAN_HASH_MISMATCH") {
          throw new ConflictException(
            apiError(
              "PLAN_HASH_MISMATCH",
              "the displayed plan hash does not match the pending plan",
            ),
          );
        }
        if (lastError === "INVALID_RESUME_ACTION") {
          throw new BadRequestException(
            apiError("INVALID_RESUME_ACTION", "invalid resume action or planHash"),
          );
        }

        const interrupt = extractInterrupt(final);
        const result: Record<string, unknown> = {
          stage: interrupt !== undefined ? "approval" : values.stage,
          changeRequestId: values.activeChangeRequestId ?? undefined,
          planHash: values.planHash ?? undefined,
        };
        if (values.changePlanId !== undefined) result.changePlanId = values.changePlanId;
        if (interrupt !== undefined) result.interrupt = interrupt;
        if (values.buildJobId !== undefined) result.buildJobId = values.buildJobId;

        // Audit rows share the lock transaction: they commit together with
        // the lock release, so a loser can never write them.
        const detail = { planHash, workspaceId: conversation.workspaceId };
        const changePlanId =
          typeof values.changePlanId === "string" ? values.changePlanId : undefined;
        const changeRequestId =
          typeof values.activeChangeRequestId === "string"
            ? values.activeChangeRequestId
            : undefined;
        if (action === "approve") {
          await this.audit.record(
            {
              tenantId: principal.tenantId,
              actorUserId: principal.userId,
              action: AUDIT_ACTIONS.PLAN_CONFIRMED,
              resourceType: "CHANGE_PLAN",
              ...(changePlanId !== undefined ? { resourceId: changePlanId } : {}),
              detail,
            },
            tx,
          );
          if (typeof values.buildJobId === "string") {
            await this.audit.record(
              {
                tenantId: principal.tenantId,
                actorUserId: principal.userId,
                action: AUDIT_ACTIONS.BUILD_START,
                resourceType: "BUILD_JOB",
                resourceId: values.buildJobId,
                detail,
              },
              tx,
            );
          }
        } else if (action === "cancel") {
          await this.audit.record(
            {
              tenantId: principal.tenantId,
              actorUserId: principal.userId,
              action: AUDIT_ACTIONS.PLAN_CANCELLED,
              resourceType: "CHANGE_REQUEST",
              ...(changeRequestId !== undefined ? { resourceId: changeRequestId } : {}),
              detail,
            },
            tx,
          );
        } else {
          await this.audit.record(
            {
              tenantId: principal.tenantId,
              actorUserId: principal.userId,
              action: AUDIT_ACTIONS.PLAN_REVISED,
              resourceType: "CHANGE_PLAN",
              ...(changePlanId !== undefined ? { resourceId: changePlanId } : {}),
              detail,
            },
            tx,
          );
        }
        return result;
      },
      // The graph resume is fast (no LLM call), but keep a generous bound so
      // a stalled checkpoint write cannot pin the advisory lock forever.
      { timeout: 30_000 },
    );
  }

  private async getGraph(): Promise<CompiledGraph> {
    if (this.#graph === undefined) {
      const ports = createGraphPorts(this.prisma);
      const deps: SolutionGraphDeps = {
        modelPort: this.modelPort,
        workspaceQuery: ports.workspaceQuery,
        changePlanRepository: ports.changePlanRepository,
        buildJobPort: ports.buildJobPort,
        isDomainSupported: (domain) => domain === "kingclient",
        defaultDomainKind: "kingclient",
      };
      const saver = await createCheckpointSaver(this.pool);
      this.#graph = compileSolutionGraph(deps, { checkpointer: saver });
    }
    return this.#graph;
  }
}

function threadConfig(conversationId: string): Record<string, unknown> {
  return { configurable: { thread_id: conversationId } };
}

function hasPendingInterrupt(snapshot: StateSnapshotLike): boolean {
  return snapshot.tasks.some((task) => task.interrupts.length > 0);
}

function extractInterrupt(snapshot: StateSnapshotLike): ApprovalInterruptLike | undefined {
  for (const task of snapshot.tasks) {
    for (const interrupt of task.interrupts) {
      const value = interrupt.value as ApprovalInterruptLike;
      if (value !== null && typeof value === "object" && value.type === "plan-approval") {
        return value;
      }
    }
  }
  return undefined;
}

function finalStateData(final: StateSnapshotLike): Record<string, unknown> {
  const values = final.values;
  const interrupt = extractInterrupt(final);
  return {
    stage: values.stage ?? null,
    intent: values.intent ?? null,
    lastErrorCode: values.lastErrorCode ?? null,
    buildJobId: values.buildJobId ?? null,
    workspaceId: values.workspaceId ?? null,
    conversationId: values.conversationId ?? null,
    planHash: values.planHash ?? null,
    changePlanId: values.changePlanId ?? null,
    changeRequestId: values.activeChangeRequestId ?? null,
    ...(interrupt !== undefined ? { interrupt } : {}),
  };
}

function apiError(code: string, message: string): { error: { code: string; message: string } } {
  return { error: { code, message } };
}
