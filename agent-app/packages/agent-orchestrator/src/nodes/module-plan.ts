import {
  AcceptedBlueprintArtifactSchema,
  AssetRecordSchema,
  ModulePlanSchema,
  canonicalModuleCompilationHash,
  type AssetRecord,
  type ChangePlan,
  type ModuleDeliveryGap,
  type ModulePlan,
  type ModulePlanOperation,
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
      candidate = parseAndPreservePlan(raw, assets, state.modulePlan, state.modulePlan, new Set(acceptedFacts.modules.map((entry) => entry.blueprintModuleId)));
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
        candidate = parseAndPreservePlan(raw, assets, candidate, state.modulePlan, new Set(acceptedFacts.modules.map((entry) => entry.blueprintModuleId)));
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

function parseAndPreservePlan(raw: unknown, assets: readonly AssetRecord[], previous: ModulePlan | undefined, revisionBase: ModulePlan | undefined, acceptedIds: ReadonlySet<string>): ModulePlan {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throw new Error("module plan must be an object");
  const rawRecord = shallowDataRecord(raw, "module plan");
  if (previous === undefined) return ModulePlanSchema.parse({ ...rawRecord, assets: [...assets], operations: [] });
  const rawPages = rawRecord["pages"];
  const rawOperations = rawRecord["operations"];
  if (!Array.isArray(rawPages) || !Array.isArray(rawOperations)) throw new Error("module plan pages and operations must be arrays");
  const pages: Array<Record<string, unknown> & { modules: unknown[] }> = rawPages.map((page, index) => {
    const pageRecord = shallowDataRecord(page, `module plan page ${index}`);
    if (!Array.isArray(pageRecord["modules"])) throw new Error(`module plan page ${index} modules must be an array`);
    return { ...pageRecord, modules: [...(pageRecord["modules"] as unknown[])] };
  });
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
  const explicitAdds = new Set(rawOperations.flatMap((operation) => {
    if (operation === null || typeof operation !== "object" || Array.isArray(operation)) return [];
    const record = operation as Record<string, unknown>;
    const module = record["module"];
    const pageId = record["pageId"];
    const moduleId = module !== null && typeof module === "object" && !Array.isArray(module)
      ? (module as Record<string, unknown>)["id"] : undefined;
    return record["op"] === "add" && typeof pageId === "string"
      && module !== null && typeof module === "object" && !Array.isArray(module)
      && typeof moduleId === "string"
      ? [`${pageId}\u0000${moduleId}`]
      : [];
  }));
  const candidatePages = new Map(pages.flatMap((page) => typeof page["id"] === "string" ? [[page["id"], page] as const] : []));
  const rebuilt = previous.pages.map((previousPage) => {
    const candidatePage = candidatePages.get(previousPage.id);
    const candidateModules = new Map((candidatePage?.modules ?? []).flatMap((value) => {
      if (value === null || typeof value !== "object" || Array.isArray(value)) return [];
      const id = Object.getOwnPropertyDescriptor(value, "id");
      return id !== undefined && "value" in id && typeof id.value === "string" ? [[id.value, value] as const] : [];
    }));
    const existingIds = new Set(previousPage.modules.map((module) => module.id));
    const modules: unknown[] = previousPage.modules.flatMap((module) => removals.has(`${previousPage.id}\u0000${module.id}`)
      ? [] : [candidateModules.get(module.id) ?? module]);
    const additions = [...candidateModules.entries()].filter(([id]) => !existingIds.has(id)).map(([id, value]) => {
      if (!explicitAdds.has(`${previousPage.id}\u0000${id}`)) throw new Error(`new module requires explicit add operation: ${id}`);
      return value;
    }).sort((left, right) => {
      const a = left as { placement?: { order?: number }; id?: string }; const b = right as { placement?: { order?: number }; id?: string };
      return (a.placement?.order ?? 0) - (b.placement?.order ?? 0) || compareCodePoints(a.id ?? "", b.id ?? "");
    });
    for (const addition of additions) {
      const order = (addition as { placement?: { order?: number } }).placement?.order ?? modules.length;
      modules.splice(Math.max(0, Math.min(order, modules.length)), 0, addition);
    }
    return { ...(candidatePage ?? previousPage), id: previousPage.id, modules };
  });
  const snapshot = ModulePlanSchema.parse({ ...rawRecord, assets: [...assets], pages: rebuilt, operations: [] });
  const operations = revisionBase === undefined ? [] : deriveOperations(revisionBase, snapshot, acceptedIds);
  return ModulePlanSchema.parse({ ...snapshot, operations });
}

function deriveOperations(previous: ModulePlan, current: ModulePlan, acceptedIds: ReadonlySet<string>): ModulePlanOperation[] {
  if (canonicalModuleCompilationHash(previous.theme) !== canonicalModuleCompilationHash(current.theme)) throw new Error("unsupported theme change");
  const previousPages = new Map(previous.pages.map((page) => [page.id, page]));
  const currentPages = new Map(current.pages.map((page) => [page.id, page]));
  if (previousPages.size !== currentPages.size || [...previousPages.keys()].some((id) => !currentPages.has(id))) throw new Error("unsupported page change");
  for (const [id, page] of previousPages) {
    const next = currentPages.get(id)!;
    if (page.title !== next.title || page.mode !== next.mode) throw new Error("unsupported page metadata change");
  }
  const before = new Map(previous.pages.flatMap((page) => page.modules.map((module) => [module.id, { pageId: page.id, module }] as const)));
  const after = new Map(current.pages.flatMap((page) => page.modules.map((module) => [module.id, { pageId: page.id, module }] as const)));
  const result: ModulePlanOperation[] = [];
  for (const [id, entry] of before) {
    const next = after.get(id);
    if (next === undefined) {
      if ((entry.module.sourceBlueprintModuleIds ?? []).some((source) => acceptedIds.has(source))) throw new Error(`accepted blueprint still requires removed module: ${id}`);
      result.push({ op: "remove", pageId: entry.pageId, moduleId: id }); continue;
    }
    if (entry.pageId !== next.pageId || entry.module.kind !== next.module.kind || entry.module.templateVersion !== next.module.templateVersion) throw new Error(`unsupported module identity change: ${id}`);
    const changes: Record<string, unknown> = {};
    for (const key of ["title", "content", "interactions", "sourceBlueprintModuleIds", "assetId"] as const) {
      if (canonicalModuleCompilationHash(entry.module[key] ?? null) !== canonicalModuleCompilationHash(next.module[key] ?? null)) changes[key] = next.module[key] ?? null;
    }
    if (Object.keys(changes).length > 0) result.push({ op: "update", pageId: next.pageId, moduleId: id, changes });
    if (canonicalModuleCompilationHash(entry.module.placement) !== canonicalModuleCompilationHash(next.module.placement)) {
      const beforePlacement = entry.module.placement; const afterPlacement = next.module.placement;
      const resizeOnly = beforePlacement.region === afterPlacement.region
        && beforePlacement.order === afterPlacement.order
        && beforePlacement.alignment === afterPlacement.alignment
        && beforePlacement.emphasis === afterPlacement.emphasis;
      result.push(resizeOnly
        ? { op: "resize", pageId: next.pageId, moduleId: id, columnSpan: afterPlacement.columnSpan, preferredHeight: afterPlacement.preferredHeight }
        : { op: "move", pageId: next.pageId, moduleId: id, placement: afterPlacement });
    }
    if (entry.module.variant !== next.module.variant) result.push({ op: "changeVariant", pageId: next.pageId, moduleId: id, templateVersion: next.module.templateVersion, variant: next.module.variant });
  }
  for (const [id, entry] of after) if (!before.has(id)) result.push({ op: "add", pageId: entry.pageId, module: entry.module });
  return result.sort((a, b) => compareCodePoints(`${a.pageId}\u0000${a.op === "add" ? a.module.id : a.moduleId}\u0000${a.op}`, `${b.pageId}\u0000${b.op === "add" ? b.module.id : b.moduleId}\u0000${b.op}`));
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
