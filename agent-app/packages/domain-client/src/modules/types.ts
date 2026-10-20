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
  /** 通常可以是可选的，但必须是明确变体的强制性。 */
  readonly requiredForVariants?: readonly string[];
  readonly allowedKinds: readonly AssetRecord["kind"][];
}

/** 由模块模板声明的像素边界，不是模型编写的坐标。 */
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
  /** 确切的已注册尺寸；模型编写的计划只能选择语义高度。 */
  readonly height: ModuleHeightContract;
}

export interface ModuleCompileContext {
  readonly definition: ModuleDefinition;
  readonly instance: ModulePlanModule;
  readonly content: Record<string, unknown>;
  readonly asset: ResolvedAsset | undefined;
  readonly validationContext: ModuleValidationContext;
  /** 由求解器负责的局部实现信封；定义绝不能假定页面宽度。 */
  readonly bounds: ModuleBounds;
}

export interface ModuleCompileInput {
  readonly context: ModuleCompileContext;
}

export interface ModuleCompileOutput {
  readonly components: readonly UIComponentSpec[];
  readonly deliveryGaps: readonly ModuleDeliveryGap[];
}

/** 由注册表拥有者使用的结构合同，由交付门使用，永远不假设模型输入。 */
export interface ModuleQualityContract {
  readonly minimumComponentCount: number;
  /** 只有表层渲染效果时，绝不视为可交付。 */
  readonly minimumCriticalComponentCount: number;
  readonly requiredRoles: readonly string[];
  readonly requiredCriticalRoles: readonly string[];
  readonly requiredCapabilityIds: readonly string[];
  /** 精确的编译器所有输出槽，根据注册的变体选择。 */
  readonly variantRequiredOutputs: Readonly<Record<string, readonly ModuleRequiredOutputContract[]>>;
  readonly interactionActionKinds?: Readonly<Partial<Record<ModuleInteraction["type"], string>>>;
  /** 精确的实例/变体衍生化映射；它必须不检查编译器输出。 */
  readonly deriveRequiredOutputs?: (input: ModuleQualityManifestInput) => readonly ModuleRequiredOutputContract[];
}

export interface ModuleQualityManifestInput {
  readonly instance: ModulePlanModule;
  readonly content: Readonly<Record<string, unknown>>;
}

export interface ModuleRequiredOutputContract {
  /** 本地编译器输出标识。仅在动态、角色选择的槽中省略。 */
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
  /** beta 功能升级前所需的确切真实运行时验收目标。 */
  readonly runtimeEvidenceTarget?: Readonly<{ runtimeFamily: string; runtimeVersion: string; baselineId: string }>;
  readonly variants: readonly string[];
  /** 注册时，省略的策略会规范化为仅原生策略。 */
  readonly fallbackPolicy?: ModuleFallbackPolicy;
  readonly contentSchema: z.ZodType<Record<string, unknown>>;
  /** 服务器拥有，具有有效模式的示例，用于约束模式规划。 */
  readonly planningContentExample?: Readonly<Record<string, unknown>>;
  readonly assetSlots: readonly AssetSlotDefinition[];
  readonly requiredKfCapabilities: readonly string[];
  /** 明确的、版本化的注册指纹，与每次编译都持久化。 */
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

/** 受信任的交付时间事实，从模型规划内容中从未提供值。 */
export interface ModuleValidationContext {
  readonly availableKfCapabilities: readonly string[];
  readonly approvedAuthorizationRefs: readonly string[];
  readonly moduleRuntimeEvidence?: readonly ModuleRuntimeEvidence[];
}

/** 受信任的任务13接受证据，从模型规划内容中从未提供。 */
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
  readonly contentExample?: Readonly<Record<string, unknown>>;
  readonly layout: Readonly<{
    regions: readonly ModulePlacement["region"][];
    minColumnSpan: number;
    maxColumnSpan: number;
    preferredHeights: readonly ModulePlacement["preferredHeight"][];
  }>;
}
