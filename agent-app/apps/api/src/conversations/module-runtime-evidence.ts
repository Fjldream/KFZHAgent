import type { ModuleRuntimeEvidence } from "@kf/domain-client";

/**
 * 2026年8月12日，捕获了精确的KF 3.6运行时证据。
 *
 * 每个条目在原生导入、发布、操作中心部署、进程启动、TCP服务和运行时Page1 JSON读回过程中均存活。这些定义不在这里列出，但它们共享KF能力时仍为beta版本。
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
