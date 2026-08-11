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

export type ModuleMaturity = "stable" | "beta" | "unsupported";

export type ModuleFallbackPolicy =
  | Readonly<{ mode: "native-only" }>
  | Readonly<{ mode: "allow-webcontainer"; authorizationRef: string }>;

export interface AssetSlotDefinition {
  readonly id: string;
  readonly required: boolean;
  readonly allowedKinds: readonly AssetRecord["kind"][];
}

export interface ModuleLayoutContract {
  readonly regions: readonly ModulePlacement["region"][];
  readonly minColumnSpan: number;
  readonly maxColumnSpan: number;
  readonly preferredHeights: readonly ModulePlacement["preferredHeight"][];
  readonly interactions: readonly ModuleInteraction["type"][];
}

export interface ModuleCompileContext {
  readonly definition: ModuleDefinition;
  readonly instance: ModulePlanModule;
  readonly content: Record<string, unknown>;
  readonly asset: ResolvedAsset | undefined;
  readonly validationContext: ModuleValidationContext;
}

export interface ModuleCompileInput {
  readonly context: ModuleCompileContext;
}

export interface ModuleCompileOutput {
  readonly components: readonly UIComponentSpec[];
  readonly deliveryGaps: readonly ModuleDeliveryGap[];
}

export interface ModuleDefinition {
  readonly kind: string;
  readonly version: string;
  readonly category: string;
  readonly maturity: ModuleMaturity;
  readonly variants: readonly string[];
  /** Omitted policies normalize to native-only when registered. */
  readonly fallbackPolicy?: ModuleFallbackPolicy;
  readonly contentSchema: z.ZodType<Record<string, unknown>>;
  readonly assetSlots: readonly AssetSlotDefinition[];
  readonly requiredKfCapabilities: readonly string[];
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
