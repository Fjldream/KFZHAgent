// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
// 会话查询与 worker 图依赖装配；执行只由持久化 Run worker 发起。
import {
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  compileSolutionGraph,
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  decodeBlueprintConfirmation,
  // end
  type SolutionGraphDeps,
  // modified by jinlong.feng at 2026-10-20 Agent工作台迭代
  type RunStepMemo,
  // end
} from "@kf/agent-orchestrator";
import type { Conversation, Message } from "@prisma/client";
import type { ArtifactStorage } from "@kf/artifact-storage";
import pg from "pg";
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
import { DeliverySnapshotService } from "../delivery/delivery-snapshot.service.js";
import {
  CONVERSATION_TURN_LEASE,
  type ConversationTurnLease,
  type ConversationTurnLeasePort,
} from "./conversation-turn-lease.js";

type CompiledGraph = ReturnType<typeof compileSolutionGraph>;

const DEFAULT_CONVERSATION_TITLE = "New conversation";
@Injectable()
export class ConversationService {
  // modified by jinlong.feng at 2026-10-20 Agent工作台迭代
  private readonly runMemos = new Map<string, RunStepMemo>();

  acquireRunTurn(conversationId: string): Promise<ConversationTurnLease> {
    return this.turnLeases.acquire(conversationId);
  }

  registerRunMemo(runId: string, memo: RunStepMemo): () => void {
    if (this.runMemos.has(runId)) throw new Error("RUN_MEMO_ALREADY_REGISTERED");
    this.runMemos.set(runId, memo);
    return () => { this.runMemos.delete(runId); };
  }
  // end
  #graph: CompiledGraph | undefined;

  constructor(
    private readonly prisma: PrismaService,
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
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    const createdAt = new Date();
    const explicitTitle = typeof title === "string" && title.trim().length > 0;
    return this.prisma.conversation.create({
      data: { tenantId, workspaceId, title: cleanTitle, createdAt,
        updatedAt: explicitTitle ? new Date(createdAt.getTime() + 1) : createdAt },
    });
    // end
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
      // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      // end
    });
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    return rows.map(sanitizeConversationMessage);
    // end
  }

  async getDelivery(tenantId: string, conversationId: string, expectedBuildJobId?: string): Promise<import("../delivery/delivery-snapshot.service.js").PersistedDeliverySnapshot | null> {
    return this.deliverySnapshots.getForConversation(tenantId, conversationId, expectedBuildJobId);
  }

  /**
   * 编译后的解决方案图（懒加载、进程内复用）。
   * 公开给 worker 复用同一套 deps 与 checkpointer，避免第二份图定义产生两套事实。
   */
  async getGraph(): Promise<CompiledGraph> {
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
        // modified by jinlong.feng at 2026-10-20 Agent工作台迭代
        resolveRunStepMemo: runId => this.runMemos.get(runId),
        // end
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

// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
export function sanitizeConversationMessage<T extends { role: string; content: string }>(row: T): T {
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  // Read projections and fork copies retain a readable record, never an old control receipt.
  // The stored source Message/action used by the actual executor is not modified here.
  if (row.role === "user") {
    const content = row.content.trim();
    if (decodeBlueprintConfirmation(content)) {
      return { ...row, content: "已记录蓝图确认。后续新操作仍需独立确认当前方案。" };
    }
    if (/^(?:vref1|vbpr1|vcont1|veng1):[a-f0-9]{64}:[a-f0-9]{64}$/.test(content)) {
      return { ...row, content: "已记录流程确认。历史记录不授予新一轮确认或外发权限。" };
    }
  }
  // end
  return row.role === "assistant" && isTechnicalAssistantPayload(row.content)
    ? { ...row, content: "工程正在按已确认的效果蓝图生成，技术实施细节由系统自动校验。" }
    : row;
}
// end

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
// end
