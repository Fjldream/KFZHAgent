import {
  ScriptCapabilityProfileSchema,
  type ScriptCapabilityProfile,
} from "@kf/contracts";
import { listControlDesignProfiles } from "./control-design-registry.js";
import { createKnowledgeRegistry } from "./registry.js";

const TEMPLATE = (ref: string) => ({ kind: "template", ref });
const PRODUCT_SOURCE = (ref: string, contentSha256: string) => ({ kind: "product-source", ref, contentSha256 });
const CENTER_PROPERTY_PAGE = "KingFusion3.6_Center/sdb/c7f1771f-0c8f-4c75-9d71-3b8c4b6bd190/kingclient/9fdd3be0-2d91-11f1-b60a-4937cd79e5a1/pagerecord/recordpages/数据模型管理_属性定义20230511104433.json";
const NODE_TEAM_PAGE = "KingFusion3.6_Node/sdb/kingclient/bbb85040-d19b-11f0-b646-250384722929/e91a8070-d94e-11f0-bc3d-dbe5f779bd94/pagerecord/recordpages/修改班组20230718142335.json";
const ACTION_IR_EVIDENCE = [
  { kind: "compiler", ref: "agent-app/packages/domain-client/src/ir/client-project-ir.schema.ts#RestrictedAction" },
  { kind: "compiler", ref: "agent-app/packages/domain-client/src/compile/control-compiler.ts#compileAction" },
] as const;

function actionEvidence(testFragment: "navigatePage" | "setVariable") {
  return [
    ...ACTION_IR_EVIDENCE,
    { kind: "compiler", ref: `agent-app/packages/domain-client/src/compile/client-compiler.test.ts#${testFragment}` },
  ];
}

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
      { semanticAction: "navigate-page", implementation: "restricted-action", availability: "supported", evidence: actionEvidence("navigatePage") },
      { semanticAction: "set-variable", implementation: "restricted-action", availability: "supported", evidence: actionEvidence("setVariable") },
      { semanticAction: "open-dialog", implementation: "restricted-action", availability: "planned", evidence: [] },
    ],
    events: [{
      semanticEvent: "click",
      kfEvent: "onClick",
      linkId: 200001,
      availability: "supported",
      arguments: [],
      evidence: [PRODUCT_SOURCE(
        `${CENTER_PROPERTY_PAGE}#objects.0.insiderObjects.0.insiderObjects.0.insiderObjects.4.linkMng.linkList.0.script`,
        "5e1d9bef9570288238adbb8dfa6bfc2be3ec04c7105b11b4caedbd6fe35e2088",
      )],
    }],
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
      { semanticEvent: "change", kfEvent: "Change", availability: "supported", arguments: [], evidence: [TEMPLATE("agent-app/packages/domain-client/src/templates/control-templates/checkbox.json#connectArray")] },
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
      { semanticEvent: "load", kfEvent: "Load", linkId: 200001, availability: "supported", arguments: [], evidence: [TEMPLATE("agent-app/packages/domain-client/src/templates/control-templates/image.json#linkMng")] },
      { semanticEvent: "error", kfEvent: "Error", linkId: 200002, availability: "supported", arguments: [], evidence: [TEMPLATE("agent-app/packages/domain-client/src/templates/control-templates/image.json#linkMng")] },
    ],
    methods: [],
    initialization: { supportsConfigureData: false, lifecycleEvents: ["load", "error"] },
    limitations: ["图片加载事件的脚本内容仍需要经过后续脚本编译与安全审核。"],
  },
  input: {
    schema: "kf-script-capability-profile/v1",
    capabilityId: "input",
    version: "1.0.0",
    availability: "supported",
    actions: [],
    events: [],
    methods: [],
    properties: [{
      semanticProperty: "value",
      kfProperty: "Value",
      readable: true,
      writable: false,
      availability: "supported",
      evidence: [PRODUCT_SOURCE(
        `${CENTER_PROPERTY_PAGE}#linkMng.linkList.3.script`,
        "0aa6e00db6a2602b929db684aaf1095911ef7dea013620f2a4be21e5c067cb34",
      )],
    }],
    initialization: { supportsConfigureData: false, lifecycleEvents: [] },
    limitations: ["仅有 Value 读取经过产品脚本证明；写入仍保持 planned。"],
  },
  select: {
    schema: "kf-script-capability-profile/v1",
    capabilityId: "select",
    version: "1.0.0",
    availability: "supported",
    actions: [],
    events: [
      { semanticEvent: "change", kfEvent: "Change", availability: "supported", arguments: [], evidence: [TEMPLATE("agent-app/packages/domain-client/src/templates/control-templates/select.json#connectArray")] },
      { semanticEvent: "visible-change", kfEvent: "visible-Change", availability: "supported", arguments: [], evidence: [TEMPLATE("agent-app/packages/domain-client/src/templates/control-templates/select.json#connectArray")] },
      { semanticEvent: "remove-tag", kfEvent: "Remove-Tag", availability: "supported", arguments: [], evidence: [TEMPLATE("agent-app/packages/domain-client/src/templates/control-templates/select.json#connectArray")] },
      { semanticEvent: "clear", kfEvent: "Clear", availability: "supported", arguments: [], evidence: [TEMPLATE("agent-app/packages/domain-client/src/templates/control-templates/select.json#connectArray")] },
      { semanticEvent: "blur", kfEvent: "Blur", availability: "supported", arguments: [], evidence: [TEMPLATE("agent-app/packages/domain-client/src/templates/control-templates/select.json#connectArray")] },
      { semanticEvent: "focus", kfEvent: "Focus", availability: "supported", arguments: [], evidence: [TEMPLATE("agent-app/packages/domain-client/src/templates/control-templates/select.json#connectArray")] },
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
      { semanticEvent: "tab-click", kfEvent: "Tab-click", availability: "supported", arguments: [], evidence: [TEMPLATE("agent-app/packages/domain-client/src/templates/control-templates/tabs.json#connectArray")] },
      { semanticEvent: "tab-remove", kfEvent: "Tab-remove", availability: "supported", arguments: [], evidence: [TEMPLATE("agent-app/packages/domain-client/src/templates/control-templates/tabs.json#connectArray")] },
      { semanticEvent: "tab-add", kfEvent: "Tab-add", availability: "supported", arguments: [], evidence: [TEMPLATE("agent-app/packages/domain-client/src/templates/control-templates/tabs.json#connectArray")] },
      { semanticEvent: "edit", kfEvent: "Edit", availability: "supported", arguments: [], evidence: [TEMPLATE("agent-app/packages/domain-client/src/templates/control-templates/tabs.json#connectArray")] },
    ],
    methods: [],
    initialization: { supportsConfigureData: false, lifecycleEvents: [] },
    limitations: ["标签事件可识别，但尚未提供事件脚本编译器。"],
  },
  "easyui.1": {
    schema: "kf-script-capability-profile/v1",
    capabilityId: "easyui.1",
    version: "1.0.0",
    availability: "supported",
    actions: [],
    events: [{
      semanticEvent: "row-click",
      kfEvent: "Cell-click",
      linkId: 200006,
      availability: "supported",
      arguments: [
        { name: "record", position: 1, valueKind: "record" },
        { name: "column", position: 2, valueKind: "scalar" },
      ],
      evidence: [PRODUCT_SOURCE(
        `${NODE_TEAM_PAGE}#objects.0.insiderObjects.0.insiderObjects.4.insiderObjects.0.linkMng.linkList.5.script`,
        "072184556a411e261ab94ac4ed680937cdf7ceb8e2205b3f21ad7d340d4c3ce3",
      )],
    }],
    methods: [
      {
        semanticMethod: "set-data", kfMethod: "SetData", availability: "supported", parameters: ["records"], returns: "void",
        evidence: [PRODUCT_SOURCE(
          `${CENTER_PROPERTY_PAGE}#linkMng.linkList.3.script`,
          "0aa6e00db6a2602b929db684aaf1095911ef7dea013620f2a4be21e5c067cb34",
        )],
      },
      { semanticMethod: "get-data", kfMethod: "GetData", availability: "planned", parameters: [], returns: "record-list", evidence: [] },
      { semanticMethod: "get-selected", kfMethod: "GetSelected", availability: "planned", parameters: [], returns: "record", evidence: [] },
    ],
    initialization: { supportsConfigureData: true, lifecycleEvents: [] },
    limitations: ["仅 SetData 与 Cell-click 的 record 参数经过审核；GetData、GetSelected 和选择事件参数仍为 planned。"],
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

export const listScriptCapabilityProfiles: () => readonly ScriptCapabilityProfile[] = () => registry.list();
export const getScriptCapabilityProfile: (capabilityId: string) => ScriptCapabilityProfile | undefined = (capabilityId) => registry.get(capabilityId);
export const requireScriptCapabilityProfile: (capabilityId: string) => ScriptCapabilityProfile = (capabilityId) => registry.require(capabilityId);
