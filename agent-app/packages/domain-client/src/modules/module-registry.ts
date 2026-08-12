import type {
  AssetRecord,
  ModuleDeliveryGap,
  ModulePlanModule,
} from "@kf/contracts";
import type {
  AssetSlotDefinition,
  ModuleDefinition,
  ModuleFallbackPolicy,
  ModulePlanningSummary,
  ModuleValidationInput,
  ModuleValidationResult,
} from "./types.js";
import { registerPortalModules } from "./definitions/portal-modules.js";
import { registerDashboardModules } from "./definitions/dashboard-modules.js";
import { registerAdminModules } from "./definitions/admin-modules.js";
import type { ModuleRuntimeEvidence } from "./types.js";

export type {
  AssetSlotDefinition,
  ModuleCompileContext,
  ModuleCompileInput,
  ModuleCompileOutput,
  ModuleDefinition,
  ModuleFallbackPolicy,
  ModuleHeightContract,
  ModuleLayoutContract,
  ModuleMaturity,
  ModulePlanningSummary,
  ModuleValidationContext,
  ModuleValidationInput,
  ModuleValidationResult,
} from "./types.js";

const MATURITIES = new Set(["stable", "beta", "unsupported"]);
const V1_EXACT_KINDS = new Set(["navigation.top", "navigation.sidebar", "content.hero", "metric.kpi-grid", "content.card-grid", "content.timeline", "data.chart-panel", "data.status-grid", "data.table", "data.detail", "interaction.tabs-filter", "form.record-editor", "action.toolbar", "feedback.alert-list", "content.contact-footer"]);
const NATIVE_ONLY_FALLBACK_POLICY: ModuleFallbackPolicy = Object.freeze({ mode: "native-only" });
const BUILTIN_PLANNING_CONTENT_EXAMPLES: Readonly<Record<string, Readonly<Record<string, unknown>>>> = Object.freeze({
  "navigation.top": Object.freeze({ logo: "KingFusion", items: Object.freeze(["首页", "能力中心"]) }),
  "navigation.sidebar": Object.freeze({ groups: Object.freeze([Object.freeze({ label: "运营中心", items: Object.freeze(["运行概览", "告警中心"]) })]) }),
  "content.hero": Object.freeze({ title: "工业智能平台", subtitle: "连接数据、现场与决策", description: "以可信实时数据支撑生产运营。" }),
  "metric.kpi-grid": Object.freeze({ items: Object.freeze([Object.freeze({ label: "设备在线率", value: "98.6%", trend: "+1.2%" })]) }),
  "content.card-grid": Object.freeze({ items: Object.freeze([Object.freeze({ title: "实时监控", summary: "统一查看关键运行状态。", tag: "稳定运行" })]) }),
  "content.timeline": Object.freeze({ items: Object.freeze([Object.freeze({ title: "平台上线", detail: "完成生产环境部署。", date: "2026-08" })]) }),
  "data.chart-panel": Object.freeze({ chart: Object.freeze({ kind: "line", title: "产量趋势", labels: Object.freeze(["周一", "周二"]), series: Object.freeze([Object.freeze({ name: "产量", values: Object.freeze([120, 138]) })]) }) }),
  "data.status-grid": Object.freeze({ items: Object.freeze([Object.freeze({ name: "主生产线", severity: "online", detail: "运行正常" })]) }),
  "data.table": Object.freeze({ table: Object.freeze({ columns: Object.freeze([Object.freeze({ key: "name", label: "名称", align: "left" }), Object.freeze({ key: "status", label: "状态", align: "center" })]), rows: Object.freeze([Object.freeze({ name: "主生产线", status: "运行中" })]), pageSize: 20 }) }),
  "data.detail": Object.freeze({ fields: Object.freeze([Object.freeze({ label: "设备名称", value: "主生产线" }), Object.freeze({ label: "运行状态", value: "正常" })]) }),
  "interaction.tabs-filter": Object.freeze({ tabs: Object.freeze(["全部", "运行中"]), active: "全部" }),
  "form.record-editor": Object.freeze({ fields: Object.freeze([Object.freeze({ id: "contactName", label: "联系人", placeholder: "请输入联系人" })]), submitLabel: "保存" }),
  "action.toolbar": Object.freeze({ actions: Object.freeze([Object.freeze({ label: "新建" }), Object.freeze({ label: "刷新" })]) }),
  "feedback.alert-list": Object.freeze({ alerts: Object.freeze([Object.freeze({ title: "温度预警", message: "一号设备温度接近阈值。", severity: "warning" })]) }),
  "content.contact-footer": Object.freeze({ contacts: Object.freeze([Object.freeze({ label: "服务电话", value: "400-000-0000" })]), copyright: "© 2026 KingFusion" }),
});

function definitionKey(kind: string, version: string): string {
  return `${kind}@${version}`;
}

function fail(code: string, detail: string): never {
  throw new Error(`${code}: ${detail}`);
}

function freezeArray<T>(values: readonly T[]): readonly T[] {
  return Object.freeze([...values]);
}

function freezeSlot(slot: AssetSlotDefinition): AssetSlotDefinition {
  return Object.freeze({
    id: slot.id,
    required: slot.required,
    ...(slot.requiredForVariants === undefined ? {} : { requiredForVariants: freezeArray(slot.requiredForVariants) }),
    allowedKinds: freezeArray(slot.allowedKinds),
  });
}

function freezeFallbackPolicy(policy: ModuleFallbackPolicy): ModuleFallbackPolicy {
  return policy.mode === "native-only"
    ? Object.freeze({ mode: "native-only" })
    : Object.freeze({ mode: "allow-webcontainer", authorizationRef: policy.authorizationRef });
}

function freezeJson(value: unknown): unknown {
  if (Array.isArray(value)) return Object.freeze(value.map(freezeJson));
  if (value !== null && typeof value === "object") return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, freezeJson(entry)])));
  return value;
}

function freezeHeightContract(height: ModuleDefinition["layout"]["height"]): ModuleDefinition["layout"]["height"] {
  return Object.freeze({
    min: height.min,
    preferred: Object.freeze({ ...height.preferred }),
    max: height.max,
  });
}

function fallbackPolicyOf(definition: ModuleDefinition): ModuleFallbackPolicy {
  return definition.fallbackPolicy ?? NATIVE_ONLY_FALLBACK_POLICY;
}

function freezeDefinition(definition: ModuleDefinition): ModuleDefinition {
  const height = freezeHeightContract(definition.layout.height);
  const layout = Object.freeze({
    regions: freezeArray(definition.layout.regions),
    minColumnSpan: definition.layout.minColumnSpan,
    maxColumnSpan: definition.layout.maxColumnSpan,
    preferredHeights: freezeArray(definition.layout.preferredHeights),
    interactions: freezeArray(definition.layout.interactions),
    height,
  });

  return Object.freeze({
    ...definition,
    ...(definition.runtimeEvidenceTarget === undefined ? {} : { runtimeEvidenceTarget: Object.freeze({ ...definition.runtimeEvidenceTarget }) }),
    fallbackPolicy: freezeFallbackPolicy(fallbackPolicyOf(definition)),
    variants: freezeArray(definition.variants),
    ...(definition.planningContentExample === undefined ? {} : { planningContentExample: freezeJson(definition.planningContentExample) as Readonly<Record<string, unknown>> }),
    assetSlots: freezeArray(definition.assetSlots.map(freezeSlot)),
    requiredKfCapabilities: freezeArray(definition.requiredKfCapabilities),
    ...(definition.compilerFingerprint === undefined ? {} : { compilerFingerprint: definition.compilerFingerprint }),
    ...(definition.layoutFingerprint === undefined ? {} : { layoutFingerprint: definition.layoutFingerprint }),
    ...(definition.quality === undefined ? {} : { quality: Object.freeze({ minimumComponentCount: definition.quality.minimumComponentCount, minimumCriticalComponentCount: definition.quality.minimumCriticalComponentCount, requiredRoles: freezeArray(definition.quality.requiredRoles), requiredCriticalRoles: freezeArray(definition.quality.requiredCriticalRoles), requiredCapabilityIds: freezeArray(definition.quality.requiredCapabilityIds), variantRequiredOutputs: Object.freeze(Object.fromEntries(Object.entries(definition.quality.variantRequiredOutputs).map(([variant, outputs]) => [variant, freezeArray(outputs.map((output) => Object.freeze({ ...output })))]))), ...(definition.quality.interactionActionKinds === undefined ? {} : { interactionActionKinds: Object.freeze({ ...definition.quality.interactionActionKinds }) }), ...(definition.quality.deriveRequiredOutputs === undefined ? {} : { deriveRequiredOutputs: definition.quality.deriveRequiredOutputs }) }) }),
    layout,
  });
}

function assertDefinition(definition: ModuleDefinition): void {
  const key = definitionKey(definition.kind, definition.version);
  if (!definition.kind || !definition.version || !definition.category) {
    fail("MODULE_DEFINITION_INVALID", `${key} requires kind, version, and category`);
  }
  if (!MATURITIES.has(definition.maturity)) {
    fail("MODULE_DEFINITION_INVALID", `${key} has invalid maturity`);
  }
  if (!definition.compilerFingerprint || !definition.layoutFingerprint || !/^[A-Za-z0-9._:-]{8,200}$/.test(definition.compilerFingerprint) || !/^[A-Za-z0-9._:-]{8,200}$/.test(definition.layoutFingerprint)) fail("MODULE_DEFINITION_INVALID", `${key} requires stable compiler and layout fingerprints`);
  const planningExample = definition.planningContentExample ?? BUILTIN_PLANNING_CONTENT_EXAMPLES[definition.kind];
  if (definition.runtimeEvidenceTarget !== undefined && V1_EXACT_KINDS.has(definition.kind) && (planningExample === undefined || !definition.contentSchema.safeParse(planningExample).success)) fail("MODULE_DEFINITION_INVALID", `${key} requires a schema-valid planning content example`);
  if (V1_EXACT_KINDS.has(definition.kind) && (definition.quality === undefined || definition.quality.minimumComponentCount < 2 || definition.quality.minimumCriticalComponentCount < 1 || definition.quality.requiredRoles.length < 1 || definition.quality.requiredCriticalRoles.length < 1 || definition.quality.requiredRoles.some((role) => !role) || definition.quality.requiredCriticalRoles.some((role) => !role) || definition.quality.requiredCapabilityIds.length < 1 || definition.quality.requiredCapabilityIds.some((capability) => !capability) || !sameStrings(Object.keys(definition.quality.variantRequiredOutputs), definition.variants) || Object.values(definition.quality.variantRequiredOutputs).some((outputs) => outputs.length === 0 || outputs.some((output) => !output.role || !output.capabilityId)) || definition.quality.deriveRequiredOutputs === undefined)) fail("MODULE_DEFINITION_INVALID", `${key} requires a complete quality contract`);
  if (definition.variants.length === 0 || definition.variants.some((variant) => !variant)) {
    fail("MODULE_DEFINITION_INVALID", `${key} requires one or more variants`);
  }
  if (new Set(definition.variants).size !== definition.variants.length) {
    fail("MODULE_DEFINITION_INVALID", `${key} has duplicate variants`);
  }
  const fallbackPolicy = fallbackPolicyOf(definition);
  if (
    fallbackPolicy.mode !== "native-only"
    && (
      fallbackPolicy.mode !== "allow-webcontainer"
      || !fallbackPolicy.authorizationRef
    )
  ) {
    fail("MODULE_DEFINITION_INVALID", `${key} has an invalid fallback policy`);
  }
  if (definition.assetSlots.length > 1) {
    fail("MODULE_DEFINITION_INVALID", `${key} has more asset slots than ModulePlanModule can represent`);
  }
  if (definition.assetSlots.some((slot) => !slot.id || slot.allowedKinds.length === 0 || slot.requiredForVariants?.some((variant) => !definition.variants.includes(variant)))) {
    fail("MODULE_DEFINITION_INVALID", `${key} has an invalid asset slot`);
  }
  if (new Set(definition.assetSlots.map((slot) => slot.id)).size !== definition.assetSlots.length) {
    fail("MODULE_DEFINITION_INVALID", `${key} has duplicate asset slots`);
  }
  if (
    definition.layout.regions.length === 0
    || definition.layout.preferredHeights.length === 0
    || definition.layout.minColumnSpan < 1
    || definition.layout.maxColumnSpan > 12
    || definition.layout.minColumnSpan > definition.layout.maxColumnSpan
  ) {
    fail("MODULE_DEFINITION_INVALID", `${key} has invalid layout bounds`);
  }
  const height = definition.layout.height;
  if (
    height === undefined
    || !Number.isInteger(height.min)
    || !Number.isInteger(height.max)
    || height.min <= 0
    || height.max < height.min
    || definition.layout.preferredHeights.some((preferredHeight) => {
      const value = height.preferred[preferredHeight];
      return !Number.isInteger(value) || value < height.min || value > height.max;
    })
  ) {
    fail("MODULE_DEFINITION_INVALID", `${key} has invalid layout height bounds`);
  }
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && [...left].sort().every((value, index) => value === [...right].sort()[index]);
}

function parseContent(instance: ModulePlanModule, key: string): Record<string, unknown> {
  if (instance.content === undefined) return {};
  try {
    const content: unknown = JSON.parse(instance.content);
    if (content === null || Array.isArray(content) || typeof content !== "object") {
      fail("MODULE_CONTENT_INVALID", key);
    }
    return content as Record<string, unknown>;
  } catch (error) {
    if (error instanceof Error && error.message === `MODULE_CONTENT_INVALID: ${key}`) throw error;
    fail("MODULE_CONTENT_INVALID", key);
  }
}

function validateAsset(
  instance: ModulePlanModule,
  slots: readonly AssetSlotDefinition[],
  assets: readonly AssetRecord[],
  key: string,
): AssetRecord | undefined {
  const slot = slots[0];
  if (slot === undefined) {
    if (instance.assetId !== undefined) fail("MODULE_ASSET_SLOT_UNEXPECTED", key);
    return undefined;
  }
  if (instance.assetId === undefined) {
    if (slot.required || slot.requiredForVariants?.includes(instance.variant)) fail("MODULE_ASSET_SLOT_REQUIRED", `${key} [${slot.id}]`);
    return undefined;
  }
  const asset = assets.find((candidate) => candidate.id === instance.assetId);
  if (asset === undefined) fail("MODULE_ASSET_NOT_FOUND", `${key} [${instance.assetId}]`);
  if (!slot.allowedKinds.includes(asset.kind)) {
    fail("MODULE_ASSET_SLOT_INVALID", `${key} [${slot.id}]`);
  }
  return asset;
}

function assertLayout(instance: ModulePlanModule, definition: ModuleDefinition, key: string): void {
  const { placement, interactions } = instance;
  const { layout } = definition;
  if (
    !layout.regions.includes(placement.region)
    || placement.columnSpan < layout.minColumnSpan
    || placement.columnSpan > layout.maxColumnSpan
    || !layout.preferredHeights.includes(placement.preferredHeight)
    || interactions.some((interaction) => !layout.interactions.includes(interaction.type))
  ) {
    fail("MODULE_LAYOUT_INVALID", key);
  }
}

function planningSummary(definition: ModuleDefinition): ModulePlanningSummary {
  const contentExample = definition.planningContentExample ?? BUILTIN_PLANNING_CONTENT_EXAMPLES[definition.kind];
  if (contentExample !== undefined && !definition.contentSchema.safeParse(contentExample).success) fail("MODULE_DEFINITION_INVALID", `${definitionKey(definition.kind, definition.version)} has an invalid planning content example`);
  return Object.freeze({
    kind: definition.kind,
    version: definition.version,
    maturity: definition.maturity,
    variants: freezeArray(definition.variants),
    slots: freezeArray(definition.assetSlots.map(freezeSlot)),
    interactions: freezeArray(definition.layout.interactions),
    ...(contentExample === undefined ? {} : { contentExample: freezeJson(contentExample) as Readonly<Record<string, unknown>> }),
    layout: Object.freeze({
      regions: freezeArray(definition.layout.regions),
      minColumnSpan: definition.layout.minColumnSpan,
      maxColumnSpan: definition.layout.maxColumnSpan,
      preferredHeights: freezeArray(definition.layout.preferredHeights),
    }),
  });
}

function compareCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left);
  const rightPoints = Array.from(right);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    const leftPoint = leftPoints[index]!.codePointAt(0)!;
    const rightPoint = rightPoints[index]!.codePointAt(0)!;
    if (leftPoint !== rightPoint) return leftPoint < rightPoint ? -1 : 1;
  }
  return leftPoints.length === rightPoints.length ? 0 : leftPoints.length < rightPoints.length ? -1 : 1;
}

function assertWebContainerAuthorization(
  definition: ModuleDefinition,
  approvedAuthorizationRefs: readonly string[],
  key: string,
): void {
  if (!definition.requiredKfCapabilities.includes("webcontainer")) return;
  const fallbackPolicy = fallbackPolicyOf(definition);
  if (fallbackPolicy.mode === "native-only") {
    fail("MODULE_WEBCONTAINER_DISALLOWED", key);
  }
  if (!approvedAuthorizationRefs.includes(fallbackPolicy.authorizationRef)) {
    fail("MODULE_WEBCONTAINER_UNAUTHORIZED", `${key} [${fallbackPolicy.authorizationRef}]`);
  }
}

function effectiveMaturity(definition: ModuleDefinition, context: ModuleValidationInput["context"]): ModuleDefinition["maturity"] {
  if (definition.maturity !== "beta" || definition.runtimeEvidenceTarget === undefined) return definition.maturity;
  const evidence = context.moduleRuntimeEvidence?.find((candidate) =>
    candidate.kind === definition.kind
    && candidate.version === definition.version
    && candidate.runtimeFamily === definition.runtimeEvidenceTarget!.runtimeFamily
    && candidate.runtimeVersion === definition.runtimeEvidenceTarget!.runtimeVersion
    && candidate.baselineId === definition.runtimeEvidenceTarget!.baselineId,
  );
  return evidence !== undefined && definition.requiredKfCapabilities.every((capability) => evidence.verifiedCapabilities.includes(capability))
    ? "stable"
    : "beta";
}

/**
 * The authoritative module capability boundary. A caller must always provide
 * an exact version; this registry intentionally has no latest-version lookup.
 */
export class ModuleRegistry {
  readonly #definitions = new Map<string, ModuleDefinition>();

  register(definition: ModuleDefinition): void {
    assertDefinition(definition);
    const key = definitionKey(definition.kind, definition.version);
    if (this.#definitions.has(key)) fail("MODULE_DEFINITION_DUPLICATE", key);
    this.#definitions.set(key, freezeDefinition(definition));
  }

  require(kind: string, version: string): ModuleDefinition {
    if (!version) fail("MODULE_VERSION_REQUIRED", kind);
    const key = definitionKey(kind, version);
    const definition = this.#definitions.get(key);
    if (definition === undefined) fail("MODULE_DEFINITION_NOT_FOUND", key);
    return definition;
  }

  listForPlanning(): readonly ModulePlanningSummary[] {
    return Object.freeze(
      [...this.#definitions.values()]
        .filter((definition) => definition.maturity === "stable")
        .sort((left, right) => compareCodePoints(definitionKey(left.kind, left.version), definitionKey(right.kind, right.version)))
        .map(planningSummary),
    );
  }

  /** Internal repair/planning catalog: includes beta with its maturity, never unsupported. */
  listForInternalPlanning(): readonly ModulePlanningSummary[] {
    return Object.freeze(
      [...this.#definitions.values()]
        .filter((definition) => definition.maturity !== "unsupported")
        .sort((left, right) => compareCodePoints(definitionKey(left.kind, left.version), definitionKey(right.kind, right.version)))
        .map(planningSummary),
    );
  }

  validateInstance(input: ModuleValidationInput): ModuleValidationResult {
    const definition = this.require(input.instance.kind, input.instance.templateVersion);
    const key = definitionKey(definition.kind, definition.version);
    if (definition.maturity === "unsupported") fail("MODULE_UNSUPPORTED", key);
    if (!definition.variants.includes(input.instance.variant)) {
      fail("MODULE_VARIANT_UNSUPPORTED", `${key} [${input.instance.variant}]`);
    }
    assertWebContainerAuthorization(definition, input.context.approvedAuthorizationRefs, key);
    const missingCapabilities = definition.requiredKfCapabilities.filter(
      (capability) => !input.context.availableKfCapabilities.includes(capability),
    );
    if (missingCapabilities.length > 0) {
      fail("MODULE_KF_CAPABILITY_MISSING", `${key} [${missingCapabilities.join(", ")}]`);
    }

    const content = parseContent(input.instance, key);
    if (!definition.contentSchema.safeParse(content).success) fail("MODULE_CONTENT_INVALID", key);
    const asset = validateAsset(input.instance, definition.assetSlots, input.assets, key);
    assertLayout(input.instance, definition, key);

    const deliveryGaps: readonly ModuleDeliveryGap[] = effectiveMaturity(definition, input.context) === "beta"
      ? Object.freeze([Object.freeze({
        moduleId: input.instance.id,
        requirement: `Mature ${key} before production delivery`,
        severity: "warning" as const,
        status: "unresolved" as const,
        reason: `Module ${key} is registered as beta.`,
      })])
      : Object.freeze([]);
    return Object.freeze({ definition, content, asset, deliveryGaps });
  }
}

/** Creates the explicit built-in catalog; callers may add reviewed extensions. */
export function createDefaultModuleRegistry(evidence: readonly ModuleRuntimeEvidence[] = []): ModuleRegistry {
  const registry = new ModuleRegistry();
  registerPortalModules(registry, evidence);
  registerDashboardModules(registry, evidence);
  registerAdminModules(registry, evidence);
  return registry;
}
