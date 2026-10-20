import type { ActionEffect } from "@kf/contracts";
import type { ScriptCapabilityEvidence } from "./script-capability-registry.js";
import { createKnowledgeRegistry } from "./registry.js";

export interface NativeActionCapability {
  readonly semanticAction: "navigate-page" | "open-overlay" | "close-overlay" | "set-state" | "show-feedback";
  readonly availability: "supported" | "planned";
  readonly serialization: "navigation-script" | "overlay-visibility" | "variable-command" | "feedback-script";
  readonly evidence: readonly ScriptCapabilityEvidence[];
}

const NAVIGATION_EVIDENCE = Object.freeze([
  {
    kind: "product-source",
    ref: "KingFusion3.6_Node/sdb/kingclient/4d40fe10-ea9f-11f0-873c-fbefc9d34a70/f06c3b90-ea9f-11f0-871c-1f9d1cf633fa/pagerecord/recordpages/APP_油井加药执行20260108135939.json#ShowPage",
    contentSha256: "9190597094b2f424f80ec34139471581f62a43dd31d02014e09efcfb896c48ee",
  },
] satisfies readonly ScriptCapabilityEvidence[]);
const OVERLAY_VISIBILITY_EVIDENCE = Object.freeze([
  {
    kind: "product-source",
    ref: "KingFusion3.6_Node/kingexedb/kingclient/exe/public/javascripts/Common/Graphic/Layout/kmui_layoutcomponentbase.js",
    contentSha256: "04831c1bd9feb0d19eaac07e0aee5af7df07bd4fba8072b6630dd1c4689b0aff",
  },
] satisfies readonly ScriptCapabilityEvidence[]);
const STATE_AND_FEEDBACK_EVIDENCE = Object.freeze([
  {
    kind: "product-source",
    ref: "KingFusion3.6_Center/sdb/c7f1771f-0c8f-4c75-9d71-3b8c4b6bd190/kingclient/9fdd3be0-2d91-11f1-b60a-4937cd79e5a1/pagerecord/recordpages/数据共享_共享设备配置20230601175014.json#linkMng.linkList.4.script",
    contentSha256: "61ab4359b8a7a596282bfd48d7998765d6b9a5607fc58da68225600bd826d673",
  },
] satisfies readonly ScriptCapabilityEvidence[]);
const STATE_ASSIGNMENT_EVIDENCE = Object.freeze([
  {
    kind: "product-source",
    ref: "KingFusion3.6_Center/sdb/c7f1771f-0c8f-4c75-9d71-3b8c4b6bd190/kingclient/9fdd3be0-2d91-11f1-b60a-4937cd79e5a1/pagerecord/recordpages/数据共享_共享设备配置20230601175014.json#linkMng.linkList.0.script",
    contentSha256: "4ad34aa4f6d002665a0e492ee5ec59317b5ed1273c61341ab335724851e3556e",
  },
] satisfies readonly ScriptCapabilityEvidence[]);

const CAPABILITIES = [
  {
    semanticAction: "navigate-page",
    availability: "supported",
    serialization: "navigation-script",
    evidence: NAVIGATION_EVIDENCE,
  },
  {
    semanticAction: "open-overlay",
    availability: "supported",
    serialization: "overlay-visibility",
    evidence: OVERLAY_VISIBILITY_EVIDENCE,
  },
  {
    semanticAction: "close-overlay",
    availability: "supported",
    serialization: "overlay-visibility",
    evidence: OVERLAY_VISIBILITY_EVIDENCE,
  },
  {
    semanticAction: "set-state",
    availability: "supported",
    serialization: "variable-command",
    evidence: [...STATE_AND_FEEDBACK_EVIDENCE, ...STATE_ASSIGNMENT_EVIDENCE],
  },
  {
    semanticAction: "show-feedback",
    availability: "supported",
    serialization: "feedback-script",
    evidence: STATE_AND_FEEDBACK_EVIDENCE,
  },
] as const satisfies readonly NativeActionCapability[];

const registry = createKnowledgeRegistry(
  CAPABILITIES,
  (capability) => capability.semanticAction,
  "NATIVE_ACTION_CAPABILITY_NOT_SUPPORTED",
);

export const listNativeActionCapabilities: () => readonly NativeActionCapability[] = () => registry.list();
export const getNativeActionCapability: (kind: ActionEffect["kind"]) => NativeActionCapability | undefined = (kind) => registry.get(kind);
export const requireNativeActionCapability: (kind: ActionEffect["kind"]) => NativeActionCapability = (kind) => registry.require(kind);
