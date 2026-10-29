export * from "./package/native-client-package.js";
export * from "./package/safe-unzip.js";
export * from "./ir/client-project-ir.js";
export * from "./inspect/client-inspector.js";
export { mergeControlTemplate, type TemplateJson } from "./templates/merge-template.js";
export * from "./compile/client-compiler.js";
export {
  supportedEasyuiProtos,
  supportedPrototypeNames,
} from "./compile/control-compiler.js";
export * from "./style/control-capability-registry.js";
export {
  KF36_RUNTIME_PROFILE,
  type KFRuntimeProfile,
  type SelectorRoles,
} from "./style/runtime-profile.js";
export * from "./style/style-adapter.js";
export * from "./style/style-engine.js";
export * from "./implementation/ui-implementation-compiler.js";
export * from "./implementation/runtime-correlation.js";
// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
export { MAX_NATIVE_DEVELOPMENT_NAME_LENGTH } from "./compile/native-page-name.js";
// end
// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
export * from "./implementation/generated-state-reuse.js";
// end
export * from "./implementation/ui-implementation-v2-compiler.js";
export {
  renderClientPreview,
  escapeHtml,
  PREVIEW_CSP,
} from "./preview/client-preview.js";
export * from "./patch/client-patcher.js";
export * from "./patch/change-scope.js";
export * from "./patch/allowlist.js";
export * from "./patch/json-pointer.js";
export * from "./validate/client-validator.js";
export * from "./validate/report.js";
export * from "./domain-pack/king-client-domain-pack.js";
export * from "./assets/materialize-client-assets.js";
export * from "./modules/module-registry.js";
export * from "./modules/module-compiler.js";
export type { ModuleRuntimeEvidence } from "./modules/types.js";
export * from "./modules/module-quality.js";
export * from "./modules/module-diff.js";
export * from "./modules/stable-ids.js";
export * from "./modules/theme/module-theme.js";
export * from "./modules/layout/layout-engine.js";
export * from "./modules/layout/layout-errors.js";
export * from "./modules/definitions/portal-modules.js";
export * from "./design-knowledge/control-design-registry.js";
export * from "./design-knowledge/style-capability-registry.js";
export * from "./design-knowledge/script-capability-registry.js";
export * from "./design-knowledge/composition-recipe-registry.js";
export {
  assertDesignKnowledgeIntegrity,
  getDesignKnowledgeSnapshot,
  type DesignKnowledgeSnapshot,
} from "./design-knowledge/design-knowledge-catalog.js";
export * from "./planning/blueprint-region-query.js";
export * from "./planning/legacy-module-plan-adapter.js";
export {
  assertSolutionPlanUsesCandidates,
  retrieveCapabilities,
  // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
  layoutCapabilityIdsFor,
  // end
  type CapabilityRetrievalInput,
} from "./planning/capability-retrieval.js";
export * from "./solution-compile/solution-compiler.js";
export * from "./interaction/interaction-compiler.js";
// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
export { getVisualCapabilitySurface } from "./design-knowledge/design-knowledge-catalog.js";
export { retrieveVisualCapabilities } from "./planning/capability-retrieval.js";
export * from "./visual/capability-evidence.js";
export * from "./visual/region-mapping.js";
// modified by jinlong.feng at 2026-10-26 Agent工作台迭代
export * from "./visual/visual-layout-proposal.js";
// end
// end
// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
export * from "./visual/visual-plan-constraints.js";
// end
