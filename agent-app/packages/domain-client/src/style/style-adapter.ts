import type { ComponentStyleSpec, StyleDeclarationV2 } from "@kf/contracts";
import type {
  CompiledScopedStyleFragment,
  DeclarationsByState,
  StyleState,
} from "./css-compiler.js";

export interface UnsupportedStyle {
  token: string;
  reason: string;
}

export interface StyleWarning {
  code: string;
  message: string;
}

export interface CompiledControlStyle {
  nativeFields: NativeStyleFields;
  styleDataNew: string;
  unsupported: UnsupportedStyle[];
  warnings: StyleWarning[];
  /** 编译器所有者确定性关联元数据；它从不作为DOM选择器使用。 */
  scopeToken?: string;
  /** 由原生 UI v2 消费的合同安全语义片段。 */
  cssFragments?: readonly CompiledStyleFragment[];
  /** 证据所有者持久化的选择器，以及编译者所有者关联的元数据。 */
  scopedFragments?: readonly CompiledScopedStyleFragment[];
  /** 由编译器签发的完整持久化载荷；任务 6 必须先校验它，再进行无损持久化。 */
  persistedStyleHandoff?: PersistedStyleHandoff;
}

/**
 * 为一个原生 v2 组件完成项目时间样式数据包。
 * 它故意包含持久化 `#domId` placeholder 但没有运行时 DOM 身份。
 */
export interface PersistedStyleHandoff {
  readonly componentCorrelationId: string;
  readonly expectedFragmentCount: number;
  readonly expectedFragmentKeys: readonly string[];
  readonly styleDataNew: string;
  readonly fragments: readonly CompiledScopedStyleFragment[];
}

export interface CompiledResolvedControlStyle extends CompiledControlStyle {
  readonly scopeToken: string;
  readonly cssFragments: readonly CompiledStyleFragment[];
  readonly scopedFragments: readonly CompiledScopedStyleFragment[];
  readonly persistedStyleHandoff: PersistedStyleHandoff;
}

export interface CompiledStyleFragment {
  readonly selectorToken: "root" | `part:${string}`;
  readonly state: StyleState;
  readonly declarations: StyleDeclarationV2;
}

export interface StyleAdapterResult {
  nativeFields: NativeStyleFields;
  cssDeclarations: DeclarationsByState;
  unsupported: UnsupportedStyle[];
}

export type NativeStyleValue = string | number | boolean;
export type NativeStyleFields = Record<string, NativeStyleValue>;

export interface StylePartAdapter {
  readonly semanticPart: string;
  readonly selector: string;
  readonly nativeProperties: readonly StyleDeclarationKey[];
  readonly cssProperties: readonly StyleDeclarationKey[];
  readonly supportedStates: readonly string[];
}

/** Adapts a resolved, structured style into a reviewed KF control surface. */
export interface StyleAdapter {
  readonly capabilityId: string;
  readonly parts: readonly StylePartAdapter[];
  compile(style: ComponentStyleSpec): StyleAdapterResult;
}

export type StyleDeclarationKey = keyof StyleDeclarationV2;
