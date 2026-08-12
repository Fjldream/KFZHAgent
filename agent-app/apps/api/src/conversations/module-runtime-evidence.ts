import type { ModuleRuntimeEvidence } from "@kf/domain-client";

/**
 * Exact native KF 3.6 runtime evidence captured on 2026-08-12.
 *
 * Each entry survived native import, publish, operations-center deployment,
 * process start, TCP serving, and runtime Page1 JSON readback. Definitions not
 * listed here remain beta even when they share individual KF capabilities.
 */
export const REVIEWED_KF36_MODULE_RUNTIME_EVIDENCE: readonly ModuleRuntimeEvidence[] = Object.freeze([
  Object.freeze({
    kind: "content.hero",
    version: "1.0.0",
    runtimeFamily: "KingFusion",
    runtimeVersion: "3.6",
    baselineId: "kf36-portal-v1",
    verifiedCapabilities: Object.freeze(["layout.2", "text", "image", "button"]),
  }),
  Object.freeze({
    kind: "data.status-grid",
    version: "1.0.0",
    runtimeFamily: "KingFusion",
    runtimeVersion: "3.6",
    baselineId: "kf36-dashboard-admin-v1",
    verifiedCapabilities: Object.freeze(["layout.2", "text", "tag"]),
  }),
  Object.freeze({
    kind: "data.table",
    version: "1.0.0",
    runtimeFamily: "KingFusion",
    runtimeVersion: "3.6",
    baselineId: "kf36-dashboard-admin-v1",
    verifiedCapabilities: Object.freeze(["layout.2", "text", "easyui.1"]),
  }),
  Object.freeze({
    kind: "feedback.alert-list",
    version: "1.0.0",
    runtimeFamily: "KingFusion",
    runtimeVersion: "3.6",
    baselineId: "kf36-dashboard-admin-v1",
    verifiedCapabilities: Object.freeze(["layout.2", "text", "tag"]),
  }),
  Object.freeze({
    kind: "navigation.top",
    version: "1.0.0",
    runtimeFamily: "KingFusion",
    runtimeVersion: "3.6",
    baselineId: "kf36-portal-v1",
    verifiedCapabilities: Object.freeze(["layout.2", "text", "button"]),
  }),
]);
