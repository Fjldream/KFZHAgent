import type { ComponentStyleSpec, ThemeSpec } from "@kf/contracts";
import { assertStyleAdapterRegistry, getStyleAdapter } from "./adapters/base-adapters.js";
import { compileScopedCss, serializeStyleColor, type DeclarationsByState } from "./css-compiler.js";
import { getControlCapability } from "./control-capability-registry.js";
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

export interface StyleCompilationIssue {
  code: string;
  token: string;
  message: string;
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

/**
 * Converts every registry, adapter, selector, token, and native-field problem
 * into one boundary policy shared by planners, compilers, patchers, and preview.
 */
export function listStyleCompilationIssues(
  capabilityId: string,
  compiled: CompiledControlStyle,
): StyleCompilationIssue[] {
  const issues: StyleCompilationIssue[] = [];
  const capability = getControlCapability(capabilityId);
  if (capability === undefined) {
    issues.push({
      code: "UNKNOWN_STYLE_CAPABILITY",
      token: "capability",
      message: `No reviewed capability is registered for ${capabilityId}`,
    });
  } else if (capability.style.status === "unsupported" || capability.style.status === "preserve-only") {
    issues.push({
      code: "UNSUPPORTED_STYLE_CAPABILITY",
      token: "style",
      message: `Capability ${capabilityId} style is ${capability.style.status}`,
    });
  }

  for (const unsupported of compiled.unsupported) {
    issues.push({
      code: "UNSUPPORTED_STYLE_TOKEN",
      token: unsupported.token,
      message: unsupported.reason,
    });
  }
  for (const warning of compiled.warnings) {
    if (warning.code.startsWith("STYLE_ADAPTER_") || warning.code.startsWith("STYLE_SELECTOR_")) {
      issues.push({ code: warning.code, token: "style", message: warning.message });
    }
  }

  const adapter = getStyleAdapter(capabilityId);
  for (const [field, value] of Object.entries(compiled.nativeFields)) {
    if (adapter === undefined || field !== "backgroundColor") {
      issues.push({
        code: "UNEXPECTED_NATIVE_STYLE_FIELD",
        token: `nativeFields.${field}`,
        message: `Native style field ${field} is not reviewed for capability ${capabilityId}`,
      });
      continue;
    }
    try {
      serializeStyleColor(value);
    } catch {
      issues.push({
        code: "INVALID_NATIVE_STYLE_FIELD",
        token: `nativeFields.${field}`,
        message: `Native style field ${field} has an invalid value for capability ${capabilityId}`,
      });
    }
  }

  const unique = new Map<string, StyleCompilationIssue>();
  for (const issue of issues) {
    unique.set(`${issue.code}\u0000${issue.token}\u0000${issue.message}`, issue);
  }
  return [...unique.values()];
}

/** Throws unless a compiled style is safe and supported at a persistence/render boundary. */
export function assertStyleCompilationAccepted(
  capabilityId: string,
  compiled: CompiledControlStyle,
): void {
  const issues = listStyleCompilationIssues(capabilityId, compiled);
  if (issues.length === 0) return;
  throw new Error(issues
    .map((issue) => `${issue.code}: ${issue.token}: ${issue.message}`)
    .join("; "));
}
