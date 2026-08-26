import {
  ScriptCapabilityProfileSchema,
  type ScriptCapabilityProfile,
} from "@kf/contracts";
import { listControlDesignProfiles } from "./control-design-registry.js";
import { createKnowledgeRegistry } from "./registry.js";

const TEMPLATE = (ref: string) => ({ kind: "template", ref });
const PRODUCT_SOURCE = (ref: string, contentSha256: string) => ({ kind: "product-source", ref, contentSha256 });
const CENTER_PROPERTY_PAGE = "KingFusion3.6_Center/sdb/c7f1771f-0c8f-4c75-9d71-3b8c4b6bd190/kingclient/9fdd3be0-2d91-11f1-b60a-4937cd79e5a1/pagerecord/recordpages/数据模型管理_属性定义20230511104433.json";
const NODE_DATAGRID_METHOD_PAGE = "KingFusion3.6_Node/sdb/kingclient/5dd3e6c0-d181-11f0-b646-250384722929/d6271f40-e165-11f0-bc3d-dbe5f779bd94/pagerecord/recordpages/数据网格_方法20250218173552.json";
const NODE_DATAGRID_EVENT_PAGE = "KingFusion3.6_Node/sdb/kingclient/5dd3e6c0-d181-11f0-b646-250384722929/d6271f40-e165-11f0-bc3d-dbe5f779bd94/project/page/数据网格_事件.json";
const CENTER_OVERLAY_VISIBILITY_PAGE = "KingFusion3.6_Center/sdb/c7f1771f-0c8f-4c75-9d71-3b8c4b6bd190/kingclient/9fdd3be0-2d91-11f1-b60a-4937cd79e5a1/project/page/设备接入_新增.json";
const OVERLAY_VISIBILITY_EVIDENCE = [PRODUCT_SOURCE(
  `${CENTER_OVERLAY_VISIBILITY_PAGE}#objects.0.insiderObjects.0.insiderObjects.2.insiderObjects.4.linkMng.linkList.0.script`,
  "67c369d5f86cde2ac540afa78931964f826d2992752e8e09edaa7996d1b500b7",
)];
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
      { semanticAction: "open-dialog", implementation: "restricted-action", availability: "supported", evidence: OVERLAY_VISIBILITY_EVIDENCE },
      { semanticAction: "close-dialog", implementation: "restricted-action", availability: "supported", evidence: OVERLAY_VISIBILITY_EVIDENCE },
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
    limitations: ["弹层动作仅可切换编译器已验证 overlay host 的 Visible 布尔属性；不接受模型脚本或任意目标。"],
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
  ...Object.fromEntries(["layout.2", "layout.4", "layout.5"].map((capabilityId) => [capabilityId, {
    schema: "kf-script-capability-profile/v1",
    capabilityId,
    version: "1.0.0",
    availability: "supported",
    actions: [
      { semanticAction: "open-dialog", implementation: "restricted-action", availability: "supported", evidence: OVERLAY_VISIBILITY_EVIDENCE },
      { semanticAction: "close-dialog", implementation: "restricted-action", availability: "supported", evidence: OVERLAY_VISIBILITY_EVIDENCE },
    ],
    events: [],
    methods: [],
    properties: [{
      semanticProperty: "visible", kfProperty: "Visible", readable: true, writable: true,
      availability: "supported", evidence: OVERLAY_VISIBILITY_EVIDENCE,
    }],
    initialization: { supportsConfigureData: false, lifecycleEvents: [] },
    limitations: ["Visible 写入只允许由签名 overlay action 生成，不能作为通用脚本属性写入。"],
  }])),
  "easyui.1": {
    schema: "kf-script-capability-profile/v1",
    capabilityId: "easyui.1",
    version: "1.0.0",
    availability: "supported",
    actions: [],
    events: [{
      semanticEvent: "row-click",
      kfEvent: "onClickRow",
      linkId: 200024,
      availability: "supported",
      arguments: [
        { name: "record", position: 3, valueKind: "record" },
      ],
      evidence: [PRODUCT_SOURCE(
        `${NODE_DATAGRID_EVENT_PAGE}#objects.0.linkMng.linkList.23.script`,
        "e8bea75b41aef0d8198a62257dfc515b18ba39774b3980868bee1ececf6671f6",
      )],
    }],
    methods: [
      {
        semanticMethod: "set-data", kfMethod: "SetData", availability: "supported", parameters: ["records"], returns: "void",
        evidence: [PRODUCT_SOURCE(
          `${NODE_DATAGRID_METHOD_PAGE}#objects.2.linkMng.linkList.0.script`,
          "d3d08eba3792ec70be2c6f4819faba18c75c416f9625196276b32fcf423ec1cc",
        )],
      },
      { semanticMethod: "get-data", kfMethod: "GetData", availability: "planned", parameters: [], returns: "record-list", evidence: [] },
      { semanticMethod: "get-selected", kfMethod: "GetSelected", availability: "planned", parameters: [], returns: "record", evidence: [] },
    ],
    initialization: { supportsConfigureData: true, lifecycleEvents: [] },
    limitations: ["仅 Datagrid SetData 与 onClickRow 的 arguments[3] record 参数经过审核；onClickCell、GetData、GetSelected 和选择事件参数仍为 planned。"],
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
