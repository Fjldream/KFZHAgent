import type { ComponentStyleSpec, StyleDeclaration } from "@kf/contracts";
import type { DeclarationsByState } from "./css-compiler.js";

export interface UnsupportedStyle {
  token: string;
  reason: string;
}

export interface StyleWarning {
  code: string;
  message: string;
}

export interface CompiledControlStyle {
  nativeFields: Record<string, unknown>;
  styleDataNew: string;
  unsupported: UnsupportedStyle[];
  warnings: StyleWarning[];
}

export interface StyleAdapterResult {
  nativeFields: Record<string, unknown>;
  cssDeclarations: DeclarationsByState;
  unsupported: UnsupportedStyle[];
}

/** Adapts a resolved, structured style into a reviewed KF control surface. */
export interface StyleAdapter {
  readonly capabilityId: string;
  compile(style: ComponentStyleSpec): StyleAdapterResult;
}

export type StyleDeclarationKey = keyof StyleDeclaration;
