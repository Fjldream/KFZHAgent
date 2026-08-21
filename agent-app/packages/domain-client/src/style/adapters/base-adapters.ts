import type { ComponentStyleSpec, StyleDeclaration } from "@kf/contracts";
import { getControlCapability, listControlCapabilities } from "../control-capability-registry.js";
import { serializeStyleColor } from "../css-compiler.js";
import {
  KF36_RUNTIME_PROFILE,
  isTrustedKF36StylePart,
  type KFStylePartSelector,
} from "../runtime-profile.js";
import type {
  StyleAdapter,
  StyleAdapterResult,
  StyleDeclarationKey,
  StylePartAdapter,
  UnsupportedStyle,
} from "../style-adapter.js";

type LegacyStyleState = keyof ComponentStyleSpec["states"];

const SURFACE_PROPERTIES = Object.freeze([
  "backgroundColor", "borderColor",
  "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
  "borderTopColor", "borderRightColor", "borderBottomColor", "borderLeftColor",
  "borderRadius", "borderTopLeftRadius", "borderTopRightRadius",
  "borderBottomRightRadius", "borderBottomLeftRadius", "boxShadow", "opacity",
] as const satisfies readonly StyleDeclarationKey[]);
const TYPE_PROPERTIES = Object.freeze([
  "textColor", "fontSize", "fontWeight", "lineHeight", "textAlign", "truncate",
] as const satisfies readonly StyleDeclarationKey[]);
const ROOT_GEOMETRY_PROPERTIES = Object.freeze([
  "letterSpacing", "padding", "paddingHorizontal", "paddingVertical",
] as const satisfies readonly StyleDeclarationKey[]);
const EFFECT_PROPERTIES = Object.freeze([
  "focusRing", "transition", "advanced",
] as const satisfies readonly StyleDeclarationKey[]);
const ICON_PROPERTIES = Object.freeze([
  "iconSize", "iconColor", "iconGap", "opacity", "transition", "advanced",
] as const satisfies readonly StyleDeclarationKey[]);
const ROOT_CSS_PROPERTIES = Object.freeze([
  ...SURFACE_PROPERTIES,
  ...TYPE_PROPERTIES,
  ...ROOT_GEOMETRY_PROPERTIES,
  ...EFFECT_PROPERTIES,
  "overflow",
] as const satisfies readonly StyleDeclarationKey[]);

const PRESERVE_ONLY_EVIDENCE_ADAPTERS = new Set([
  "easyui.1", "easyui.12", "easyui.19", "list", "navmenu", "tree",
]);

function partProperties(semanticPart: string): readonly StyleDeclarationKey[] {
  if (semanticPart === "root") return ROOT_CSS_PROPERTIES;
  if (semanticPart === "media") {
    return Object.freeze(["objectFit", "opacity", "borderRadius", "transition", "advanced"] as const);
  }
  if (semanticPart === "icon" || semanticPart === "indicator") return ICON_PROPERTIES;
  if (semanticPart === "placeholder") {
    return Object.freeze(["textColor", "fontSize", "fontWeight", "lineHeight", "opacity"] as const);
  }
  if (semanticPart === "active-indicator") {
    return Object.freeze(["backgroundColor", "opacity", "transition", "advanced"] as const);
  }
  if (semanticPart === "input") {
    return Object.freeze([...SURFACE_PROPERTIES, ...TYPE_PROPERTIES, ...EFFECT_PROPERTIES] as const);
  }
  if (semanticPart === "label") return TYPE_PROPERTIES;
  return Object.freeze([...SURFACE_PROPERTIES, ...TYPE_PROPERTIES, ...EFFECT_PROPERTIES] as const);
}

function createPartAdapter(
  capabilityId: string,
  selectorMapping: KFStylePartSelector,
  nativeAllowed: boolean,
): StylePartAdapter {
  if (!isTrustedKF36StylePart(selectorMapping)) {
    throw new Error(`UNTRUSTED_STYLE_PART_SELECTOR: ${capabilityId}.${selectorMapping.semanticPart}`);
  }
  return Object.freeze({
    semanticPart: selectorMapping.semanticPart,
    selector: selectorMapping.selector,
    nativeProperties: Object.freeze(
      nativeAllowed && selectorMapping.semanticPart === "root"
        ? ["backgroundColor" as const]
        : [],
    ),
    cssProperties: partProperties(selectorMapping.semanticPart),
    supportedStates: Object.freeze(Object.keys(selectorMapping.stateSelectors)),
  });
}

function splitDeclarations(
  declarations: StyleDeclaration,
  rootPart: StylePartAdapter,
): Pick<StyleAdapterResult, "nativeFields" | "cssDeclarations"> {
  const { backgroundColor, ...cssDeclarations } = declarations;
  const nativeBackground = rootPart.nativeProperties.includes("backgroundColor") && backgroundColor !== undefined
    ? { backgroundColor: serializeStyleColor(backgroundColor) }
    : {};
  const cssBackground = rootPart.nativeProperties.includes("backgroundColor")
    ? {}
    : backgroundColor === undefined ? {} : { backgroundColor };
  const css = { ...cssBackground, ...cssDeclarations };
  return {
    nativeFields: nativeBackground,
    cssDeclarations: Object.keys(css).length === 0 ? {} : { normal: css },
  };
}

function unsupportedStateDeclarations(
  state: string,
  declarations: StyleDeclaration,
  capabilityId: string,
): UnsupportedStyle[] {
  return Object.keys(declarations).map((key) => ({
    token: `states.${state}.${key}`,
    reason: `State ${state} is not supported by the ${capabilityId} adapter`,
  }));
}

function createAdapter(capabilityId: string): StyleAdapter {
  const selectorRoles = KF36_RUNTIME_PROFILE.selectors[capabilityId];
  if (selectorRoles === undefined) throw new Error(`STYLE_SELECTOR_UNAVAILABLE: ${capabilityId}`);
  const nativeAllowed = !PRESERVE_ONLY_EVIDENCE_ADAPTERS.has(capabilityId);
  const parts = Object.values(selectorRoles.parts).map((mapping) =>
    createPartAdapter(capabilityId, mapping, nativeAllowed));
  const rootPart = parts.find((candidate) => candidate.semanticPart === "root");
  if (rootPart === undefined) throw new Error(`STYLE_ROOT_PART_MISSING: ${capabilityId}`);
  const supportedStates = new Set(rootPart.supportedStates);

  return Object.freeze({
    capabilityId,
    parts: Object.freeze(parts),
    compile(style: ComponentStyleSpec): StyleAdapterResult {
      const result = splitDeclarations(style.declarations, rootPart);
      const unsupported: UnsupportedStyle[] = [];
      for (const [state, declarations] of Object.entries(style.states)) {
        if (declarations === undefined) continue;
        if (!supportedStates.has(state)) {
          unsupported.push(...unsupportedStateDeclarations(state, declarations, capabilityId));
          continue;
        }
        result.cssDeclarations[state as LegacyStyleState] = declarations;
      }
      return { ...result, unsupported };
    },
  });
}

const adapterCapabilityIds = Object.freeze([
  "text", "richtext", "image", "tag", "button", "easyui.2", "input", "inputnumber",
  "select", "checkbox", "radio", "switch", "datetimepicker", "tabs", "spacer",
  "layout.2", "layout.4", "layout.5", "layout.6",
  ...PRESERVE_ONLY_EVIDENCE_ADAPTERS,
]);
const STYLE_ADAPTERS: readonly StyleAdapter[] = Object.freeze(adapterCapabilityIds.map(createAdapter));
const STYLE_ADAPTERS_BY_CAPABILITY = new Map(
  STYLE_ADAPTERS.map((adapter) => [adapter.capabilityId, adapter]),
);

/** Ensures registry metadata cannot claim an adapter which the engine lacks. */
export function assertStyleAdapterRegistry(): void {
  const pendingStyleCapabilities = listControlCapabilities()
    .filter((capability) => capability.style.status === "pending-verification");
  const missingAdapters = pendingStyleCapabilities
    .filter((capability) =>
      !capability.style.adapter
      || capability.style.adapter !== capability.id
      || !STYLE_ADAPTERS_BY_CAPABILITY.has(capability.id),
    )
    .map((capability) => capability.id);
  const invalidAdapters = STYLE_ADAPTERS
    .filter((adapter) => {
      const capability = getControlCapability(adapter.capabilityId);
      return capability === undefined
        || (capability.style.status !== "pending-verification"
          && !PRESERVE_ONLY_EVIDENCE_ADAPTERS.has(adapter.capabilityId));
    })
    .map((adapter) => adapter.capabilityId);

  if (missingAdapters.length > 0 || invalidAdapters.length > 0) {
    throw new Error(
      "STYLE_ADAPTER_REGISTRY_MISMATCH: " +
        `missing=[${missingAdapters.join(", ")}]; invalid=[${invalidAdapters.join(", ")}]`,
    );
  }
}

export function listStyleAdapters(): readonly StyleAdapter[] {
  return STYLE_ADAPTERS;
}

export function getStyleAdapter(capabilityId: string): StyleAdapter | undefined {
  return STYLE_ADAPTERS_BY_CAPABILITY.get(capabilityId);
}
