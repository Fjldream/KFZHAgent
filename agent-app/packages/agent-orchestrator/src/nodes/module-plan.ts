import {
  AcceptedBlueprintArtifactSchema,
  AssetRecordSchema,
  ModulePlanSchema,
  canonicalModuleCompilationHash,
  type AssetRecord,
  type ChangePlan,
  type ModuleDeliveryGap,
  type ModulePlan,
} from "@kf/contracts";
import { readVerifiedAcceptedBlueprintArtifact } from "@kf/build-jobs";
import { planHash, type ModulePlanningSummary } from "@kf/domain-client";
import { ModuleCompilationCoordinator } from "../module-compilation-coordinator.js";
import type { ModelPortContext } from "../model-port.js";
import type { SolutionGraphDeps } from "../ports.js";
import { GraphPlanSchema } from "../schemas/change-plan.js";
import type { AgentGraphStateValue, AgentGraphUpdate } from "../state.js";

const MAX_REPAIR_CALLS = 3;
const MAX_ERROR_DETAIL = 480;
const MAX_REJECTION_REASONS = 20;
const MAX_REJECTION_REASON_LENGTH = 300;

/**
 * Converts a confirmed v2 blueprint into a stable ModulePlan, compiles it
 * through the signed artifact coordinator, and persists the resulting
 * server-owned ChangePlan. There is deliberately no customer-facing technical
 * approval: success is authorized by graph routing and goes straight to the
 * preview build queue.
 */
export function createModulePlanNode(deps: SolutionGraphDeps) {
  return async (state: AgentGraphStateValue): Promise<AgentGraphUpdate> => {
    if (state.designPlan?.schema !== "kf-design-plan/v2" || state.designPlanHash === undefined) {
      return fail("MODULE_BLUEPRINT_NOT_CONFIRMED", state);
    }
    const unmappedBlueprintModules = state.designPlan.modules.filter((module) => module.expectedKind === undefined).map((module) => module.id).sort(compareCodePoints);
    if (unmappedBlueprintModules.length > 0) {
      await appendQuestion(deps, state, `当前效果蓝图还没有绑定可实施的 KF 模块：${unmappedBlueprintModules.join("、")}。请先补充模块映射后再确认生成，不会降级为旧的逐控件计划。`);
      return { stage: waitingStage(state), lastErrorCode: `MODULE_BLUEPRINT_MAPPING_REQUIRED:${unmappedBlueprintModules.join(",").slice(0, MAX_ERROR_DETAIL)}`, moduleRepairAttempt: 0, buildAuthorization: undefined, resumeAction: undefined };
    }
    if (state.currentRevisionId === undefined) return fail("MODULE_BASE_REVISION_REQUIRED", state);
    if (deps.acceptedBlueprintConfirmation === undefined) return fail("ACCEPTED_BLUEPRINT_CONFIRMATION_NOT_CONFIGURED", state);
    if (deps.moduleArtifactAuthority === undefined) return fail("MODULE_ARTIFACT_AUTHORITY_NOT_CONFIGURED", state);
    if (deps.modulePlanCompiler === undefined) return fail("MODULE_COMPILER_NOT_CONFIGURED", state);
    if (deps.assetCatalog === undefined) return fail("ASSET_CATALOG_NOT_CONFIGURED", state);
    if (deps.uiImplementationCompiler === undefined) return fail("IMPLEMENTATION_COMPILER_NOT_CONFIGURED", state);
    if (deps.serverPlanSigner === undefined) return fail("SERVER_PLAN_SIGNER_NOT_CONFIGURED", state);

    const projectKey = deps.defaultProjectKey ?? deps.defaultDomainKind ?? "kingclient";
    let acceptedBlueprintArtifact;
    try {
      acceptedBlueprintArtifact = AcceptedBlueprintArtifactSchema.parse(
        await deps.acceptedBlueprintConfirmation.confirm({
          blueprint: state.designPlan,
          projectKey,
          revisionId: state.currentRevisionId,
        }),
      );
    } catch (error) {
      return fail(`ACCEPTED_BLUEPRINT_CONFIRMATION_FAILED:${errorDetail(error)}`, state);
    }

    let accepted;
    try {
      accepted = deps.moduleArtifactAuthority.verifyAcceptedBlueprint(acceptedBlueprintArtifact, {
        projectKey,
        revisionId: state.currentRevisionId,
        blueprintHash: canonicalModuleCompilationHash(state.designPlan),
      });
    } catch (error) {
      return fail(`ACCEPTED_BLUEPRINT_VERIFICATION_FAILED:${errorDetail(error)}`, state);
    }
    const acceptedFacts = readVerifiedAcceptedBlueprintArtifact(accepted);

    let planningCatalog;
    let assets: readonly AssetRecord[];
    try {
      const [rawCatalog, rawAssets] = await Promise.all([
        deps.modulePlanCompiler.listPlanningCatalog(),
        deps.assetCatalog.list({ tenantId: state.tenantId, workspaceId: state.workspaceId }),
      ]);
      planningCatalog = validatePlanningCatalog(rawCatalog);
      assets = AssetRecordSchema.array().max(100).parse(rawAssets);
    } catch (error) {
      return fail(`MODULE_CONTEXT_LOAD_FAILED:${errorDetail(error)}`, state);
    }
    if (planningCatalog.length === 0) {
      await appendQuestion(deps, state, "当前还没有通过真实 KF 运行态验收的稳定模块，暂时不能自动生成工程。请先完成模块验收并将对应版本提升为稳定状态。");
      return { stage: waitingStage(state), lastErrorCode: "MODULE_STABLE_CATALOG_EMPTY", moduleRepairAttempt: 0, buildAuthorization: undefined, resumeAction: undefined };
    }
    const stableKinds = new Set(planningCatalog.map((entry) => entry.kind));
    const unavailableKinds = [...new Set(acceptedFacts.modules.map((entry) => entry.expectedKind).filter((kind) => !stableKinds.has(kind)))].sort(compareCodePoints);
    if (unavailableKinds.length > 0) {
      const detail = unavailableKinds.join(",").slice(0, MAX_ERROR_DETAIL);
      await appendQuestion(deps, state, `当前蓝图需要的模块尚未通过稳定验收：${unavailableKinds.join("、")}。请更换为已支持方案，或先完成这些模块的 KF 运行态验收。`);
      return { stage: waitingStage(state), lastErrorCode: `MODULE_STABLE_CAPABILITY_UNAVAILABLE:${detail}`, moduleRepairAttempt: 0, buildAuthorization: undefined, resumeAction: undefined };
    }

    const hasPriorPlan = state.modulePlan !== undefined;
    const hasPriorImplementation = state.uiImplementation !== undefined;
    const hasPriorArtifact = state.moduleCompilationArtifact !== undefined;
    if (hasPriorPlan !== hasPriorImplementation || hasPriorPlan !== hasPriorArtifact) {
      return fail("MODULE_REVISION_CHECKPOINT_INCOMPLETE", state);
    }
    if (state.modulePlan !== undefined && (
      state.modulePlanHash !== canonicalModuleCompilationHash(state.modulePlan)
      || state.uiImplementationHash !== canonicalModuleCompilationHash(state.uiImplementation)
    )) {
      return fail("MODULE_REVISION_CHECKPOINT_HASH_MISMATCH", state);
    }
    const editableEntities = await deps.workspaceQuery.getRevisionEntities({
      tenantId: state.tenantId,
      revisionId: state.currentRevisionId,
      workspaceId: state.workspaceId,
    });
    const baseContext: ModelPortContext = {
      tenantId: state.tenantId,
      userId: state.userId,
      workspaceId: state.workspaceId,
      conversationId: state.conversationId,
      recentMessages: state.recentMessages,
      conversationSummary: state.conversationSummary,
      revisionSummary: state.revisionSummary,
      currentRevisionId: state.currentRevisionId,
      currentProjectKey: projectKey,
      requirementText: latestUserMessage(state),
      confirmedBlueprint: state.designPlan,
      acceptedBlueprintArtifact: accepted,
      modulePlanningCatalog: planningCatalog,
      assetCatalog: assets,
      ...(state.modulePlan === undefined ? {} : { previousModulePlan: state.modulePlan }),
    };

    let candidate: ModulePlan;
    try {
      const raw = state.modulePlan === undefined
        ? await deps.modelPort.createModulePlan(baseContext)
        : await deps.modelPort.reviseModulePlan(baseContext);
      candidate = parseAndPreservePlan(raw, assets, state.modulePlan);
      assertPlanUsesStableCatalog(candidate, planningCatalog);
    } catch (error) {
      return fail(`MODULE_PLAN_INVALID:${errorDetail(error)}`, state);
    }

    const coordinator = new ModuleCompilationCoordinator(
      deps.moduleArtifactAuthority,
      deps.modulePlanCompiler,
      deps.uiImplementationCompiler,
    );
    let repairAttempt = 0;
    for (;;) {
      let coordinated;
      try {
        coordinated = await coordinator.compile({
          projectKey,
          revisionId: state.currentRevisionId,
          acceptedBlueprintHash: acceptedBlueprintArtifact.blueprintHash,
          acceptedBlueprintArtifact,
          plan: candidate,
          workspaceId: state.workspaceId,
          editableEntities,
          ...(state.modulePlan === undefined ? {} : { previousPlan: state.modulePlan }),
          ...(state.uiImplementation === undefined ? {} : { previousImplementation: state.uiImplementation }),
          ...(state.moduleCompilationArtifact === undefined ? {} : { previousCompilationArtifact: state.moduleCompilationArtifact }),
        });
      } catch (error) {
        return fail(`MODULE_COMPILATION_FAILED:${errorDetail(error)}`, state, repairAttempt);
      }

      if (coordinated.status === "compiled") {
        if (coordinated.outcome.deliveryReport === undefined || coordinated.outcome.deliveryReport.status === "blocked") {
          return fail("MODULE_DELIVERY_REPORT_MISSING", state, repairAttempt);
        }
        const parsedPlan = GraphPlanSchema.safeParse(coordinated.uiCompilation.plan);
        if (!parsedPlan.success || parsedPlan.data.operations.length === 0) {
          return fail("MODULE_CHANGE_PLAN_INVALID", state, repairAttempt);
        }
        return persistSuccessfulCompilation({
          deps,
          state,
          plan: candidate,
          acceptedBlueprintArtifact,
          moduleCompilationArtifact: coordinated.moduleCompilationArtifact,
          implementation: coordinated.outcome.implementation,
          deliveryReport: coordinated.outcome.deliveryReport,
          compiledPlan: parsedPlan.data,
          capabilityReport: coordinated.uiCompilation.capabilityReport,
          semanticOperations: coordinated.uiCompilation.semanticOperations ?? [],
          repairAttempt,
        });
      }

      const reasons = rejectionReasons(coordinated.outcome.gaps);
      if (hasMissingUserAsset(coordinated.outcome.gaps)) {
        await appendQuestion(deps, state, `生成工程还缺少客户资源：${reasons.join("；")}。请上传或选择对应图片/图标后，我会从当前蓝图继续生成。`);
        return {
          acceptedBlueprintArtifact,
          moduleDeliveryReport: coordinated.outcome.deliveryReport,
          moduleRepairAttempt: repairAttempt,
          stage: waitingStage(state),
          lastErrorCode: `MODULE_ASSET_REQUIRED:${reasons.join(";").slice(0, MAX_ERROR_DETAIL)}`,
          buildAuthorization: undefined,
          resumeAction: undefined,
        };
      }
      if (repairAttempt >= MAX_REPAIR_CALLS) {
        return {
          acceptedBlueprintArtifact,
          moduleDeliveryReport: coordinated.outcome.deliveryReport,
          moduleRepairAttempt: MAX_REPAIR_CALLS,
          stage: "idle",
          lastErrorCode: `MODULE_PLAN_REPAIR_EXHAUSTED:${reasons.join(";").slice(0, MAX_ERROR_DETAIL)}`,
          buildAuthorization: undefined,
          resumeAction: undefined,
        };
      }
      repairAttempt += 1;
      try {
        const raw = await deps.modelPort.reviseModulePlan({
          ...baseContext,
          previousModulePlan: candidate,
          modulePlanRejectionReasons: reasons,
        });
        candidate = parseAndPreservePlan(raw, assets, candidate);
        assertPlanUsesStableCatalog(candidate, planningCatalog);
      } catch (error) {
        return fail(`MODULE_PLAN_REPAIR_FAILED:${errorDetail(error)}`, state, repairAttempt);
      }
    }
  };
}

async function persistSuccessfulCompilation(input: {
  deps: SolutionGraphDeps;
  state: AgentGraphStateValue;
  plan: ModulePlan;
  acceptedBlueprintArtifact: NonNullable<AgentGraphStateValue["acceptedBlueprintArtifact"]>;
  moduleCompilationArtifact: NonNullable<AgentGraphStateValue["moduleCompilationArtifact"]>;
  implementation: NonNullable<AgentGraphStateValue["uiImplementation"]>;
  deliveryReport: NonNullable<AgentGraphStateValue["moduleDeliveryReport"]>;
  compiledPlan: ChangePlan;
  capabilityReport: NonNullable<AgentGraphStateValue["capabilityReport"]>;
  semanticOperations: Parameters<NonNullable<SolutionGraphDeps["serverPlanSigner"]>["sign"]>[0]["semanticOperations"];
  repairAttempt: number;
}): Promise<AgentGraphUpdate> {
  const { deps, state } = input;
  if (deps.serverPlanSigner === undefined || state.currentRevisionId === undefined) throw new Error("MODULE_PERSISTENCE_NOT_CONFIGURED");
  const hash = planHash(input.compiledPlan);
  const existing = await deps.changePlanRepository.findOpenChangeRequest({ tenantId: state.tenantId, workspaceId: state.workspaceId, conversationId: state.conversationId });
  const changeRequestId = existing?.id ?? `cr:${state.workspaceId}:${state.conversationId}`;
  await deps.changePlanRepository.saveChangeRequest({ id: changeRequestId, tenantId: state.tenantId, workspaceId: state.workspaceId, title: `模块工程 ${hash.slice(0, 8)}`, status: "OPEN" });
  const changePlanId = `plan:${state.workspaceId}:${hash}`;
  await deps.changePlanRepository.savePlan({
    id: changePlanId,
    tenantId: state.tenantId,
    workspaceId: state.workspaceId,
    changeRequestId,
    planHash: hash,
    plan: deps.serverPlanSigner.sign({ plan: input.compiledPlan, revisionId: state.currentRevisionId, semanticOperations: input.semanticOperations }),
  });
  let diffArtifactId: string | undefined;
  let previewArtifactId: string | undefined;
  if (deps.planArtifacts !== undefined) {
    const refs = await deps.planArtifacts.create({ tenantId: state.tenantId, workspaceId: state.workspaceId, changePlanId, plan: input.compiledPlan, baseRevisionId: state.currentRevisionId });
    diffArtifactId = refs.diffArtifactId;
    previewArtifactId = refs.previewArtifactId;
  }
  return {
    acceptedBlueprintArtifact: input.acceptedBlueprintArtifact,
    modulePlan: input.plan,
    modulePlanHash: canonicalModuleCompilationHash(input.plan),
    moduleCompilationArtifact: input.moduleCompilationArtifact,
    moduleDeliveryReport: input.deliveryReport,
    moduleRepairAttempt: input.repairAttempt,
    uiImplementation: input.implementation,
    uiImplementationHash: canonicalModuleCompilationHash(input.implementation),
    capabilityReport: input.capabilityReport,
    changePlanId,
    planHash: hash,
    activeChangeRequestId: changeRequestId,
    planSummary: `模块工程计划：${input.plan.pages.reduce((count, page) => count + page.modules.length, 0)} 个模块，${input.compiledPlan.operations.length} 项变更`,
    diffArtifactId,
    previewArtifactId,
    stage: "building",
    buildAuthorization: state.stage === "preview-review" ? "preview-feedback" : "confirmed-blueprint",
    resumeAction: undefined,
    lastErrorCode: undefined,
  };
}

function parseAndPreservePlan(raw: unknown, assets: readonly AssetRecord[], previous: ModulePlan | undefined): ModulePlan {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw new Error("module plan must be an object");
  const rawRecord = shallowDataRecord(raw, "module plan");
  if (previous === undefined) return ModulePlanSchema.parse({ ...rawRecord, assets: [...assets] });
  const rawPages = rawRecord["pages"];
  const rawOperations = rawRecord["operations"];
  if (!Array.isArray(rawPages) || !Array.isArray(rawOperations)) throw new Error("module plan pages and operations must be arrays");
  const pages: Array<Record<string, unknown> & { modules: unknown[] }> = rawPages.map((page, index) => {
    const pageRecord = shallowDataRecord(page, `module plan page ${index}`);
    if (!Array.isArray(pageRecord["modules"])) throw new Error(`module plan page ${index} modules must be an array`);
    return { ...pageRecord, modules: [...(pageRecord["modules"] as unknown[])] };
  });
  const presentIds = new Set(pages.flatMap((page) => page.modules.flatMap((module) => {
    if (module === null || typeof module !== "object" || Array.isArray(module)) return [];
    const descriptor = Object.getOwnPropertyDescriptor(module, "id");
    return descriptor !== undefined && "value" in descriptor && typeof descriptor.value === "string" ? [descriptor.value] : [];
  })));
  const removals = new Set(rawOperations.flatMap((operation) => {
    if (operation === null || typeof operation !== "object" || Array.isArray(operation)) return [];
    const op = Object.getOwnPropertyDescriptor(operation, "op");
    const pageId = Object.getOwnPropertyDescriptor(operation, "pageId");
    const moduleId = Object.getOwnPropertyDescriptor(operation, "moduleId");
    return op !== undefined && "value" in op && op.value === "remove"
      && pageId !== undefined && "value" in pageId && typeof pageId.value === "string"
      && moduleId !== undefined && "value" in moduleId && typeof moduleId.value === "string"
      ? [`${pageId.value}\u0000${moduleId.value}`]
      : [];
  }));
  const byId = new Map<string, (typeof pages)[number]>();
  for (const page of pages) {
    if (typeof page["id"] === "string") byId.set(page["id"], page);
  }
  for (const previousPage of previous.pages) {
    const missing = previousPage.modules.filter((module) => !presentIds.has(module.id) && !removals.has(`${previousPage.id}\u0000${module.id}`));
    if (missing.length === 0) continue;
    const target = byId.get(previousPage.id);
    if (target === undefined) {
      const restored = { ...previousPage, modules: [...missing] };
      pages.push(restored);
      byId.set(restored.id, restored);
    } else {
      target.modules.push(...missing);
    }
  }
  return ModulePlanSchema.parse({ ...rawRecord, assets: [...assets], pages });
}

function shallowDataRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value) || Reflect.getPrototypeOf(value) !== Object.prototype) throw new Error(`${label} must be a plain object`);
  const copy: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string" || key === "__proto__" || key === "prototype" || key === "constructor") throw new Error(`${label} has an unsafe key`);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) throw new Error(`${label} has an unsafe property`);
    copy[key] = descriptor.value;
  }
  return copy;
}

function validatePlanningCatalog(raw: readonly ModulePlanningSummary[]): readonly ModulePlanningSummary[] {
  if (raw.length > 100) throw new Error("stable module catalog exceeds bound");
  const keys = new Set<string>();
  for (const entry of raw) {
    if (entry.maturity !== "stable") throw new Error("non-stable module leaked into planning catalog");
    const key = `${entry.kind}\u0000${entry.version}`;
    if (keys.has(key)) throw new Error("duplicate stable module catalog entry");
    keys.add(key);
  }
  return raw;
}

function assertPlanUsesStableCatalog(plan: ModulePlan, catalog: readonly ModulePlanningSummary[]): void {
  const entries = new Map(catalog.map((entry) => [`${entry.kind}\u0000${entry.version}`, entry]));
  for (const page of plan.pages) {
    for (const module of page.modules) {
      const entry = entries.get(`${module.kind}\u0000${module.templateVersion}`);
      if (entry === undefined || !entry.variants.includes(module.variant)) {
        throw new Error(`module is not in stable planning catalog: ${module.kind}@${module.templateVersion}/${module.variant}`);
      }
    }
  }
}

function rejectionReasons(gaps: readonly ModuleDeliveryGap[]): string[] {
  return [...gaps]
    .filter((gap) => gap.status === "unresolved")
    .sort((left, right) => compareCodePoints(`${left.moduleId}\u0000${left.requirement}\u0000${left.reason}`, `${right.moduleId}\u0000${right.requirement}\u0000${right.reason}`))
    .slice(0, MAX_REJECTION_REASONS)
    .map((gap) => `${gap.moduleId}: ${gap.requirement} — ${gap.reason}`.slice(0, MAX_REJECTION_REASON_LENGTH));
}

function hasMissingUserAsset(gaps: readonly ModuleDeliveryGap[]): boolean {
  return gaps.some((gap) => gap.status === "unresolved" && gap.severity === "blocking" && /asset|resource|image|portrait|icon|资源|图片|头像|图标/i.test(`${gap.requirement} ${gap.reason}`));
}

function waitingStage(state: AgentGraphStateValue): "preview-review" | "design-review" {
  return state.stage === "preview-review" ? "preview-review" : "design-review";
}

function fail(code: string, _state: AgentGraphStateValue, repairAttempt = 0): AgentGraphUpdate {
  return { stage: "idle", lastErrorCode: code.slice(0, MAX_ERROR_DETAIL + 40), moduleRepairAttempt: repairAttempt, buildAuthorization: undefined, resumeAction: undefined };
}

function errorDetail(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return [...raw].map((character) => character.charCodeAt(0) < 0x20 ? " " : character).join("").slice(0, MAX_ERROR_DETAIL);
}

async function appendQuestion(deps: SolutionGraphDeps, state: AgentGraphStateValue, content: string): Promise<void> {
  await deps.workspaceQuery.appendMessage({ tenantId: state.tenantId, conversationId: state.conversationId, role: "assistant", content });
}

function latestUserMessage(state: AgentGraphStateValue): string | undefined {
  for (let index = state.recentMessages.length - 1; index >= 0; index -= 1) {
    const message = state.recentMessages[index];
    if (message?.role === "user") return message.content;
  }
  return undefined;
}

function compareCodePoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
