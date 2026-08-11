import type {
  AssetRecord,
  ModuleDeliveryGap,
  ModuleInteraction,
  ModulePlacement,
  ModulePlanModule,
  ResolvedAsset,
  UIComponentSpec,
} from "@kf/contracts";
import type { z } from "zod";
import type { ModuleBounds } from "./layout/layout-engine.js";

export type ModuleMaturity = "stable" | "beta" | "unsupported";

export type ModuleFallbackPolicy =
  | Readonly<{ mode: "native-only" }>
  | Readonly<{ mode: "allow-webcontainer"; authorizationRef: string }>;

export interface AssetSlotDefinition {
  readonly id: string;
  readonly required: boolean;
  /** A slot can be optional generally but mandatory for an explicit variant. */
  readonly requiredForVariants?: readonly string[];
  readonly allowedKinds: readonly AssetRecord["kind"][];
}

/** Pixel bounds declared by a module template, not model-authored coordinates. */
export interface ModuleHeightContract {
  readonly min: number;
  readonly preferred: Readonly<Record<ModulePlacement["preferredHeight"], number>>;
  readonly max: number;
}

export interface ModuleLayoutContract {
  readonly regions: readonly ModulePlacement["region"][];
  readonly minColumnSpan: number;
  readonly maxColumnSpan: number;
  readonly preferredHeights: readonly ModulePlacement["preferredHeight"][];
  readonly interactions: readonly ModuleInteraction["type"][];
  /** Exact registered dimensions; model-authored plans choose only the semantic height. */
  readonly height: ModuleHeightContract;
}

export interface ModuleCompileContext {
  readonly definition: ModuleDefinition;
  readonly instance: ModulePlanModule;
  readonly content: Record<string, unknown>;
  readonly asset: ResolvedAsset | undefined;
  readonly validationContext: ModuleValidationContext;
  /** Solver-owned local implementation envelope; definitions must never assume a page width. */
  readonly bounds: ModuleBounds;
}

export interface ModuleCompileInput {
  readonly context: ModuleCompileContext;
}

export interface ModuleCompileOutput {
  readonly components: readonly UIComponentSpec[];
  readonly deliveryGaps: readonly ModuleDeliveryGap[];
}

/** Registry-owned structural contract used by delivery gates, never model input. */
export interface ModuleQualityContract {
  readonly minimumComponentCount: number;
  /** A surface-only rendering is never considered delivery-ready. */
  readonly minimumCriticalComponentCount: number;
  readonly requiredRoles: readonly string[];
  readonly requiredCriticalRoles: readonly string[];
  readonly requiredCapabilityIds: readonly string[];
  /** Exact compiler-owned output slots, selected per registered variant. */
  readonly variantRequiredOutputs: Readonly<Record<string, readonly ModuleRequiredOutputContract[]>>;
  readonly interactionActionKinds?: Readonly<Partial<Record<ModuleInteraction["type"], string>>>;
  /** Exact instance/variant-derived manifest; it must not inspect compiler output. */
  readonly deriveRequiredOutputs?: (input: ModuleQualityManifestInput) => readonly ModuleRequiredOutputContract[];
}

export interface ModuleQualityManifestInput {
  readonly instance: ModulePlanModule;
  readonly content: Readonly<Record<string, unknown>>;
}

export interface ModuleRequiredOutputContract {
  /** Local compiler output id. Omit only for a dynamic, role-selected slot. */
  readonly outputId?: string;
  readonly role: string;
  readonly capabilityId: string;
  readonly critical: boolean;
  readonly assetSlotId?: string;
  readonly actionType?: ModuleInteraction["type"];
}

export interface ModuleDefinition {
  readonly kind: string;
  readonly version: string;
  readonly category: string;
  readonly maturity: ModuleMaturity;
  /** Exact real-runtime acceptance target required before a beta can be promoted. */
  readonly runtimeEvidenceTarget?: Readonly<{ runtimeFamily: string; runtimeVersion: string; baselineId: string }>;
  readonly variants: readonly string[];
  /** Omitted policies normalize to native-only when registered. */
  readonly fallbackPolicy?: ModuleFallbackPolicy;
  readonly contentSchema: z.ZodType<Record<string, unknown>>;
  readonly assetSlots: readonly AssetSlotDefinition[];
  readonly requiredKfCapabilities: readonly string[];
  /** Explicit, versioned registry fingerprints persisted with every compilation. */
  readonly compilerFingerprint?: string;
  readonly layoutFingerprint?: string;
  readonly quality?: ModuleQualityContract;
  readonly layout: ModuleLayoutContract;
  compile(input: ModuleCompileInput): ModuleCompileOutput;
}

export interface ModuleValidationInput {
  readonly instance: ModulePlanModule;
  readonly assets: readonly AssetRecord[];
  readonly context: ModuleValidationContext;
}

/** Trusted delivery-time facts, never values supplied by a model-authored plan. */
export interface ModuleValidationContext {
  readonly availableKfCapabilities: readonly string[];
  readonly approvedAuthorizationRefs: readonly string[];
  readonly moduleRuntimeEvidence?: readonly ModuleRuntimeEvidence[];
}

/** Trusted Task 13 acceptance evidence, never model-authored plan content. */
export interface ModuleRuntimeEvidence {
  readonly kind: string;
  readonly version: string;
  readonly runtimeFamily: string;
  readonly runtimeVersion: string;
  readonly baselineId: string;
  readonly verifiedCapabilities: readonly string[];
}

export interface ModuleValidationResult {
  readonly definition: ModuleDefinition;
  readonly content: Record<string, unknown>;
  readonly asset: AssetRecord | undefined;
  readonly deliveryGaps: readonly ModuleDeliveryGap[];
}

export interface ModulePlanningSummary {
  readonly kind: string;
  readonly version: string;
  readonly maturity: ModuleMaturity;
  readonly variants: readonly string[];
  readonly slots: readonly AssetSlotDefinition[];
  readonly interactions: readonly ModuleInteraction["type"][];
  readonly layout: Readonly<{
    regions: readonly ModulePlacement["region"][];
    minColumnSpan: number;
    maxColumnSpan: number;
    preferredHeights: readonly ModulePlacement["preferredHeight"][];
  }>;
}
