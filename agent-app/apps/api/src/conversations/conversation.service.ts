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
import type { ArtifactStorage } from "@kf/artifact-storage";
import pg from "pg";
import { AUDIT_ACTIONS, AuditService } from "../audit/audit.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { ARTIFACT_STORAGE } from "../artifacts/artifact-storage.js";
import { PG_POOL, createCheckpointSaver } from "./checkpointer.js";
import {
  CAPABILITY_RETRIEVAL_PORT,
  CREATIVE_SOLUTION_COMPILER_PORT,
  createGraphPorts,
} from "./graph-ports.js";
import { MODEL_PORT } from "./model-port.js";
import { MODULE_ARTIFACT_AUTHORITY, SERVER_PLAN_AUTHORITY } from "./server-plan-authority.js";
import type { ModuleArtifactAuthority, ServerPlanAuthority } from "@kf/build-jobs";
import { AssetService } from "../assets/asset.service.js";
import { DeliverySnapshotService, projectModuleDeliveryResult } from "../delivery/delivery-snapshot.service.js";
import {
  CONVERSATION_TURN_LEASE,
  type ConversationTurnLease,
  type ConversationTurnLeasePort,
} from "./conversation-turn-lease.js";

type CompiledGraph = ReturnType<typeof compileSolutionGraph>;

export interface SseEvent {
  event: string;
  data: unknown;
}

export interface DisposableSseStream extends AsyncIterableIterator<SseEvent> {
  dispose(): Promise<void>;
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
const SSE_CANCELLATION_GRACE_MS = 250;
const CUSTOMER_ERROR_CODES = new Set([
  "ACCEPTED_BLUEPRINT_CONFIRMATION_FAILED",
  "ACCEPTED_BLUEPRINT_CONFIRMATION_NOT_CONFIGURED",
  "BUILD_FAILED",
  "BUILD_PREVIEW_NOT_AVAILABLE",
  "BUILD_POST_ENQUEUE_SYNC_FAILED",
  "BUILD_REQUIRES_APPROVAL",
  "CREATIVE_SOLUTION_BLOCKED",
  "CREATIVE_SOLUTION_COMPILATION_FAILED",
  "CREATIVE_SOLUTION_COMPILER_NOT_CONFIGURED",
  "CREATIVE_SOLUTION_EVIDENCE_UNAVAILABLE",
  "CREATIVE_SOLUTION_INPUT_INVALID",
  "CREATIVE_SOLUTION_OUTPUT_INVALID",
  "CREATIVE_SOLUTION_PERSIST_FAILED",
  "DESIGN_NOT_CONFIRMED",
  "DESIGN_REVISION_NOT_APPLIED",
  "ENQUEUE_FAILED",
  "IMPLEMENTATION_BASE_REVISION_REQUIRED",
  "IMPLEMENTATION_COMPILER_NOT_CONFIGURED",
  "INCOMPLETE_PLAN",
  "INITIAL_DESIGN_CREATED",
  "INVALID_MODEL_OUTPUT",
  "INVALID_RESUME_ACTION",
  "MODULE_ASSET_REQUIRED",
  "MODULE_BLUEPRINT_MAPPING_REQUIRED",
  "MODULE_COMPILATION_FAILED",
  "MODULE_PLAN_REPAIR_EXHAUSTED",
  "MODULE_PLANNING_FAILED",
  "MODULE_STABLE_CAPABILITY_UNAVAILABLE",
  "MODULE_STABLE_CATALOG_EMPTY",
  "NO_PLAN_AVAILABLE",
  "PLAN_HASH_MISMATCH",
  "ROLLBACK_NOT_SUPPORTED",
  "SERVER_PLAN_SIGNER_NOT_CONFIGURED",
  "UI_IMPLEMENTATION_INVALID",
  "UNSUPPORTED_DOMAIN",
]);

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
    @Inject(CONVERSATION_TURN_LEASE)
    private readonly turnLeases: ConversationTurnLeasePort,
    @Inject(ARTIFACT_STORAGE) private readonly artifactStorage: ArtifactStorage,
    @Inject(SERVER_PLAN_AUTHORITY) private readonly serverPlanAuthority: ServerPlanAuthority,
    @Inject(CREATIVE_SOLUTION_COMPILER_PORT)
    private readonly creativeSolutionCompiler: NonNullable<SolutionGraphDeps["creativeSolutionCompiler"]>,
    @Inject(MODULE_ARTIFACT_AUTHORITY) private readonly moduleArtifactAuthority: ModuleArtifactAuthority,
    private readonly assetService: AssetService,
    private readonly deliverySnapshots: DeliverySnapshotService,
    @Inject(CAPABILITY_RETRIEVAL_PORT)
    private readonly capabilityRetrieval: NonNullable<SolutionGraphDeps["capabilityRetrieval"]>,
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

  async listByWorkspace(tenantId: string, workspaceId: string): Promise<Conversation[]> {
    const workspace = await this.prisma.solutionWorkspace.findFirst({
      where: { id: workspaceId, tenantId },
      select: { id: true },
    });
    if (workspace === null) {
      throw new NotFoundException("workspace");
    }
    return this.prisma.conversation.findMany({
      where: { tenantId, workspaceId },
      orderBy: { updatedAt: "desc" },
    });
  }

  async listMessages(tenantId: string, conversationId: string): Promise<Message[]> {
    await this.get(tenantId, conversationId);
    const rows = await this.prisma.message.findMany({
      where: { tenantId, conversationId },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((row) => row.role === "assistant" && isTechnicalAssistantPayload(row.content)
      ? { ...row, content: "工程正在按已确认的效果蓝图生成，技术实施细节由系统自动校验。" }
      : row);
  }

  async getDelivery(tenantId: string, conversationId: string, expectedBuildJobId?: string): Promise<import("../delivery/delivery-snapshot.service.js").PersistedDeliverySnapshot | null> {
    return this.deliverySnapshots.getForConversation(tenantId, conversationId, expectedBuildJobId);
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
  ): Promise<DisposableSseStream> {
    const conversation = await this.get(principal.tenantId, conversationId);
    const text = typeof content === "string" ? content.trim() : "";
    if (text.length === 0) {
      throw new BadRequestException("content is required");
    }
    const graph = await this.getGraph();
    const config = threadConfig(conversationId);
    const lease = await this.turnLeases.acquire(conversationId);
    try {
      // The lock-internal re-check and complete stream guarantee a later turn
      // observes the winner's committed checkpoint. Contenders fail fast at
      // the dedicated lease boundary instead of consuming checkpoint clients.
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

    // 保留 checkpoint 的 stage（如 design-review / preview-review），只有首次
    // 消息（无历史 checkpoint）才落到 idle——硬编码 idle 会把 design-review
    // 等用户驱动阶段覆盖掉，导致 CONFIRM_DESIGN 兜底失效。
      const resumedSnapshot = (await graph.getState(config)) as unknown as StateSnapshotLike;
      const resumedStage = (resumedSnapshot?.values as Record<string, unknown> | undefined)?.stage;
    // checkpoint 的 stage 本就是 AgentGraphState 的合法值，收窄类型即可。
      const stage = (
        typeof resumedStage === "string" ? resumedStage : "idle"
      ) as Exclude<AgentGraphUpdate["stage"], undefined>;

      const input = {
        tenantId: principal.tenantId,
        userId: principal.userId,
        workspaceId: conversation.workspaceId,
        conversationId,
        stage,
        recentMessages: [],
      } satisfies AgentGraphUpdate;
      const stream = (await graph.stream(input, config)) as AsyncGenerator<unknown>;
      return disposableSseStream(
        stream,
        graph,
        config,
        lease,
        this.moduleArtifactAuthority,
      );
    } catch (error) {
      await lease.dispose().catch(() => {});
      throw error;
    }
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
        } catch {
          throw new ConflictException(
            apiError("GRAPH_ERROR", "对话处理失败，请重试"),
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
      const ports = createGraphPorts(
        this.prisma,
        this.artifactStorage,
        this.moduleArtifactAuthority,
        this.assetService,
        this.creativeSolutionCompiler,
        this.serverPlanAuthority,
      );
      if (ports.creativeSolutionCompiler === undefined) {
        throw new Error("CREATIVE_SOLUTION_COMPILER_NOT_CONFIGURED");
      }
      const deps: SolutionGraphDeps = {
        modelPort: this.modelPort,
        workspaceQuery: ports.workspaceQuery,
        changePlanRepository: ports.changePlanRepository,
        buildJobPort: ports.buildJobPort,
        uiImplementationCompiler: ports.uiImplementationCompiler,
        serverPlanSigner: this.serverPlanAuthority,
        moduleArtifactAuthority: this.moduleArtifactAuthority,
        modulePlanCompiler: ports.modulePlanCompiler,
        assetCatalog: ports.assetCatalog,
        capabilityRetrieval: this.capabilityRetrieval,
        acceptedBlueprintConfirmation: ports.acceptedBlueprintConfirmation,
        creativeSolutionCompiler: ports.creativeSolutionCompiler,
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

export function finalStateData(final: StateSnapshotLike, authority: ModuleArtifactAuthority): Record<string, unknown> {
  const values = final.values;
  const interrupt = extractInterrupt(final);
  const moduleDeliveryResult = projectModuleDeliveryResult(values, authority);
  const modulePlanHash = isHash(values.modulePlanHash) ? values.modulePlanHash : null;
  return {
    stage: values.stage ?? null,
    intent: values.intent ?? null,
    lastErrorCode: customerErrorCode(values.lastErrorCode),
    buildJobId: values.buildJobId ?? null,
    workspaceId: values.workspaceId ?? null,
    conversationId: values.conversationId ?? null,
    planHash: values.planHash ?? null,
    changePlanId: values.changePlanId ?? null,
    changeRequestId: values.activeChangeRequestId ?? null,
    designPlanHash: values.designPlanHash ?? null,
    designRevision: values.designRevision ?? null,
    clarificationCount: values.clarificationCount ?? null,
    modulePlanHash,
    ...(moduleDeliveryResult === undefined ? {} : { moduleDeliveryResult }),
    ...(interrupt !== undefined ? { interrupt } : {}),
  };
}

function isHash(input: unknown): input is string {
  return typeof input === "string" && /^[0-9a-f]{64}$/.test(input);
}

function customerErrorCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const separator = input.indexOf(":");
  const code = separator === -1 ? input : input.slice(0, separator);
  return CUSTOMER_ERROR_CODES.has(code) ? code : "CONVERSATION_FAILED";
}

function isTechnicalAssistantPayload(content: string): boolean {
  for (const candidate of jsonCandidates(content)) {
    try {
      if (isTechnicalJson(JSON.parse(candidate))) return true;
    } catch { /* prose or incomplete JSON remains normal customer content */ }
  }
  return false;
}

function jsonCandidates(content: string): string[] {
  const bounded = content.slice(0, 50_000).trim();
  const output = new Set<string>([bounded]);
  for (const match of bounded.matchAll(/```(?:json)?\s*\n([\s\S]*?)\n```/gi)) {
    if (match[1] !== undefined) output.add(match[1].trim());
  }
  for (const candidate of balancedJsonValues(bounded, 16)) output.add(candidate);
  return [...output];
}

function isTechnicalJson(value: unknown): boolean {
  if (value === null || typeof value !== "object") return false;
  const pending: Array<{ value: object; depth: number }> = [{ value, depth: 0 }];
  const seen = new Set<object>();
  let visited = 0;
  while (pending.length > 0 && visited < 1_000) {
    const { value: current, depth } = pending.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);
    visited += 1;
    const record = current as Record<string, unknown>;
    const schema = record["schema"];
    if (schema === "kf-module-plan/v1" || schema === "kf-change-plan/v1" || schema === "kf-ui-implementation/v1" || schema === "kf-accepted-blueprint-artifact/v1" || schema === "kf-server-plan-envelope/v1" || schema === "kf-module-compilation-artifact/v1" || schema === "kf-module-compilation-metadata/v1") return true;
    if (typeof record["signature"] === "string" && (record["metadata"] !== undefined || record["semanticOperations"] !== undefined || record["plan"] !== undefined)) return true;
    if (depth >= 20) continue;
    for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(current))) {
      if (!("value" in descriptor)) continue;
      const nested = descriptor.value as unknown;
      if (nested !== null && typeof nested === "object") pending.push({ value: nested, depth: depth + 1 });
    }
  }
  return false;
}

function balancedJsonValues(input: string, limit: number): string[] {
  const output: string[] = [];
  for (let start = 0; start < input.length && output.length < limit; start += 1) {
    const first = input[start];
    if (first !== "{" && first !== "[") continue;
    const stack = [first];
    let inString = false;
    let escaped = false;
    for (let index = start + 1; index < input.length; index += 1) {
      const char = input[index]!;
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') { inString = true; continue; }
      if (char === "{" || char === "[") {
        if (stack.length >= 64) break;
        stack.push(char);
      } else if (char === "}" || char === "]") {
        const opener = stack.pop();
        if ((char === "}" && opener !== "{") || (char === "]" && opener !== "[")) break;
        if (stack.length === 0) {
          output.push(input.slice(start, index + 1));
          break;
        }
      }
    }
  }
  return output;
}

const CUSTOMER_PROGRESS_CODES = new Set([
  "load-context", "classify-intent", "design-plan", "implementation-plan", "module-plan",
  "solution-implementation-plan", "compile-creative-solution",
  "clarify", "plan-change", "enqueue-build", "build", "validate", "preview-review",
]);

function customerProgressFrame(chunk: unknown): { progressCode: string } {
  if (chunk !== null && typeof chunk === "object") {
    const code = Object.keys(chunk).find((key) => CUSTOMER_PROGRESS_CODES.has(key));
    if (code !== undefined) return { progressCode: code };
  }
  return { progressCode: "working" };
}

function apiError(code: string, message: string): { error: { code: string; message: string } } {
  return { error: { code, message } };
}

function disposableSseStream(
  source: AsyncGenerator<unknown>,
  graph: CompiledGraph,
  config: Record<string, unknown>,
  lease: ConversationTurnLease,
  moduleArtifactAuthority: ModuleArtifactAuthority,
): DisposableSseStream {
  let disposal: Promise<void> | undefined;
  let cancellation: Promise<boolean> | undefined;
  let cleanup: Promise<void> | undefined;
  let stalledHandoff: Promise<void> | undefined;
  let activeRead: Promise<IteratorResult<unknown>> | undefined;
  let finalEmitted = false;
  const dispose = (): Promise<void> => {
    const readAtCancellation = activeRead;
    cancellation ??= (async () => {
      const [cancelled] = await Promise.all([
        cancelIterator(source),
        settleActiveRead(readAtCancellation),
      ]);
      return cancelled;
    })();
    cleanup ??= cancellation.then(async (cancelled) => {
      if (cancelled) await lease.dispose();
      else await lease.quarantine();
    });
    stalledHandoff ??= quarantineAfterGrace(
      cancellation,
      cleanup,
      lease,
      SSE_CANCELLATION_GRACE_MS,
    );
    void cleanup.catch(() => {});
    void stalledHandoff.catch(() => {});
    disposal ??= Promise.race([cleanup, stalledHandoff]);
    return disposal;
  };
  return {
    async next() {
      if (disposal !== undefined) return { done: true, value: undefined };
      try {
        if (finalEmitted) {
          await dispose();
          return { done: true, value: undefined };
        }
        const pendingRead = source.next();
        activeRead = pendingRead;
        let next: IteratorResult<unknown>;
        try {
          next = await pendingRead;
        } finally {
          if (activeRead === pendingRead) activeRead = undefined;
        }
        if (disposal !== undefined) return { done: true, value: undefined };
        if (!next.done) {
          return { done: false, value: { event: "state", data: customerProgressFrame(next.value) } };
        }
        const final = (await graph.getState(config)) as unknown as StateSnapshotLike;
        finalEmitted = true;
        return {
          done: false,
          value: { event: "done", data: finalStateData(final, moduleArtifactAuthority) },
        };
      } catch (error) {
        await dispose().catch(() => {});
        throw error;
      }
    },
    async return(value?: unknown) {
      await dispose();
      return { done: true, value } as IteratorReturnResult<SseEvent>;
    },
    async throw(error?: unknown) {
      await dispose().catch(() => {});
      throw error;
    },
    dispose,
    [Symbol.asyncIterator]() {
      return this;
    },
  };
}

async function cancelIterator(iterator: AsyncGenerator<unknown>): Promise<boolean> {
  try {
    const result = await iterator.return(undefined);
    return result.done === true;
  } catch {
    return false;
  }
}

async function settleActiveRead(read: Promise<IteratorResult<unknown>> | undefined): Promise<void> {
  if (read === undefined) return;
  await read.catch(() => {});
}

async function quarantineAfterGrace(
  cancellation: Promise<boolean>,
  cleanup: Promise<void>,
  lease: ConversationTurnLease,
  graceMs: number,
): Promise<void> {
  const STALLED = Symbol("STALLED");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      cancellation,
      new Promise<typeof STALLED>((resolve) => {
        timer = setTimeout(() => resolve(STALLED), graceMs);
      }),
    ]);
    if (result === STALLED) await lease.quarantine();
    else await cleanup;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
