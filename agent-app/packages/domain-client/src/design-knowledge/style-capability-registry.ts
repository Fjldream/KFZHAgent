import {
  StyleCapabilityProfileSchema,
  type StyleCapabilityProfile,
} from "@kf/contracts";
import { listControlDesignProfiles } from "./control-design-registry.js";
import { createKnowledgeRegistry } from "./registry.js";

const SURFACE = ["backgroundColor", "borderColor", "borderRadius", "boxShadow", "opacity"] as const;
const TYPE = ["textColor", "fontSize", "fontWeight", "lineHeight", "textAlign"] as const;
const SPACE = ["padding", "margin", "gap"] as const;
const INTERACTIVE = ["hover", "active", "focus", "disabled", "selected"] as const;
const FORM = ["hover", "active", "focus", "disabled", "error"] as const;

const RAW_PROFILES: readonly unknown[] = [
  {
    schema: "kf-style-capability-profile/v1", capabilityId: "text", version: "1.0.0",
    parts: [{ id: "root", availability: "supported", semanticRoles: ["text-container"], properties: [...TYPE], states: ["hover", "active", "focus", "disabled"], notes: [] }],
  },
  {
    schema: "kf-style-capability-profile/v1", capabilityId: "richtext", version: "1.0.0",
    parts: [
      { id: "root", availability: "supported", semanticRoles: ["richtext-container"], properties: [...SURFACE, ...TYPE, ...SPACE], states: [...FORM], notes: [] },
      { id: "content", availability: "planned", semanticRoles: ["richtext-content"], properties: [...TYPE, ...SPACE], states: [], notes: ["需要专用适配器后才可安全编译内部内容样式。"] },
    ],
  },
  {
    schema: "kf-style-capability-profile/v1", capabilityId: "image", version: "1.0.0",
    parts: [
      { id: "root", availability: "supported", semanticRoles: ["media-container"], properties: [...SURFACE, ...SPACE], states: ["hover", "active", "focus", "disabled"], notes: [] },
      { id: "media", availability: "planned", semanticRoles: ["media-content"], properties: ["opacity"], states: [], notes: ["媒体元素需要专用选择器适配。"] },
    ],
  },
  ...["tag", "button", "easyui.2"].map((capabilityId) => ({
    schema: "kf-style-capability-profile/v1",
    capabilityId,
    version: "1.0.0",
    parts: [
      { id: "root", availability: "supported", semanticRoles: ["interactive-root"], properties: [...SURFACE, ...TYPE, ...SPACE], states: [...INTERACTIVE], notes: [] },
      { id: "label", availability: "planned", semanticRoles: ["label-content"], properties: [...TYPE], states: [], notes: ["文本子元素需要专用适配器。"] },
      { id: "icon", availability: "planned", semanticRoles: ["icon-content"], properties: [...TYPE], states: [], notes: ["图标子元素需要专用适配器。"] },
    ],
  })),
  ...[
    { capabilityId: "input", parts: ["input", "label", "placeholder"] },
    { capabilityId: "inputnumber", parts: ["input", "indicator", "label", "placeholder"] },
    { capabilityId: "select", parts: ["input", "indicator", "label", "placeholder"] },
    { capabilityId: "checkbox", parts: ["indicator", "label"] },
    { capabilityId: "radio", parts: ["indicator", "label"] },
    { capabilityId: "switch", parts: ["indicator", "label"] },
    { capabilityId: "datetimepicker", parts: ["input", "label", "placeholder"] },
  ].map(({ capabilityId, parts }) => ({
    schema: "kf-style-capability-profile/v1",
    capabilityId,
    version: "1.0.0",
    parts: [
      { id: "root", availability: "supported", semanticRoles: ["form-control-root"], properties: [...SURFACE, ...TYPE, ...SPACE], states: [...FORM], notes: [] },
      ...parts.map((id) => ({
        id,
        availability: "planned",
        semanticRoles: [`${id}-content`],
        properties: [...TYPE],
        states: [],
        notes: ["内部控件部分需要专用适配器。"],
      })),
    ],
  })),
  {
    schema: "kf-style-capability-profile/v1", capabilityId: "tabs", version: "1.0.0",
    parts: [
      { id: "root", availability: "supported", semanticRoles: ["tabs-container"], properties: [...SURFACE, ...SPACE], states: [...INTERACTIVE], notes: [] },
      { id: "tab", availability: "planned", semanticRoles: ["tab-item"], properties: [...SURFACE, ...TYPE, ...SPACE], states: [...INTERACTIVE], notes: ["标签项需要专用适配器。"] },
      { id: "active-indicator", availability: "planned", semanticRoles: ["selection-indicator"], properties: ["backgroundColor", "opacity"], states: [], notes: ["活动指示器需要专用适配器。"] },
      { id: "panel", availability: "planned", semanticRoles: ["tab-panel"], properties: [...SURFACE, ...SPACE], states: [], notes: ["内容面板需要专用适配器。"] },
    ],
  },
  ...["layout.2", "layout.4", "layout.5"].map((capabilityId) => ({
    schema: "kf-style-capability-profile/v1",
    capabilityId,
    version: "1.0.0",
    parts: [{ id: "root", availability: "supported", semanticRoles: ["layout-container"], properties: [...SURFACE, ...SPACE], states: [], notes: [] }],
  })),
  {
    schema: "kf-style-capability-profile/v1", capabilityId: "list", version: "1.0.0",
    parts: [
      { id: "root", availability: "planned", semanticRoles: ["list-container"], properties: [...SURFACE, ...SPACE], states: [], notes: ["列表没有已审核的样式适配器。"] },
      { id: "item", availability: "planned", semanticRoles: ["list-item"], properties: [...SURFACE, ...TYPE, ...SPACE], states: [...INTERACTIVE], notes: ["列表项没有已审核的样式适配器。"] },
    ],
  },
  {
    schema: "kf-style-capability-profile/v1", capabilityId: "tree", version: "1.0.0",
    parts: [
      { id: "root", availability: "planned", semanticRoles: ["tree-container"], properties: [...SURFACE, ...SPACE], states: [], notes: ["树控件没有已审核的样式适配器。"] },
      { id: "node", availability: "planned", semanticRoles: ["tree-node"], properties: [...SURFACE, ...TYPE, ...SPACE], states: [...INTERACTIVE], notes: ["树节点没有已审核的样式适配器。"] },
    ],
  },
  {
    schema: "kf-style-capability-profile/v1", capabilityId: "navmenu", version: "1.0.0",
    parts: [
      { id: "root", availability: "planned", semanticRoles: ["navigation-container"], properties: [...SURFACE, ...SPACE], states: [], notes: ["导航菜单没有已审核的样式适配器。"] },
      { id: "item", availability: "planned", semanticRoles: ["navigation-item"], properties: [...SURFACE, ...TYPE, ...SPACE], states: [...INTERACTIVE], notes: ["导航项没有已审核的样式适配器。"] },
      { id: "group", availability: "planned", semanticRoles: ["navigation-group"], properties: [...SURFACE, ...SPACE], states: [], notes: ["导航分组没有已审核的样式适配器。"] },
    ],
  },
  {
    schema: "kf-style-capability-profile/v1", capabilityId: "easyui.1", version: "1.0.0",
    parts: [
      { id: "root", availability: "planned", semanticRoles: ["table-container"], properties: [...SURFACE, ...SPACE], states: [], notes: ["数据表没有已审核的样式适配器。"] },
      { id: "header", availability: "planned", semanticRoles: ["table-header"], properties: [...SURFACE, ...TYPE, ...SPACE], states: [], notes: ["表头没有已审核的样式适配器。"] },
      { id: "row", availability: "planned", semanticRoles: ["table-row"], properties: [...SURFACE, ...TYPE, ...SPACE], states: [...INTERACTIVE], notes: ["行元素没有已审核的样式适配器。"] },
      { id: "cell", availability: "planned", semanticRoles: ["table-cell"], properties: [...SURFACE, ...TYPE, ...SPACE], states: [], notes: ["单元格没有已审核的样式适配器。"] },
      { id: "empty", availability: "planned", semanticRoles: ["empty-state"], properties: [...SURFACE, ...TYPE, ...SPACE], states: [], notes: ["空状态没有已审核的样式适配器。"] },
    ],
  },
  {
    schema: "kf-style-capability-profile/v1", capabilityId: "easyui.6", version: "1.0.0",
    parts: [
      { id: "root", availability: "planned", semanticRoles: ["search-container"], properties: [...SURFACE, ...SPACE], states: [], notes: ["搜索控件没有已审核的样式适配器。"] },
      { id: "input", availability: "planned", semanticRoles: ["search-input"], properties: [...TYPE, ...SPACE], states: [...FORM], notes: ["搜索输入区域没有已审核的样式适配器。"] },
      { id: "placeholder", availability: "planned", semanticRoles: ["placeholder-content"], properties: [...TYPE], states: [], notes: ["占位内容没有已审核的样式适配器。"] },
    ],
  },
  {
    schema: "kf-style-capability-profile/v1", capabilityId: "easyui.12", version: "1.0.0",
    parts: [
      { id: "root", availability: "planned", semanticRoles: ["dialog-container"], properties: [...SURFACE, ...SPACE], states: [], notes: ["弹窗没有已审核的样式适配器。"] },
      { id: "header", availability: "planned", semanticRoles: ["dialog-header"], properties: [...SURFACE, ...TYPE, ...SPACE], states: [], notes: ["弹窗标题区没有已审核的样式适配器。"] },
      { id: "content", availability: "planned", semanticRoles: ["dialog-content"], properties: [...SURFACE, ...TYPE, ...SPACE], states: [], notes: ["弹窗内容区没有已审核的样式适配器。"] },
    ],
  },
  {
    schema: "kf-style-capability-profile/v1", capabilityId: "easyui.18", version: "1.0.0",
    parts: [
      { id: "root", availability: "planned", semanticRoles: ["hierarchical-table-container"], properties: [...SURFACE, ...SPACE], states: [], notes: ["树表没有已审核的样式适配器。"] },
      { id: "header", availability: "planned", semanticRoles: ["table-header"], properties: [...SURFACE, ...TYPE, ...SPACE], states: [], notes: ["表头没有已审核的样式适配器。"] },
      { id: "row", availability: "planned", semanticRoles: ["hierarchical-row"], properties: [...SURFACE, ...TYPE, ...SPACE], states: [...INTERACTIVE], notes: ["行元素没有已审核的样式适配器。"] },
      { id: "cell", availability: "planned", semanticRoles: ["table-cell"], properties: [...SURFACE, ...TYPE, ...SPACE], states: [], notes: ["单元格没有已审核的样式适配器。"] },
    ],
  },
  {
    schema: "kf-style-capability-profile/v1", capabilityId: "easyui.19", version: "1.0.0",
    parts: [
      { id: "root", availability: "planned", semanticRoles: ["window-container"], properties: [...SURFACE, ...SPACE], states: [], notes: ["窗口没有已审核的样式适配器。"] },
      { id: "header", availability: "planned", semanticRoles: ["window-header"], properties: [...SURFACE, ...TYPE, ...SPACE], states: [], notes: ["窗口标题区没有已审核的样式适配器。"] },
      { id: "content", availability: "planned", semanticRoles: ["window-content"], properties: [...SURFACE, ...TYPE, ...SPACE], states: [], notes: ["窗口内容区没有已审核的样式适配器。"] },
    ],
  },
  {
    schema: "kf-style-capability-profile/v1", capabilityId: "easyui.22", version: "1.0.0",
    parts: [
      { id: "root", availability: "planned", semanticRoles: ["pagination-container"], properties: [...SURFACE, ...SPACE], states: [], notes: ["分页控件没有已审核的样式适配器。"] },
      { id: "item", availability: "planned", semanticRoles: ["pagination-item"], properties: [...SURFACE, ...TYPE, ...SPACE], states: [...INTERACTIVE], notes: ["分页项没有已审核的样式适配器。"] },
    ],
  },
];

const PROFILES = RAW_PROFILES.map((profile) => StyleCapabilityProfileSchema.parse(profile));
const controlProfileIds = new Set(listControlDesignProfiles().map((profile) => profile.capabilityId));

for (const profile of PROFILES) {
  if (!controlProfileIds.has(profile.capabilityId)) {
    throw new Error(`STYLE_CAPABILITY_PROFILE_CONTROL_NOT_FOUND: ${profile.capabilityId}`);
  }
}

const registry = createKnowledgeRegistry(
  PROFILES,
  (profile) => profile.capabilityId,
  "STYLE_CAPABILITY_PROFILE_NOT_FOUND",
);

export const listStyleCapabilityProfiles: () => readonly StyleCapabilityProfile[] = registry.list;
export const getStyleCapabilityProfile: (capabilityId: string) => StyleCapabilityProfile | undefined = registry.get;
export const requireStyleCapabilityProfile: (capabilityId: string) => StyleCapabilityProfile = registry.require;
