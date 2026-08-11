import type { EnqueueBuildInput, ModuleArtifactAuthority, VerifiedAcceptedBlueprintArtifact, VerifiedModuleCompilationArtifact } from "@kf/build-jobs";
import type { ModuleCompilationOutcome, ModulePlanningSummary } from "@kf/domain-client";
import type { BuildJobStatus } from "@kf/build-jobs";
import type {
  CapabilityReport,
  ChangePlan,
  InternalChangePlan,
  ServerPlanEnvelope,
  TrustedSemanticOperationInput,
  UIImplementationSpec,
  AcceptedBlueprintArtifact,
  CustomerEffectBlueprint,
} from "@kf/contracts";
import type { ModelPort } from "./model-port.js";
import type { GraphMessage } from "./state.js";

/**
 * Ports consumed by the solution graph (brief "Consumes" line):
 *   - workspace query port: conversations, messages, revision summaries.
 *   - change-plan repository: change requests and change plans.
 *   - build-job port: enqueue and inspect durable build jobs.
 *
 * Ports keep the graph free of direct Prisma access so unit tests run against
 * in-memory fakes and only the checkpoint integration test touches Postgres.
 */

export type { BuildJobStatus, EnqueueBuildInput } from "@kf/build-jobs";

export interface ListRecentMessagesInput {
  tenantId: string;
  conversationId: string;
  limit: number;
}

/**
 * A model-editable entity of the current revision. Fed to the ModelPort so a
 * real LLM can reference exact KF GUIDs instead of hallucinating them.
 * (compile-mode GUIDs are deterministic: deriveGuid({ seed: workspaceId }, id).)
 */
export interface EditableEntity {
  kind: "control" | "page" | "variable";
  /** Semantic id: control id / page name / variable name. */
  name: string;
  /** Control type (text/button/inputnumber) or "page"/"variable". */
  type: string;
  /** KF GUID the change plan must reference. */
  guid: string;
  /** Current control geometry, when the entity is a control. */
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface AppendMessageInput {
  tenantId: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
}

export interface WorkspaceQueryPort {
  /** Last `limit` messages of the conversation, oldest first. */
  listRecentMessages(input: ListRecentMessagesInput): Promise<GraphMessage[]>;
  /** Persists one message; the graph appends assistant replies. */
  appendMessage(input: AppendMessageInput): Promise<void>;
  getConversationSummary(input: {
    tenantId: string;
    conversationId: string;
  }): Promise<string | undefined>;
  /** Overwrite-style summary write; the graph recomputes the full string so it is idempotent. */
  setConversationSummary(input: {
    tenantId: string;
    conversationId: string;
    summary: string;
  }): Promise<void>;
  getCurrentRevisionId(input: {
    tenantId: string;
    workspaceId: string;
  }): Promise<string | undefined>;
  /** Bounded, model-safe summary of a revision (never the full JSON). */
  getRevisionSummary(input: {
    tenantId: string;
    revisionId: string;
  }): Promise<string | undefined>;
  /** Model-editable entities of a revision (controls/pages/variables with KF GUIDs). */
  getRevisionEntities(input: {
    tenantId: string;
    revisionId: string;
    workspaceId: string;
  }): Promise<EditableEntity[]>;
}

export interface OpenChangeRequest {
  id: string;
  changePlanId?: string;
  planHash?: string;
}

export interface SaveChangeRequestInput {
  id: string;
  tenantId: string;
  workspaceId: string;
  title: string;
  status: string;
}

export interface SavePlanInput {
  id: string;
  tenantId: string;
  workspaceId: string;
  changeRequestId: string;
  planHash: string;
  /** Model-safe plans or server-owned persisted envelopes; internal envelopes never reach the model. */
  plan: ChangePlan | InternalChangePlan | ServerPlanEnvelope;
}

export interface ChangePlanRepository {
  findOpenChangeRequest(input: {
    tenantId: string;
    workspaceId: string;
    conversationId: string;
  }): Promise<OpenChangeRequest | null>;
  saveChangeRequest(input: SaveChangeRequestInput): Promise<void>;
  savePlan(input: SavePlanInput): Promise<void>;
  loadPlanHash(input: { tenantId: string; changePlanId: string }): Promise<string | undefined>;
  setChangeRequestStatus(input: {
    tenantId: string;
    changeRequestId: string;
    status: string;
  }): Promise<void>;
}

export interface BuildJobInfo {
  id: string;
  status: BuildJobStatus;
}

export interface BuildJobPort {
  enqueue(input: EnqueueBuildInput): Promise<BuildJobInfo>;
  getJob(input: { tenantId: string; jobId: string }): Promise<BuildJobInfo | null>;
}

export interface PlanArtifactsInput {
  tenantId: string;
  workspaceId: string;
  changePlanId: string;
  plan: ChangePlan;
  baseRevisionId?: string;
}

export interface PlanArtifactRefs {
  diffArtifactId?: string;
  previewArtifactId?: string;
}

/**
 * Optional artifact pipeline that renders a diff artifact and a visual preview
 * for the plan. Not wired in this task (Task 11); when absent the approval
 * interrupt carries no artifact ids.
 */
export interface PlanArtifactsPort {
  create(input: PlanArtifactsInput): Promise<PlanArtifactRefs>;
}

export interface UiImplementationCompilerInput {
  workspaceId: string;
  spec: UIImplementationSpec;
  /** Last confirmed implementation, allowing the compiler to emit local deltas. */
  previousSpec?: UIImplementationSpec;
  /** Verified current module compilation; required for every module-owned component. */
  moduleCompilationArtifact?: VerifiedModuleCompilationArtifact;
  editableEntities: EditableEntity[];
}

/** Domain-owned deterministic implementation boundary; the model never emits ChangePlan here. */
export interface UiImplementationCompilerPort {
  compile(input: UiImplementationCompilerInput): Promise<{
    plan: InternalChangePlan;
    capabilityReport: CapabilityReport;
    semanticOperations?: readonly TrustedSemanticOperationInput[];
  }>;
}

/** Deterministic module compiler boundary. Registry/assets remain server-owned behind the port. */
export interface ModulePlanCompilerPort {
  /** Stable-only, bounded summaries. Beta/unsupported definitions never cross this boundary. */
  listPlanningCatalog(): Promise<readonly ModulePlanningSummary[]>;
  compile(input: {
    tenantId: string;
    workspaceId: string;
    plan: import("@kf/contracts").ModulePlan;
    acceptedBlueprintArtifact: VerifiedAcceptedBlueprintArtifact;
    previousCompilationArtifact?: VerifiedModuleCompilationArtifact;
    previousPlan?: import("@kf/contracts").ModulePlan;
    previousImplementation?: UIImplementationSpec;
  }): Promise<ModuleCompilationOutcome>;
}

/** Tenant/workspace-scoped model-safe asset metadata. Never returns storage keys or paths. */
export interface AssetCatalogPort {
  list(input: { tenantId: string; workspaceId: string }): Promise<readonly import("@kf/contracts").AssetRecord[]>;
}

/** API-owned confirmation boundary; model fields are inputs, never signing authority. */
export interface AcceptedBlueprintConfirmationPort {
  confirm(input: {
    blueprint: CustomerEffectBlueprint;
    projectKey: string;
    revisionId: string;
  }): Promise<AcceptedBlueprintArtifact>;
}

/** Server-only authority port. Implementations hold the HMAC key outside graph state. */
export interface ServerPlanSignerPort {
  sign(input: {
    plan: InternalChangePlan;
    revisionId: string;
    semanticOperations: readonly TrustedSemanticOperationInput[];
  }): ServerPlanEnvelope;
}

/**
 * All dependencies the solution graph needs. The graph owns no persistence of
 * its own: every side effect flows through these ports so the graph itself
 * stays deterministic and resumable.
 */
export interface SolutionGraphDeps {
  modelPort: ModelPort;
  workspaceQuery: WorkspaceQueryPort;
  changePlanRepository: ChangePlanRepository;
  buildJobPort: BuildJobPort;
  planArtifacts?: PlanArtifactsPort;
  /** Present for domains whose confirmed blueprints can compile through an implementation spec. */
  uiImplementationCompiler?: UiImplementationCompilerPort;
  /** Required before any internal semantic envelope may be persisted. */
  serverPlanSigner?: ServerPlanSignerPort;
  /** Same server key as ServerPlanSigner, domain-separated by the artifact authority. */
  moduleArtifactAuthority?: ModuleArtifactAuthority;
  /** Reserved module-generation execution port; Task 10 can wire it without changing checkpoint state. */
  modulePlanCompiler?: ModulePlanCompilerPort;
  assetCatalog?: AssetCatalogPort;
  acceptedBlueprintConfirmation?: AcceptedBlueprintConfirmationPort;
  /** Domain support predicate (DomainRegistry-backed in production). */
  isDomainSupported: (domain: string) => boolean;
  /** Domain used when enqueueing a build (defaults to the KF client domain). */
  defaultDomainKind?: string;
  /** Stable project identity used with the default domain (defaults to domain kind). */
  defaultProjectKey?: string;
}
