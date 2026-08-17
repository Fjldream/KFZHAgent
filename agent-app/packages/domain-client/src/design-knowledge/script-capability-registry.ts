import {
  ScriptCapabilityProfileSchema,
  type ScriptCapabilityProfile,
} from "@kf/contracts";
import { listControlDesignProfiles } from "./control-design-registry.js";
import { createKnowledgeRegistry } from "./registry.js";

const TEMPLATE = (ref: string) => ({ kind: "template", ref });
const ACTION_EVIDENCE = [
  { kind: "product-source", ref: "ir/client-project-ir.schema.ts#RestrictedAction" },
  { kind: "compiler", ref: "compile/control-compiler.ts#compileAction" },
] as const;

function plannedProfile(capabilityId: string): unknown {
  return {
    schema: "kf-script-capability-profile/v1",
    capabilityId,
    version: "1.0.0",
    availability: "planned",
    actions: [],
    events: [],
    methods: [],
    initialization: {
      supportsConfigureData: capabilityId.startsWith("easyui."),
      lifecycleEvents: [],
    },
    limitations: ["该控件尚无经过审核的前端演示交互编译路径。"],
  };
}

const REVIEWED_PROFILES: Readonly<Record<string, unknown>> = {
  button: {
    schema: "kf-script-capability-profile/v1",
    capabilityId: "button",
    version: "1.0.0",
    availability: "supported",
    actions: [
      { semanticAction: "navigate-page", implementation: "restricted-action", availability: "supported", evidence: ACTION_EVIDENCE },
      { semanticAction: "set-variable", implementation: "restricted-action", availability: "supported", evidence: ACTION_EVIDENCE },
      { semanticAction: "open-dialog", implementation: "restricted-action", availability: "planned", evidence: [] },
    ],
    events: [],
    methods: [],
    initialization: { supportsConfigureData: false, lifecycleEvents: [] },
    limitations: ["当前受限动作 DSL 只可生成页面跳转和变量赋值，不能生成弹窗打开动作。"],
  },
  checkbox: {
    schema: "kf-script-capability-profile/v1",
    capabilityId: "checkbox",
    version: "1.0.0",
    availability: "supported",
    actions: [],
    events: [
      { semanticEvent: "change", kfEvent: "Change", availability: "supported", arguments: [], evidence: [TEMPLATE("templates/control-templates/checkbox.json#connectArray")] },
    ],
    methods: [],
    initialization: { supportsConfigureData: false, lifecycleEvents: [] },
    limitations: ["复选框事件可识别，但尚未提供事件脚本编译器。"],
  },
  image: {
    schema: "kf-script-capability-profile/v1",
    capabilityId: "image",
    version: "1.0.0",
    availability: "supported",
    actions: [],
    events: [
      { semanticEvent: "load", kfEvent: "Load", linkId: 200001, availability: "supported", arguments: [], evidence: [TEMPLATE("templates/control-templates/image.json#linkMng")] },
      { semanticEvent: "error", kfEvent: "Error", linkId: 200002, availability: "supported", arguments: [], evidence: [TEMPLATE("templates/control-templates/image.json#linkMng")] },
    ],
    methods: [],
    initialization: { supportsConfigureData: false, lifecycleEvents: ["load", "error"] },
    limitations: ["图片加载事件的脚本内容仍需要经过后续脚本编译与安全审核。"],
  },
  select: {
    schema: "kf-script-capability-profile/v1",
    capabilityId: "select",
    version: "1.0.0",
    availability: "supported",
    actions: [],
    events: [
      { semanticEvent: "change", kfEvent: "Change", availability: "supported", arguments: [], evidence: [TEMPLATE("templates/control-templates/select.json#connectArray")] },
      { semanticEvent: "visible-change", kfEvent: "visible-Change", availability: "supported", arguments: [], evidence: [TEMPLATE("templates/control-templates/select.json#connectArray")] },
      { semanticEvent: "remove-tag", kfEvent: "Remove-Tag", availability: "supported", arguments: [], evidence: [TEMPLATE("templates/control-templates/select.json#connectArray")] },
      { semanticEvent: "clear", kfEvent: "Clear", availability: "supported", arguments: [], evidence: [TEMPLATE("templates/control-templates/select.json#connectArray")] },
      { semanticEvent: "blur", kfEvent: "Blur", availability: "supported", arguments: [], evidence: [TEMPLATE("templates/control-templates/select.json#connectArray")] },
      { semanticEvent: "focus", kfEvent: "Focus", availability: "supported", arguments: [], evidence: [TEMPLATE("templates/control-templates/select.json#connectArray")] },
    ],
    methods: [],
    initialization: { supportsConfigureData: false, lifecycleEvents: [] },
    limitations: ["选择事件可识别，但尚未提供事件脚本编译器。"],
  },
  tabs: {
    schema: "kf-script-capability-profile/v1",
    capabilityId: "tabs",
    version: "1.0.0",
    availability: "supported",
    actions: [],
    events: [
      { semanticEvent: "tab-click", kfEvent: "Tab-click", availability: "supported", arguments: [], evidence: [TEMPLATE("templates/control-templates/tabs.json#connectArray")] },
      { semanticEvent: "tab-remove", kfEvent: "Tab-remove", availability: "supported", arguments: [], evidence: [TEMPLATE("templates/control-templates/tabs.json#connectArray")] },
      { semanticEvent: "tab-add", kfEvent: "Tab-add", availability: "supported", arguments: [], evidence: [TEMPLATE("templates/control-templates/tabs.json#connectArray")] },
      { semanticEvent: "edit", kfEvent: "Edit", availability: "supported", arguments: [], evidence: [TEMPLATE("templates/control-templates/tabs.json#connectArray")] },
    ],
    methods: [],
    initialization: { supportsConfigureData: false, lifecycleEvents: [] },
    limitations: ["标签事件可识别，但尚未提供事件脚本编译器。"],
  },
  "easyui.1": {
    schema: "kf-script-capability-profile/v1",
    capabilityId: "easyui.1",
    version: "1.0.0",
    availability: "planned",
    actions: [],
    events: [],
    methods: [
      { semanticMethod: "set-data", kfMethod: "SetData", availability: "planned", parameters: ["records"], returns: "void", evidence: [] },
      { semanticMethod: "get-data", kfMethod: "GetData", availability: "planned", parameters: [], returns: "record-list", evidence: [] },
      { semanticMethod: "get-selected", kfMethod: "GetSelected", availability: "planned", parameters: [], returns: "record", evidence: [] },
    ],
    initialization: { supportsConfigureData: true, lifecycleEvents: [] },
    limitations: ["数据表方法尚未由经过审核的 KF 实例接口和编译路径支持。"],
  },
};

const PROFILES = listControlDesignProfiles().map((controlProfile) =>
  ScriptCapabilityProfileSchema.parse(
    REVIEWED_PROFILES[controlProfile.capabilityId] ?? plannedProfile(controlProfile.capabilityId),
  ),
);
const controlProfileIds = new Set(listControlDesignProfiles().map((profile) => profile.capabilityId));

for (const profile of PROFILES) {
  if (!controlProfileIds.has(profile.capabilityId)) {
    throw new Error(`SCRIPT_CAPABILITY_PROFILE_CONTROL_NOT_FOUND: ${profile.capabilityId}`);
  }
}

const registry = createKnowledgeRegistry(
  PROFILES,
  (profile) => profile.capabilityId,
  "SCRIPT_CAPABILITY_PROFILE_NOT_FOUND",
);

export const listScriptCapabilityProfiles: () => readonly ScriptCapabilityProfile[] = registry.list;
export const getScriptCapabilityProfile: (capabilityId: string) => ScriptCapabilityProfile | undefined = registry.get;
export const requireScriptCapabilityProfile: (capabilityId: string) => ScriptCapabilityProfile = registry.require;
