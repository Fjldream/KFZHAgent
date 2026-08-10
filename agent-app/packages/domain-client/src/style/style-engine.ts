import type { ComponentStyleSpec, ThemeSpec } from "@kf/contracts";
import { assertStyleAdapterRegistry, getStyleAdapter } from "./adapters/base-adapters.js";
import { compileScopedCss, type DeclarationsByState } from "./css-compiler.js";
import type { KFRuntimeProfile } from "./runtime-profile.js";
import type { CompiledControlStyle, StyleWarning, UnsupportedStyle } from "./style-adapter.js";
import { resolveComponentStyle } from "./theme-resolver.js";

export interface CompileControlStyleInput {
  capabilityId: string;
  theme: ThemeSpec;
  roleStyle?: ComponentStyleSpec;
  typeStyle?: ComponentStyleSpec;
  instanceStyle?: ComponentStyleSpec;
  runtimeProfile: KFRuntimeProfile;
}

const EMPTY_STYLE: ComponentStyleSpec = Object.freeze({
  declarations: Object.freeze({}),
  states: Object.freeze({}),
});

function unsupportedDeclarations(style: ComponentStyleSpec, reason: string): UnsupportedStyle[] {
  return [
    ...Object.keys(style.declarations).map((key) => ({
      token: `declarations.${key}`,
      reason,
    })),
    ...Object.entries(style.states).flatMap(([state, declarations]) =>
      Object.keys(declarations ?? {}).map((key) => ({
        token: `states.${state}.${key}`,
        reason,
      })),
    ),
  ];
}

function unsupportedCssDeclarations(declarationsByState: DeclarationsByState, reason: string): UnsupportedStyle[] {
  return Object.entries(declarationsByState).flatMap(([state, declarations]) =>
    Object.keys(declarations ?? {}).map((key) => ({
      token: state === "normal" ? `declarations.${key}` : `states.${state}.${key}`,
      reason,
    })),
  );
}

function unavailableAdapterWarning(capabilityId: string): StyleWarning {
  return {
    code: "STYLE_ADAPTER_UNAVAILABLE",
    message: `No reviewed style adapter is registered for capability ${capabilityId}`,
  };
}

/**
 * Compiles structured style intent to reviewed KF native fields and scoped CSS.
 * Selector roles are read directly from the supplied runtime profile so Task 4
 * remains the sole trusted-selector boundary.
 */
export function compileControlStyle(input: CompileControlStyleInput): CompiledControlStyle {
  // Delayed until first compilation to avoid the compiler → style engine →
  // registry initialization cycle while retaining the adapter/registry gate.
  assertStyleAdapterRegistry();
  const resolvedStyle = resolveComponentStyle(
    input.theme,
    input.roleStyle ?? EMPTY_STYLE,
    input.typeStyle ?? EMPTY_STYLE,
    input.instanceStyle ?? EMPTY_STYLE,
  );
  const adapter = getStyleAdapter(input.capabilityId);

  if (!adapter) {
    const reason = `No reviewed style adapter is registered for capability ${input.capabilityId}`;
    return {
      nativeFields: {},
      styleDataNew: "",
      unsupported: unsupportedDeclarations(resolvedStyle, reason),
      warnings: [unavailableAdapterWarning(input.capabilityId)],
    };
  }

  const adapterResult = adapter.compile(resolvedStyle);
  const selectorRoles = input.runtimeProfile.selectors[input.capabilityId];
  if (!selectorRoles) {
    const reason = `Runtime profile does not define selector roles for capability ${input.capabilityId}`;
    return {
      nativeFields: adapterResult.nativeFields,
      styleDataNew: "",
      unsupported: [
        ...adapterResult.unsupported,
        ...unsupportedCssDeclarations(adapterResult.cssDeclarations, reason),
      ],
      warnings: [{ code: "STYLE_SELECTOR_UNAVAILABLE", message: reason }],
    };
  }

  return {
    nativeFields: adapterResult.nativeFields,
    styleDataNew: compileScopedCss(selectorRoles, adapterResult.cssDeclarations),
    unsupported: adapterResult.unsupported,
    warnings: [],
  };
}
