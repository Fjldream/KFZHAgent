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
  /** Deterministic compiler-owned correlation metadata; never used as a DOM selector. */
  scopeToken?: string;
  /** Contract-safe semantic fragments consumed by native UI v2. */
  cssFragments?: readonly CompiledStyleFragment[];
  /** Evidence-owned persisted selectors plus compiler-owned correlation metadata. */
  scopedFragments?: readonly CompiledScopedStyleFragment[];
  /** Compiler-issued complete persisted payload; Task 6 must verify this before lossless persistence. */
  persistedStyleHandoff?: PersistedStyleHandoff;
}

/**
 * Complete project-time style payload for one native v2 component.
 * It deliberately contains the persisted `#domId` placeholder and no runtime DOM identity.
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
