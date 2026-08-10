import type { ComponentStyleSpec, StyleDeclaration } from "@kf/contracts";
import { getControlCapability, listControlCapabilities } from "../control-capability-registry.js";
import type {
  StyleAdapter,
  StyleAdapterResult,
  UnsupportedStyle,
} from "../style-adapter.js";

type StyleState = keyof ComponentStyleSpec["states"];

interface AdapterDefinition {
  readonly capabilityId: string;
  readonly supportedStates: readonly StyleState[];
}

const INTERACTIVE_STATES = Object.freeze([
  "hover",
  "active",
  "focus",
  "disabled",
] as const);

const FORM_STATES = Object.freeze([
  "hover",
  "active",
  "focus",
  "disabled",
  "error",
] as const);

const SELECTABLE_STATES = Object.freeze([
  "hover",
  "active",
  "focus",
  "disabled",
  "selected",
] as const);

const ADAPTER_DEFINITIONS: readonly AdapterDefinition[] = Object.freeze([
  { capabilityId: "text", supportedStates: INTERACTIVE_STATES },
  { capabilityId: "richtext", supportedStates: FORM_STATES },
  { capabilityId: "image", supportedStates: INTERACTIVE_STATES },
  { capabilityId: "tag", supportedStates: SELECTABLE_STATES },
  { capabilityId: "button", supportedStates: SELECTABLE_STATES },
  { capabilityId: "easyui.2", supportedStates: SELECTABLE_STATES },
  { capabilityId: "input", supportedStates: FORM_STATES },
  { capabilityId: "inputnumber", supportedStates: FORM_STATES },
  { capabilityId: "select", supportedStates: SELECTABLE_STATES },
  { capabilityId: "checkbox", supportedStates: SELECTABLE_STATES },
  { capabilityId: "radio", supportedStates: SELECTABLE_STATES },
  { capabilityId: "switch", supportedStates: SELECTABLE_STATES },
  { capabilityId: "datetimepicker", supportedStates: FORM_STATES },
  { capabilityId: "tabs", supportedStates: SELECTABLE_STATES },
  { capabilityId: "spacer", supportedStates: [] },
  { capabilityId: "layout.2", supportedStates: [] },
  { capabilityId: "layout.4", supportedStates: [] },
  { capabilityId: "layout.5", supportedStates: [] },
  { capabilityId: "layout.6", supportedStates: [] },
]);

function splitDeclarations(declarations: StyleDeclaration): Pick<StyleAdapterResult, "nativeFields" | "cssDeclarations"> {
  const { backgroundColor, ...cssDeclarations } = declarations;

  return {
    // backgroundColor is a reviewed common-control field in the KF patch allowlist.
    nativeFields: backgroundColor === undefined ? {} : { backgroundColor },
    cssDeclarations: Object.keys(cssDeclarations).length === 0 ? {} : { normal: cssDeclarations },
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

function createAdapter(definition: AdapterDefinition): StyleAdapter {
  const supportedStates = new Set<string>(definition.supportedStates);

  return Object.freeze({
    capabilityId: definition.capabilityId,
    compile(style: ComponentStyleSpec): StyleAdapterResult {
      const result = splitDeclarations(style.declarations);
      const unsupported: UnsupportedStyle[] = [];

      for (const [state, declarations] of Object.entries(style.states)) {
        if (!declarations) {
          continue;
        }
        if (!supportedStates.has(state)) {
          unsupported.push(...unsupportedStateDeclarations(state, declarations, definition.capabilityId));
          continue;
        }
        result.cssDeclarations[state as StyleState] = declarations;
      }

      return { ...result, unsupported };
    },
  });
}

const STYLE_ADAPTERS: readonly StyleAdapter[] = Object.freeze(
  ADAPTER_DEFINITIONS.map(createAdapter),
);

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
  const unknownAdapterCapabilities = STYLE_ADAPTERS
    .map((adapter) => adapter.capabilityId)
    .filter((capabilityId) => !getControlCapability(capabilityId));

  if (missingAdapters.length > 0 || unknownAdapterCapabilities.length > 0) {
    throw new Error(
      "STYLE_ADAPTER_REGISTRY_MISMATCH: " +
        `missing=[${missingAdapters.join(", ")}]; ` +
        `unknown=[${unknownAdapterCapabilities.join(", ")}]`,
    );
  }
}

assertStyleAdapterRegistry();

export function listStyleAdapters(): readonly StyleAdapter[] {
  return STYLE_ADAPTERS;
}

export function getStyleAdapter(capabilityId: string): StyleAdapter | undefined {
  return STYLE_ADAPTERS_BY_CAPABILITY.get(capabilityId);
}
