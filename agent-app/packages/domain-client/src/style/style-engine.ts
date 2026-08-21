import { createHash } from "node:crypto";
import {
  ComponentStyleSpecV2Schema,
  NativeThemeSpecSchema,
  type ApprovedAssetFacts,
  type ComponentStyleSpec,
  type StyleDeclarationV2,
  type ThemeSpec,
} from "@kf/contracts";
import type { z } from "zod";
import { assertStyleAdapterRegistry, getStyleAdapter } from "./adapters/base-adapters.js";
import {
  compileScopedCss,
  compileScopedStyleFragment,
  serializeStyleColor,
  type CompiledScopedStyleFragment,
  type DeclarationsByState,
  type StyleState,
} from "./css-compiler.js";
import { getControlCapability } from "./control-capability-registry.js";
import { requireStyleCapabilityProfile } from "../design-knowledge/style-capability-registry.js";
import {
  isTrustedKF36RuntimeProfile,
  type KFRuntimeProfile,
} from "./runtime-profile.js";
import type {
  CompiledControlStyle,
  CompiledStyleFragment,
  NativeStyleFields,
  StyleAdapter,
  StyleDeclarationKey,
  StylePartAdapter,
  StyleWarning,
  UnsupportedStyle,
} from "./style-adapter.js";
import { resolveComponentStyle, resolveStyle } from "./theme-resolver.js";

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

type ComponentStyleSpecV2 = z.infer<typeof ComponentStyleSpecV2Schema>;

export interface CompileResolvedStyleInput {
  readonly componentId: string;
  readonly capabilityId: string;
  readonly theme: ThemeSpec;
  readonly styleRole: string;
  readonly roleStyle: ComponentStyleSpecV2;
  readonly instanceOverride?: ComponentStyleSpecV2;
  readonly approvedAssets: readonly ApprovedAssetFacts[];
  readonly runtimeProfile: KFRuntimeProfile;
}

const EMPTY_STYLE_V2: ComponentStyleSpecV2 = Object.freeze({
  declarations: Object.freeze({}),
  states: Object.freeze({}),
});
const STYLE_STATE_ORDER: readonly StyleState[] = [
  "normal", "hover", "active", "focus", "disabled", "selected", "error",
];

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

function componentScopeToken(componentId: string): string {
  const normalized = componentId.normalize("NFKC").trim();
  if (normalized.length === 0 || normalized.length > 100) {
    throw new Error("STYLE_COMPONENT_ID_INVALID");
  }
  const escaped = Array.from(normalized)
    .map((character) => /[A-Za-z0-9_-]/.test(character)
      ? character
      : `_u${character.codePointAt(0)!.toString(16)}_`)
    .join("");
  const safePrefix = /^[A-Za-z]/.test(escaped) ? escaped : `c_${escaped}`;
  const digest = createHash("sha256").update(componentId, "utf8").digest("hex").slice(0, 32);
  return `kf36-${safePrefix.slice(0, 40)}-${digest}`;
}

function declarationsForState(
  partStyle: { readonly declarations: StyleDeclarationV2; readonly states: ComponentStyleSpecV2["states"] },
  state: StyleState,
): StyleDeclarationV2 | undefined {
  if (state === "normal") return partStyle.declarations;
  return partStyle.states[state];
}

function declarationKeys(declarations: StyleDeclarationV2): StyleDeclarationKey[] {
  return Object.keys(declarations) as StyleDeclarationKey[];
}

function selectDeclarations(
  declarations: StyleDeclarationV2,
  keys: readonly StyleDeclarationKey[],
): StyleDeclarationV2 {
  const selected: StyleDeclarationV2 = {};
  for (const key of keys) {
    const value = declarations[key];
    if (value !== undefined) Object.assign(selected, { [key]: value });
  }
  return selected;
}

function assignNativeDeclarations(
  target: NativeStyleFields,
  declarations: StyleDeclarationV2,
  nativeKeys: readonly StyleDeclarationKey[],
): void {
  for (const key of nativeKeys) {
    const value = declarations[key];
    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
      throw new Error(`STYLE_NATIVE_VALUE_UNSUPPORTED: ${key}`);
    }
    if (key === "backgroundColor"
      && (typeof value !== "string" || !NativeThemeSpecSchema.shape.background.safeParse(value).success)) {
      throw new Error(`STYLE_NATIVE_VALUE_UNSUPPORTED: ${key}`);
    }
    target[key] = value;
  }
}

function assertPartKnowledge(
  capabilityId: string,
  semanticPart: string,
  adapterPart: StylePartAdapter | undefined,
): StylePartAdapter {
  const knowledgePart = requireStyleCapabilityProfile(capabilityId).parts
    .find((candidate) => candidate.id === semanticPart);
  if (adapterPart === undefined || knowledgePart?.availability !== "supported") {
    throw new Error(`STYLE_PART_UNSUPPORTED: ${capabilityId}.${semanticPart}`);
  }
  return adapterPart;
}

interface CompilePartContext {
  readonly input: CompileResolvedStyleInput;
  readonly adapter: StyleAdapter;
  readonly scopeToken: string;
  readonly nativeFields: NativeStyleFields;
  readonly cssFragments: CompiledStyleFragment[];
  readonly scopedFragments: CompiledScopedStyleFragment[];
}

function compileResolvedPart(
  context: CompilePartContext,
  semanticPart: string,
  partStyle: { readonly declarations: StyleDeclarationV2; readonly states: ComponentStyleSpecV2["states"] },
): void {
  const adapterPart = assertPartKnowledge(
    context.input.capabilityId,
    semanticPart,
    context.adapter.parts.find((candidate) => candidate.semanticPart === semanticPart),
  );
  const mapping = context.input.runtimeProfile.selectors[context.input.capabilityId]?.parts[semanticPart];
  if (mapping === undefined || mapping.selector !== adapterPart.selector) {
    throw new Error(`STYLE_SELECTOR_UNAVAILABLE: ${context.input.capabilityId}.${semanticPart}`);
  }

  for (const state of STYLE_STATE_ORDER) {
    const declarations = declarationsForState(partStyle, state);
    if (declarations === undefined || declarationKeys(declarations).length === 0) continue;
    if (state !== "normal" && !adapterPart.supportedStates.includes(state)) {
      throw new Error(`STYLE_STATE_UNSUPPORTED: ${context.input.capabilityId}.${semanticPart}.${state}`);
    }
    const keys = declarationKeys(declarations);
    const nativeKeys = state === "normal" && semanticPart === "root"
      ? keys.filter((key) => adapterPart.nativeProperties.includes(key))
      : [];
    const cssKeys = keys.filter((key) => !nativeKeys.includes(key) && adapterPart.cssProperties.includes(key));
    const unsupportedKeys = keys.filter((key) => !nativeKeys.includes(key) && !cssKeys.includes(key));
    if (unsupportedKeys.length > 0) {
      throw new Error(
        `STYLE_PROPERTY_UNSUPPORTED: ${context.input.capabilityId}.${semanticPart}.${state}.${unsupportedKeys.sort().join(",")}`,
      );
    }
    assignNativeDeclarations(context.nativeFields, declarations, nativeKeys);
    if (cssKeys.length === 0) continue;
    const cssDeclarations = selectDeclarations(declarations, cssKeys);
    const scoped = compileScopedStyleFragment(
      mapping,
      context.scopeToken,
      state,
      cssDeclarations,
      context.input.approvedAssets,
    );
    context.cssFragments.push(Object.freeze({
      selectorToken: scoped.selectorToken,
      state,
      declarations: cssDeclarations,
    }));
    context.scopedFragments.push(scoped);
  }
}

/**
 * Compiles native v2 style intent through the evidence-pinned KF 3.6 profile.
 * The caller supplies semantic IDs and structured declarations, never selectors.
 */
export function compileResolvedStyle(input: CompileResolvedStyleInput): CompiledControlStyle {
  assertStyleAdapterRegistry();
  if (!isTrustedKF36RuntimeProfile(input.runtimeProfile)) {
    throw new Error("UNTRUSTED_RUNTIME_PROFILE");
  }
  const capability = getControlCapability(input.capabilityId);
  if (capability === undefined) throw new Error(`STYLE_CAPABILITY_UNAVAILABLE: ${input.capabilityId}`);
  if (capability.style.status === "preserve-only" || capability.style.status === "unsupported") {
    throw new Error(`STYLE_CAPABILITY_${capability.style.status.replace("-", "_").toUpperCase()}: ${input.capabilityId}`);
  }
  const adapter = getStyleAdapter(input.capabilityId);
  if (adapter === undefined) throw new Error(`STYLE_ADAPTER_UNAVAILABLE: ${input.capabilityId}`);
  const roleStyle = ComponentStyleSpecV2Schema.parse(input.roleStyle);
  const instanceOverride = ComponentStyleSpecV2Schema.parse(input.instanceOverride ?? EMPTY_STYLE_V2);
  if (roleStyle.role !== input.styleRole) {
    throw new Error(`STYLE_ROLE_MISMATCH: ${roleStyle.role ?? "missing"} != ${input.styleRole}`);
  }
  if (instanceOverride.role !== undefined && instanceOverride.role !== input.styleRole) {
    throw new Error(`STYLE_ROLE_MISMATCH: ${instanceOverride.role} != ${input.styleRole}`);
  }
  const resolved = resolveStyle(input.theme, roleStyle, instanceOverride);
  const scopeToken = componentScopeToken(input.componentId);
  const nativeFields: NativeStyleFields = {};
  const cssFragments: CompiledStyleFragment[] = [];
  const scopedFragments: CompiledScopedStyleFragment[] = [];
  const context: CompilePartContext = {
    input, adapter, scopeToken, nativeFields, cssFragments, scopedFragments,
  };

  compileResolvedPart(context, "root", {
    declarations: resolved.declarations,
    states: resolved.states,
  });
  const resolvedParts = resolved.parts ?? {};
  const adapterPartIds = new Set(adapter.parts.map((part) => part.semanticPart));
  for (const semanticPart of Object.keys(resolvedParts)) {
    if (!adapterPartIds.has(semanticPart)) {
      throw new Error(`STYLE_PART_UNSUPPORTED: ${input.capabilityId}.${semanticPart}`);
    }
  }
  for (const adapterPart of adapter.parts) {
    if (adapterPart.semanticPart === "root") continue;
    const partStyle = resolvedParts[adapterPart.semanticPart];
    if (partStyle !== undefined) compileResolvedPart(context, adapterPart.semanticPart, partStyle);
  }

  return {
    nativeFields,
    styleDataNew: scopedFragments.map((fragment) => fragment.cssText).join(""),
    unsupported: [],
    warnings: [],
    scopeToken,
    cssFragments,
    scopedFragments,
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
  const capability = getControlCapability(input.capabilityId);
  if (capability?.style.status === "preserve-only" || capability?.style.status === "unsupported") {
    const code = `STYLE_CAPABILITY_${capability.style.status.replace("-", "_").toUpperCase()}`;
    const reason = `Capability ${input.capabilityId} style is ${capability.style.status}`;
    return {
      nativeFields: {},
      styleDataNew: "",
      unsupported: unsupportedDeclarations(resolvedStyle, reason),
      warnings: [{ code, message: reason }],
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
      if (typeof value !== "string") throw new Error("native color must be a string");
      if (compiled.scopeToken === undefined) {
        serializeStyleColor(value);
      } else if (!NativeThemeSpecSchema.shape.background.safeParse(value).success) {
        throw new Error("native v2 color is invalid");
      }
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
