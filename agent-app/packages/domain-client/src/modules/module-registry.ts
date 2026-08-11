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
const NATIVE_ONLY_FALLBACK_POLICY: ModuleFallbackPolicy = Object.freeze({ mode: "native-only" });

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
    allowedKinds: freezeArray(slot.allowedKinds),
  });
}

function freezeFallbackPolicy(policy: ModuleFallbackPolicy): ModuleFallbackPolicy {
  return policy.mode === "native-only"
    ? Object.freeze({ mode: "native-only" })
    : Object.freeze({ mode: "allow-webcontainer", authorizationRef: policy.authorizationRef });
}

function freezeHeightContract(height: ModuleDefinition["layout"]["height"]): ModuleDefinition["layout"]["height"] {
  if (height === undefined) return undefined;
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
    ...(height === undefined ? {} : { height }),
  });

  return Object.freeze({
    ...definition,
    fallbackPolicy: freezeFallbackPolicy(fallbackPolicyOf(definition)),
    variants: freezeArray(definition.variants),
    assetSlots: freezeArray(definition.assetSlots.map(freezeSlot)),
    requiredKfCapabilities: freezeArray(definition.requiredKfCapabilities),
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
  if (definition.assetSlots.some((slot) => !slot.id || slot.allowedKinds.length === 0)) {
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
  if (height !== undefined && (
    !Number.isInteger(height.min)
    || !Number.isInteger(height.max)
    || height.min <= 0
    || height.max < height.min
    || Object.values(height.preferred).some((value) => !Number.isInteger(value) || value <= 0)
  )) {
    fail("MODULE_DEFINITION_INVALID", `${key} has invalid layout height bounds`);
  }
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
    if (slot.required) fail("MODULE_ASSET_SLOT_REQUIRED", `${key} [${slot.id}]`);
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
  return Object.freeze({
    kind: definition.kind,
    version: definition.version,
    maturity: definition.maturity,
    variants: freezeArray(definition.variants),
    slots: freezeArray(definition.assetSlots.map(freezeSlot)),
    interactions: freezeArray(definition.layout.interactions),
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

    const deliveryGaps: readonly ModuleDeliveryGap[] = definition.maturity === "beta"
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

/** Creates an empty registry so every supported module is registered explicitly. */
export function createDefaultModuleRegistry(): ModuleRegistry {
  return new ModuleRegistry();
}
