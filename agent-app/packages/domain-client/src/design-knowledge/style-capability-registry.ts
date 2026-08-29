import {
  StyleCapabilityProfileSchema,
  type StyleCapabilityProfile,
} from "@kf/contracts";
import { KF36_RUNTIME_PROFILE } from "../style/runtime-profile.js";
import { createKnowledgeRegistry } from "./registry.js";

type StyleKnowledgeProperty = StyleCapabilityProfile["parts"][number]["properties"][number];

interface PartSpec {
  readonly id: string;
  readonly semanticRole: string;
  readonly properties: readonly StyleKnowledgeProperty[];
}

const SURFACE = Object.freeze([
  "backgroundColor", "borderColor", "borderRadius", "boxShadow", "opacity",
] as const satisfies readonly StyleKnowledgeProperty[]);
const TYPE = Object.freeze([
  "textColor", "fontSize", "fontWeight", "lineHeight", "textAlign",
] as const satisfies readonly StyleKnowledgeProperty[]);
const SPACE = Object.freeze([
  "padding", "margin", "gap",
] as const satisfies readonly StyleKnowledgeProperty[]);
const ALL = Object.freeze([...SURFACE, ...TYPE, ...SPACE]);

function spec(
  id: string,
  semanticRole: string,
  properties: readonly StyleKnowledgeProperty[],
): PartSpec {
  return Object.freeze({ id, semanticRole, properties });
}

function profile(capabilityId: string, parts: readonly PartSpec[]): StyleCapabilityProfile {
  const runtimeParts = KF36_RUNTIME_PROFILE.selectors[capabilityId]?.parts ?? {};
  return StyleCapabilityProfileSchema.parse({
    schema: "kf-style-capability-profile/v1",
    capabilityId,
    version: "1.0.0",
    parts: parts.map((part) => {
      const runtimePart = runtimeParts[part.id];
      return {
        id: part.id,
        availability: runtimePart === undefined ? "planned" : "supported",
        semanticRoles: [part.semanticRole],
        properties: [...part.properties],
        states: runtimePart === undefined ? [] : Object.keys(runtimePart.stateSelectors),
        notes: runtimePart === undefined
          ? ["缺少经模板与运行时证据审核的语义部件 selector；必须 fail closed。"]
          : [],
      };
    }),
  });
}

const PROFILES: readonly StyleCapabilityProfile[] = Object.freeze([
  profile("text", [spec("root", "text-container", TYPE)]),
  profile("richtext", [
    spec("root", "richtext-container", ALL),
    spec("content", "richtext-content", [...TYPE, ...SPACE]),
  ]),
  profile("image", [
    spec("root", "media-container", [...SURFACE, ...SPACE]),
    spec("media", "media-content", ["borderRadius", "opacity"]),
  ]),
  profile("button", [
    spec("root", "interactive-root", [...ALL, "cursor"]),
    spec("label", "label-content", TYPE),
    spec("icon", "icon-content", [...TYPE, "opacity"]),
  ]),
  ...["tag", "easyui.2"].map((capabilityId) => profile(capabilityId, [
    spec("root", "interactive-root", ALL),
    spec("label", "label-content", TYPE),
    spec("icon", "icon-content", [...TYPE, "opacity"]),
  ])),
  profile("input", [
    spec("root", "form-control-root", ALL),
    spec("input", "input-content", [...SURFACE, ...TYPE, ...SPACE]),
    spec("label", "label-content", TYPE),
    spec("placeholder", "placeholder-content", [...TYPE, "opacity"]),
  ]),
  profile("inputnumber", [
    spec("root", "form-control-root", ALL),
    spec("input", "input-content", [...SURFACE, ...TYPE, ...SPACE]),
    spec("indicator", "indicator-content", [...TYPE, "opacity"]),
    spec("label", "label-content", TYPE),
    spec("placeholder", "placeholder-content", [...TYPE, "opacity"]),
  ]),
  profile("select", [
    spec("root", "form-control-root", ALL),
    spec("input", "input-content", [...SURFACE, ...TYPE, ...SPACE]),
    spec("indicator", "indicator-content", [...TYPE, "opacity"]),
    spec("label", "label-content", TYPE),
    spec("placeholder", "placeholder-content", [...TYPE, "opacity"]),
  ]),
  ...["checkbox", "radio", "switch"].map((capabilityId) => profile(capabilityId, [
    spec("root", "form-control-root", ALL),
    spec("indicator", "indicator-content", [...TYPE, "opacity"]),
    spec("label", "label-content", TYPE),
  ])),
  profile("datetimepicker", [
    spec("root", "form-control-root", ALL),
    spec("input", "input-content", [...SURFACE, ...TYPE, ...SPACE]),
    spec("label", "label-content", TYPE),
    spec("placeholder", "placeholder-content", [...TYPE, "opacity"]),
  ]),
  profile("tabs", [
    spec("root", "tabs-container", [...SURFACE, ...SPACE]),
    spec("tab", "tab-item", ALL),
    spec("active-indicator", "selection-indicator", ["backgroundColor", "opacity"]),
    spec("panel", "tab-panel", [...SURFACE, ...SPACE]),
  ]),
  ...["layout.2", "layout.4", "layout.5"].map((capabilityId) => profile(capabilityId, [
    spec("root", "layout-container", [...SURFACE, ...SPACE]),
  ])),
  profile("list", [
    spec("root", "list-container", [...SURFACE, ...SPACE]),
    spec("item", "list-item", ALL),
  ]),
  profile("tree", [
    spec("root", "tree-container", [...SURFACE, ...SPACE]),
    spec("node", "tree-node", ALL),
  ]),
  profile("navmenu", [
    spec("root", "navigation-container", [...SURFACE, ...SPACE]),
    spec("item", "navigation-item", ALL),
    spec("group", "navigation-group", [...SURFACE, ...SPACE]),
  ]),
  profile("easyui.1", [
    spec("root", "table-container", [...SURFACE, ...SPACE]),
    spec("header", "table-header", ALL),
    spec("row", "table-row", ALL),
    spec("cell", "table-cell", ALL),
    spec("empty", "empty-state", ALL),
  ]),
  profile("easyui.6", [
    spec("root", "search-container", [...SURFACE, ...SPACE]),
    spec("input", "search-input", [...TYPE, ...SPACE]),
    spec("placeholder", "placeholder-content", [...TYPE, "opacity"]),
  ]),
  profile("easyui.12", [
    spec("root", "dialog-container", [...SURFACE, ...SPACE]),
    spec("header", "dialog-header", ALL),
    spec("content", "dialog-content", ALL),
  ]),
  profile("easyui.18", [
    spec("root", "hierarchical-table-container", [...SURFACE, ...SPACE]),
    spec("header", "table-header", ALL),
    spec("row", "hierarchical-row", ALL),
    spec("cell", "table-cell", ALL),
  ]),
  profile("easyui.19", [
    spec("root", "window-container", [...SURFACE, ...SPACE]),
    spec("header", "window-header", ALL),
    spec("content", "window-content", ALL),
  ]),
  profile("easyui.22", [
    spec("root", "pagination-container", [...SURFACE, ...SPACE]),
    spec("item", "pagination-item", ALL),
  ]),
]);

const registry = createKnowledgeRegistry(
  PROFILES,
  (entry) => entry.capabilityId,
  "STYLE_CAPABILITY_PROFILE_NOT_FOUND",
);

export const listStyleCapabilityProfiles: () => readonly StyleCapabilityProfile[] = () => registry.list();
export const getStyleCapabilityProfile: (capabilityId: string) => StyleCapabilityProfile | undefined = (capabilityId) => registry.get(capabilityId);
export const requireStyleCapabilityProfile: (capabilityId: string) => StyleCapabilityProfile = (capabilityId) => registry.require(capabilityId);
