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
  /** Deterministic compiler-owned identity; legacy v1 compilation omits it. */
  scopeToken?: string;
  /** Contract-safe semantic fragments consumed by native UI v2. */
  cssFragments?: CompiledStyleFragment[];
  /** Evidence-owned selectors and serialized CSS used at the KF runtime boundary. */
  scopedFragments?: CompiledScopedStyleFragment[];
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
