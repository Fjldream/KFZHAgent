import type { ActionEffect } from "@kf/contracts";
import type { ScriptCapabilityEvidence } from "./script-capability-registry.js";
import { createKnowledgeRegistry } from "./registry.js";

export interface NativeActionCapability {
  readonly semanticAction: "navigate-page" | "open-overlay" | "close-overlay" | "set-state" | "show-feedback";
  readonly availability: "supported" | "planned";
  readonly serialization: "navigate-command" | "overlay-visibility" | "variable-command" | "feedback-script";
  readonly evidence: readonly ScriptCapabilityEvidence[];
}

const NAVIGATION_EVIDENCE = Object.freeze([
  { kind: "compiler", ref: "agent-app/packages/domain-client/src/ir/client-project-ir.schema.ts#RestrictedAction" },
  { kind: "compiler", ref: "agent-app/packages/domain-client/src/compile/control-compiler.ts#compileAction" },
  { kind: "compiler", ref: "agent-app/packages/domain-client/src/compile/client-compiler.test.ts#navigatePage" },
] satisfies readonly ScriptCapabilityEvidence[]);
const OVERLAY_VISIBILITY_EVIDENCE = Object.freeze([
  {
    kind: "product-source",
    ref: "KingFusion3.6_Node/kingexedb/kingclient/exe/public/javascripts/Common/Graphic/Layout/kmui_layoutcomponentbase.js",
    contentSha256: "04831c1bd9feb0d19eaac07e0aee5af7df07bd4fba8072b6630dd1c4689b0aff",
  },
] satisfies readonly ScriptCapabilityEvidence[]);

const CAPABILITIES = [
  {
    semanticAction: "navigate-page",
    availability: "supported",
    serialization: "navigate-command",
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
    availability: "planned",
    serialization: "variable-command",
    evidence: [],
  },
  {
    semanticAction: "show-feedback",
    availability: "planned",
    serialization: "feedback-script",
    evidence: [],
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
