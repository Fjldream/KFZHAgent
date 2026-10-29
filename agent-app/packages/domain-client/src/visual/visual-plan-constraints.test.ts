// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
import { beforeAll, describe, expect, it } from "vitest";
import { canonicalServerHash, type VisualReferenceSpec } from "@kf/contracts";
import { generationFixture } from "../../../../tests/helpers/generation-fixture.js";
import { deriveGuid } from "../compile/guid-factory.js";
import { buildGenerationSnapshotContent, buildVisualSourceMap, validateVisualPlanReferences } from "./visual-plan-constraints.js";
import { resolveVisualSemanticBindings, validateVisualPlanningContext, validateAcceptedVisualPlanningInput } from "./visual-plan-constraints.js";
// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
import { validateVisualSemanticBindings } from "./visual-plan-constraints.js";
import { VisualReferenceSpecSchema, type ControlNode, type SolutionNode, type VisualPlanningContext } from "@kf/contracts";
// end
import { compileSolutionImplementationWithProvenance } from "../solution-compile/solution-compiler.js";
import { createDefaultModuleRegistry } from "../modules/module-registry.js";
// modified by jinlong.feng at 2026-10-26 Agent工作台迭代
import { validateVisualBlueprintNativeSources, type LayoutNode } from "@kf/contracts";
import { validateVisualLayoutGrouping } from "./visual-plan-constraints.js";
// end

const spec: VisualReferenceSpec = { schemaVersion: 1, sourceAssetId: "reference1", sourceHash: "a".repeat(64), viewport: { width: 1440, height: 900 },
  regions: [{ id: "heading", parentId: null, role: "text", box: { x: 0, y: 0, width: 1, height: 1 }, text: ["成员"], confidence: 0.9, interactionHint: null }],
  designTokens: { background: "#fff", foreground: "#111", accent: "#123456", spacing: [8], radius: [4] }, uncertainties: [] };
const mapping = { regionId: "heading", controlType: "text", capabilityId: "text", support: "supported_unverified" as const,
  reason: "尚未原生验证", evidenceIds: [], fallback: null };
const entry = { regionId: "heading", componentId: "title", nativeIds: ["native1"] };

// modified by jinlong.feng at 2026-10-26 Agent工作台迭代
describe("visual grouping preflight before semantic cache publication", () => {
  const control = (id: string, groupWith: string[] = []): ControlNode => ({ id, kind: "control", capabilityId: "text", content: id,
    sourceBlueprintRegionIds: ["region"], properties: [], tabIds: [], styleRole: "body", eventBindings: [],
    intent: { importance: "secondary", visualWeight: 1, readingOrder: 0, density: "comfortable", groupWith,
      width: { mode: "fill" }, height: { mode: "content" }, align: "start" } });
  const root = (children: SolutionNode[]): LayoutNode => ({ ...control("root"), kind: "layout", layout: "row", children });
  it("accepts one-way sibling grouping without rewriting model intent", () => {
    const tree = root([control("a", ["b"]), control("b", ["c"]), control("c"), control("d")]);
    const hash = canonicalServerHash(tree);
    expect(() => validateVisualLayoutGrouping(tree)).not.toThrow();
    expect(canonicalServerHash(tree)).toBe(hash);
  });
  it.each(["self", "duplicate", "unknown", "cross-parent", "two-cycle", "three-cycle", "root"] as const)("rejects %s grouping before compilation", failure => {
    const tree = root([control("a"), control("b"), control("c")]);
    if (failure === "self") tree.children[0]!.intent.groupWith = ["a"];
    if (failure === "duplicate") tree.children[0]!.intent.groupWith = ["b", "b"];
    if (failure === "unknown") tree.children[0]!.intent.groupWith = ["missing"];
    if (failure === "cross-parent") {
      tree.children.push({ ...root([control("nested")]), id: "nested-parent" });
      tree.children[0]!.intent.groupWith = ["nested"];
    }
    if (failure === "two-cycle" || failure === "three-cycle") {
      tree.children[0]!.intent.groupWith = ["b"];
      tree.children[1]!.intent.groupWith = failure === "two-cycle" ? ["a"] : ["c"];
      if (failure === "three-cycle") tree.children[2]!.intent.groupWith = ["a"];
    }
    if (failure === "root") tree.intent.groupWith = ["a"];
    expect(() => validateVisualLayoutGrouping(tree)).toThrow("VISUAL_LAYOUT_GROUP_INVALID");
  });
  it.each(["repeater", "module-slot"] as const)("checks grouping inside %s scope", container => {
    const children = [control("a", ["b"]), control("b", ["a"])];
    const tree: SolutionNode = container === "repeater"
      ? { ...control("repeated"), kind: "repeater", mockDataId: "rows", itemAlias: "row", keyField: "id", maxItems: 2, template: root(children) }
      : { ...control("module"), kind: "registered-module", moduleKind: "example", templateVersion: "1", variant: "default", title: "示例", slots: [{ slotId: "body", children }] };
    expect(() => validateVisualLayoutGrouping(tree)).toThrow("VISUAL_LAYOUT_GROUP_INVALID: a (cycle)");
  });
});
// end

describe("accepted visual graph input integrity (not user authority)", () => {
  const reference = () => ({ schemaVersion: 1, analysisId: "analysis1", specHash: canonicalServerHash(spec), spec, mappings: [mapping],
    acceptedDifferences: [{ regionId: "heading", disposition: "accept-unverified", capabilityId: "text", reason: "接受未验证风险" }] });
  const envelope = (value = reference()) => ({ schema: "kf-accepted-visual-planning/v1", reviewHash: "b".repeat(64), reference: value,
    confirmationHash: canonicalServerHash({ reviewHash: "b".repeat(64), reference: value }) });
  it("accepts exactly a normalized context and rejects altered review/confirmation fields", () => {
    const accepted = envelope();
    expect(validateAcceptedVisualPlanningInput(accepted)).toEqual(accepted);
    expect(() => validateAcceptedVisualPlanningInput({ ...accepted, reviewHash: "c".repeat(64) })).toThrow("VISUAL_CONFIRMATION_HASH_MISMATCH");
    expect(() => validateAcceptedVisualPlanningInput({ ...accepted, confirmationHash: "c".repeat(64) })).toThrow("VISUAL_CONFIRMATION_HASH_MISMATCH");
    expect(() => validateAcceptedVisualPlanningInput({ ...accepted, authorized: true })).toThrow();
  });
  it("does not let a recalculated outer hash bypass missing acknowledgements or a stale analysis hash", () => {
    expect(() => validateAcceptedVisualPlanningInput(envelope({ ...reference(), acceptedDifferences: [] }))).toThrow("VISUAL_ACKNOWLEDGEMENT_REQUIRED");
    expect(() => validateAcceptedVisualPlanningInput(envelope({ ...reference(), specHash: "c".repeat(64) }))).toThrow("VISUAL_SPEC_HASH_MISMATCH");
  });
});

describe("visual plan references", () => {
  it("rejects unknown regions before any compile or persistence", () => {
    expect(() => validateVisualPlanReferences({ regionIds: ["heading"], mappings: [], sourceMap: [{ ...entry, regionId: "unknown" }] })).toThrow("UNKNOWN_VISUAL_REGION");
  });
  it("rejects regions without explicit capability mappings", () => {
    expect(() => validateVisualPlanReferences({ regionIds: ["heading"], mappings: [], sourceMap: [entry] })).toThrow("VISUAL_REGION_UNMAPPED");
  });
  it("rejects duplicate native ownership across different regions or components", () => {
    expect(() => validateVisualPlanReferences({ regionIds: ["heading", "other"], mappings: [mapping, { ...mapping, regionId: "other" }],
      sourceMap: [entry, { ...entry, componentId: "other-title", regionId: "other" }] })).toThrow("VISUAL_NATIVE_OWNERSHIP_CONFLICT");
  });
  it("rejects duplicate component ownership, region IDs and mappings", () => {
    expect(() => validateVisualPlanReferences({ regionIds: ["heading", "other"], mappings: [mapping, { ...mapping, regionId: "other" }],
      sourceMap: [entry, { ...entry, regionId: "other", nativeIds: ["native2"] }] })).toThrow("VISUAL_COMPONENT_OWNERSHIP_CONFLICT");
    expect(() => validateVisualPlanReferences({ regionIds: ["heading", "heading"], mappings: [mapping], sourceMap: [entry] })).toThrow("VISUAL_REGION_DUPLICATE");
    expect(() => validateVisualPlanReferences({ regionIds: ["heading"], mappings: [mapping, mapping], sourceMap: [entry] })).toThrow("VISUAL_MAPPING_DUPLICATE");
  });
});

describe("generation provenance through the existing compiler", () => {
  let fixture: Awaited<ReturnType<typeof generationFixture>>;
  let componentId: string;
  beforeAll(async () => {
    fixture = await generationFixture();
    componentId = fixture.materialization.controls.find(control => control.capabilityId === "text")!.semanticControlId;
  });
  const visual = () => ({ schemaVersion: 1 as const, analysisId: "analysis1", specHash: canonicalServerHash(spec), spec,
    mappings: [mapping], bindings: [{ regionId: "heading", componentId }],
    acceptedDifferences: [{ regionId: "heading", disposition: "accept-unverified" as const, capabilityId: "text", reason: "确认保留未验证的文字控件" }] });

  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  function workspaceDataInput() {
    const plan = structuredClone(fixture.artifact.semanticPlan);
    const nodes: SolutionNode[] = [];
    const visit = (node: SolutionNode): void => {
      nodes.push(node);
      if (node.kind === "layout") node.children.forEach(visit);
      else if (node.kind === "repeater") visit(node.template);
      else if (node.kind === "registered-module") node.slots.forEach(slot => slot.children.forEach(visit));
    };
    plan.pages.forEach(page => visit(page.root));
    const node = nodes.find(item => item.id === "admin-brand-title") as ControlNode;
    node.content = "当前租户的工作区";
    const referenceSpec = VisualReferenceSpecSchema.parse({ ...spec, regions: [{ ...spec.regions[0], dataRequirement: { kind: "workspace-field", field: "name" } }] });
    const { bindings: previousBindings, ...reference } = visual();
    void previousBindings;
    const context = { ...reference, spec: referenceSpec, specHash: canonicalServerHash(referenceSpec),
      dataSnapshots: [{ regionId: "heading", kind: "workspace-field", field: "name", value: "当前租户的工作区" }] } as VisualPlanningContext;
    return { plan, node, context, bindings: [{ regionId: "heading", nodeId: node.id }] };
  }
  // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
  function sourceOwnershipInput() {
    const input = workspaceDataInput();
    const blueprint = structuredClone(fixture.artifact.blueprint);
    const page = blueprint.pages.find((candidate) => candidate.id === input.plan.pages.find((candidate) => candidate.sourceBlueprintRegionIds.includes(input.node.sourceBlueprintRegionIds[0]!))!.sourceBlueprintPageId)!;
    page.regions.find((region) => region.id === input.node.sourceBlueprintRegionIds[0])!.visualRegionIds = ["heading"];
    return { ...input, blueprint };
  }
  it("does not let a semantic binding move confirmed visual content to a different blueprint region", () => {
    const input = sourceOwnershipInput();
    expect(() => validateVisualSemanticBindings(input.context, input.plan, input.bindings, input.blueprint)).not.toThrow();
    input.node.sourceBlueprintRegionIds = ["wrong-confirmed-region"];
    expect(() => validateVisualSemanticBindings(input.context, input.plan, input.bindings, input.blueprint)).toThrow("VISUAL_BLUEPRINT_SEMANTIC_SOURCE_MISMATCH");
  });
  it("does not accept a blueprint region ID as a visual ID", () => {
    const input = sourceOwnershipInput();
    expect(() => validateVisualSemanticBindings(input.context, input.plan, [{ regionId: input.node.sourceBlueprintRegionIds[0]!, nodeId: input.node.id }], input.blueprint)).toThrow("UNKNOWN_VISUAL_REGION");
  });
  it("rejects an incompatible direct control before provenance or snapshot publication", () => {
    const input = sourceOwnershipInput();
    input.node.capabilityId = "richtext";
    expect(() => validateVisualSemanticBindings(input.context, input.plan, input.bindings, input.blueprint))
      .toThrow("VISUAL_BLUEPRINT_CONTROL_CAPABILITY_MISMATCH: heading");
  });
  it("checks compiled native ownership independently of semantic bindings", () => {
    const blueprint = structuredClone(fixture.artifact.blueprint);
    const implementation = structuredClone(fixture.artifact.implementation);
    const page = implementation.pages.find((candidate) => candidate.compatibility === "native" && candidate.controls.some((control) => control.id === componentId))!;
    if (page.compatibility !== "native") throw new Error("native fixture required");
    const control = page.controls.find((candidate) => candidate.id === componentId)!;
    blueprint.pages.find((candidate) => candidate.id === control.sourceBlueprintPageId)!.regions.find((region) => region.id === control.sourceBlueprintRegionIds[0])!.visualRegionIds = ["heading"];
    const input = { blueprint, visual: visual(), implementation, sourceMap: [{ regionId: "heading", componentId, nativeIds: ["native1"] }] };
    expect(() => validateVisualBlueprintNativeSources(input)).not.toThrow();
    control.sourceBlueprintRegionIds = ["wrong-confirmed-region"];
    expect(() => validateVisualBlueprintNativeSources(input)).toThrow("VISUAL_BLUEPRINT_NATIVE_SOURCE_MISMATCH");
  });
  // end
  it("requires a server-frozen workspace field and exact semantic and native text, not guessed data", () => {
    const input = workspaceDataInput();
    expect(validateVisualPlanningContext(input.context)).toEqual(input.context);
    expect(() => validateVisualSemanticBindings(input.context, input.plan, input.bindings)).not.toThrow();
    const control = fixture.materialization.controls.find(item => item.sourceSolutionNodeId === input.node.id)!;
    const materialization = structuredClone(fixture.materialization);
    materialization.controls.find(item => item.semanticControlId === control.semanticControlId)!.nativeProperties.text = input.node.content;
    const reference = { ...input.context, bindings: [{ regionId: "heading", componentId: control.semanticControlId }] };
    expect(buildVisualSourceMap({ visual: reference, materialization })).toHaveLength(1);
    materialization.controls.find(item => item.semanticControlId === control.semanticControlId)!.nativeProperties.text = "模型猜测的名称";
    expect(() => buildVisualSourceMap({ visual: reference, materialization })).toThrow("VISUAL_NATIVE_DATA_REQUIREMENT_MISMATCH");
  });
  it.each(["missing", "duplicate", "unknown", "unrequested"])("rejects workspace snapshot coverage mismatch: %s", changed => {
    const input = workspaceDataInput();
    if (changed === "missing") delete input.context.dataSnapshots;
    if (changed === "duplicate") input.context.dataSnapshots!.push(input.context.dataSnapshots![0]!);
    if (changed === "unknown") input.context.dataSnapshots![0]!.regionId = "unknown";
    if (changed === "unrequested") delete input.context.spec.regions[0]!.dataRequirement;
    input.context.specHash = canonicalServerHash(input.context.spec);
    expect(() => validateVisualPlanningContext(input.context)).toThrow("VISUAL_DATA_SNAPSHOT_MISMATCH");
  });
  it.each(["content", "wrong-control", "properties", "event", "mock", "multiple"])("rejects semantic workspace-field substitution: %s", changed => {
    const input = workspaceDataInput();
    if (changed === "content") input.node.content = "虚构业务数据";
    if (changed === "wrong-control") input.node.capabilityId = "richtext";
    if (changed === "properties") input.node.properties = [{ name: "label", value: "另一份内容" }];
    if (changed === "event") input.node.eventBindings = [{ semanticEvent: "click", actionIds: ["unknown-action"] }];
    if (changed === "mock") input.node.mockDataId = "untrusted-data";
    if (changed === "multiple") input.bindings.push({ regionId: "heading", nodeId: input.plan.pages[0]!.root.id });
    expect(() => validateVisualSemanticBindings(input.context, input.plan, input.bindings)).toThrow("VISUAL_DATA_REQUIREMENT_MISMATCH");
  });
  // end

  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  function feedbackInput() {
    const plan = structuredClone(fixture.artifact.semanticPlan);
    const nodes: SolutionNode[] = [];
    const visit = (node: SolutionNode): void => {
      nodes.push(node);
      if (node.kind === "layout") node.children.forEach(visit);
      else if (node.kind === "repeater") visit(node.template);
      else if (node.kind === "registered-module") node.slots.forEach(slot => slot.children.forEach(visit));
    };
    plan.pages.forEach(page => visit(page.root));
    const node = nodes.find(item => item.kind === "control" && item.id === "admin-sidebar-members") as ControlNode;
    const feedbackId = node.eventBindings[0]!.actionIds[0]!;
    plan.actions[plan.actions.findIndex(action => action.id === feedbackId)] = { id: feedbackId, kind: "show-feedback", level: "info", message: "本地提示", afterActionIds: [],
      journeyStepRefs: [{ journeyId: "admin-directory-journey", stepIndex: 0 }] };
    const referenceSpec = VisualReferenceSpecSchema.parse({ ...spec, regions: [{ ...spec.regions[0], role: "action",
      interactionRequirement: { kind: "click-feedback", level: "info", message: "本地提示" } }] });
    const context: VisualPlanningContext = { ...visual(), spec: referenceSpec, specHash: canonicalServerHash(referenceSpec),
      mappings: [{ ...mapping, controlType: "button", capabilityId: "button" }],
      acceptedDifferences: [{ regionId: "heading", disposition: "accept-unverified", capabilityId: "button", reason: "接受尚未原生验证的点击反馈" }] };
    return { context, plan, node, bindings: [{ regionId: "heading", nodeId: node.id }] };
  }
  it("requires the exact unconditional local feedback on the region's own button click", () => {
    const input = feedbackInput();
    expect(() => validateVisualSemanticBindings(input.context, input.plan, input.bindings)).not.toThrow();
    const compiled = compileSolutionImplementationWithProvenance({ plan: input.plan, candidateBundle: fixture.artifact.candidateBundle,
      moduleRegistry: createDefaultModuleRegistry(), approvedAssets: [], activeCatalogVersion: "1.0.0" });
    expect(compiled.implementation.pages.flatMap(page => page.compatibility === "native" ? page.controls : [])
      .some(control => control.capabilityId === "button")).toBe(true);
  });
  it.each(["missing", "message", "level", "event", "condition", "dependency", "successor", "extra-action", "script", "wrong-node", "duplicate-owner"])(
    "rejects a visual click-feedback mismatch: %s", changed => {
      const input = feedbackInput(); const action = input.plan.actions.find(item => item.id === input.node.eventBindings[0]!.actionIds[0])!;
      if (changed === "missing") input.node.eventBindings = [];
      if (changed === "message" && action.kind === "show-feedback") action.message = "模型更改了提示";
      if (changed === "level" && action.kind === "show-feedback") action.level = "error";
      if (changed === "event") input.node.eventBindings[0]!.semanticEvent = "change";
      if (changed === "condition") action.conditions = [{ left: { kind: "literal", value: true }, operator: "equals", right: { kind: "literal", value: false } }];
      if (changed === "dependency") action.afterActionIds = ["another-action"];
      if (changed === "successor") input.plan.actions[0]!.afterActionIds = [action.id];
      if (changed === "extra-action") input.node.eventBindings[0]!.actionIds.push("another-action");
      if (changed === "script") input.plan.actions[input.plan.actions.indexOf(action)] = { id: action.id, kind: "run-script", scriptId: "unknown-script", afterActionIds: [] };
      if (changed === "wrong-node") input.node.capabilityId = "text";
      if (changed === "duplicate-owner") input.bindings.push({ regionId: "heading", nodeId: input.plan.pages[0]!.root.id });
      expect(() => validateVisualSemanticBindings(input.context, input.plan, input.bindings)).toThrow("VISUAL_INTERACTION_REQUIREMENT_MISMATCH");
    });
  it("permits explicit region omission but never silently omits an unfulfilled interaction", () => {
    const input = feedbackInput();
    expect(() => validateVisualSemanticBindings(input.context, input.plan, [])).toThrow("VISUAL_REGION_WITHOUT_COMPONENTS");
    input.context.acceptedDifferences = [{ regionId: "heading", disposition: "omit", capabilityId: null, reason: "本轮明确省略按钮及交互" }];
    expect(() => validateVisualSemanticBindings(input.context, input.plan, [])).not.toThrow();
  });
  it("checks the bound native button event and exact literal effect again at source-map/snapshot boundaries", () => {
    const input = feedbackInput(); const materialization = structuredClone(fixture.materialization);
    const control = materialization.controls.find(item => item.sourceSolutionNodeId === input.node.id)!;
    const owner = control.instanceName;
    materialization.interactions.eventBindings = materialization.interactions.eventBindings.filter(item => item.ownerInstanceName !== owner);
    materialization.interactions.actions = materialization.interactions.actions.filter(item => item.ownerInstanceName !== owner);
    materialization.interactions.actions.push({ id: "kf$action:visual-feedback", sourceActionId: "visual-feedback", ownerInstanceName: owner,
      kind: "show-feedback", message: "本地提示", level: "info" });
    materialization.interactions.eventBindings.push({ id: "kf$binding:visual-feedback", ownerInstanceName: owner, kfEvent: "onClick",
      phase: "event", scriptModuleIds: [], nativeActionIds: ["kf$action:visual-feedback"] });
    const visualReference = { ...input.context, bindings: [{ regionId: "heading", componentId: control.semanticControlId }] };
    expect(buildVisualSourceMap({ visual: visualReference, materialization })).toHaveLength(1);
    for (const changed of ["message", "event", "missing", "script", "phase"] as const) {
      const altered = structuredClone(materialization);
      const event = altered.interactions.eventBindings.at(-1)!;
      const action = altered.interactions.actions.at(-1)!;
      if (changed === "message" && action.kind === "show-feedback") action.message = "改变后的提示";
      if (changed === "event") event.kfEvent = "onChange";
      if (changed === "missing") altered.interactions.eventBindings.pop();
      if (changed === "script") event.scriptModuleIds = ["kf$script:unexpected"];
      if (changed === "phase") event.phase = "after-event";
      expect(() => buildVisualSourceMap({ visual: visualReference, materialization: altered })).toThrow();
    }
  });
  // end

  it("derives native GUIDs from the authoritative materialization, never from model IDs", () => {
    const result = buildVisualSourceMap({ visual: visual(), materialization: fixture.materialization });
    const control = fixture.materialization.controls.find(control => control.semanticControlId === componentId)!;
    expect(result).toEqual([{ regionId: "heading", componentId, nativeIds: [deriveGuid({ seed: "snapshot-workspace" }, control.instanceName)] }]);
    expect(result).toEqual(buildVisualSourceMap({ visual: visual(), materialization: fixture.materialization }));
  });
  it("requires explicit acknowledgement of supported but unverified capabilities", () => {
    expect(() => buildVisualSourceMap({ visual: { ...visual(), acceptedDifferences: [] }, materialization: fixture.materialization })).toThrow("VISUAL_ACKNOWLEDGEMENT_REQUIRED");
  });
  it("does not require acceptance of a capability when the user explicitly omits its region", () => {
    const omitted = { ...visual(), bindings: [], acceptedDifferences: [{ regionId: "heading", disposition: "omit" as const, capabilityId: null, reason: "明确省略未验证区域" }] };
    expect(validateVisualPlanningContext({ schemaVersion: omitted.schemaVersion, analysisId: omitted.analysisId, specHash: omitted.specHash,
      spec: omitted.spec, mappings: omitted.mappings, acceptedDifferences: omitted.acceptedDifferences }).acceptedDifferences[0]!.disposition).toBe("omit");
    expect(buildVisualSourceMap({ visual: omitted, materialization: fixture.materialization })).toEqual([]);
    expect(() => buildVisualSourceMap({ visual: { ...omitted, bindings: visual().bindings }, materialization: fixture.materialization })).toThrow("VISUAL_OMITTED_REGION_HAS_COMPONENTS");
  });
  it("rejects missing compiled components and mismatched mapped control types", () => {
    expect(() => buildVisualSourceMap({ visual: { ...visual(), bindings: [{ regionId: "heading", componentId: "missing" }] }, materialization: fixture.materialization })).toThrow("VISUAL_COMPONENT_MISSING");
    expect(() => buildVisualSourceMap({ visual: { ...visual(), mappings: [{ ...mapping, capabilityId: "button", controlType: "button" }] }, materialization: fixture.materialization })).toThrow("VISUAL_CAPABILITY_MISMATCH");
  });
  it("never silently drops an unsupported region or applies its fallback", () => {
    const unsupported = { ...visual(), mappings: [{ ...mapping, controlType: null, capabilityId: null, support: "unsupported" as const }], acceptedDifferences: [] };
    expect(() => buildVisualSourceMap({ visual: unsupported, materialization: fixture.materialization })).toThrow("VISUAL_DIFFERENCE_REQUIRED");
    const omitted = { ...unsupported, bindings: [], acceptedDifferences: [{ regionId: "heading", disposition: "omit" as const, capabilityId: null, reason: "确认暂时省略" }] };
    expect(buildVisualSourceMap({ visual: omitted, materialization: fixture.materialization })).toEqual([]);
    expect(() => buildVisualSourceMap({ visual: { ...omitted, bindings: visual().bindings }, materialization: fixture.materialization })).toThrow("VISUAL_OMITTED_REGION_HAS_COMPONENTS");
  });
  it("rejects stale image-analysis hashes and duplicate bindings", () => {
    expect(() => buildVisualSourceMap({ visual: { ...visual(), specHash: "f".repeat(64) }, materialization: fixture.materialization })).toThrow("VISUAL_SPEC_HASH_MISMATCH");
    expect(() => buildVisualSourceMap({ visual: { ...visual(), bindings: [...visual().bindings, ...visual().bindings] }, materialization: fixture.materialization })).toThrow("VISUAL_COMPONENT_OWNERSHIP_CONFLICT");
  });
  it("stores normalized semantic inputs, assets and deterministic source map without mutating signed plans", () => {
    const planHash = canonicalServerHash(fixture.plan);
    const input = { workspaceId: "snapshot-workspace", baseRevisionId: "snapshot-base", artifact: fixture.artifact, materialization: fixture.materialization, assetManifest: [], visual: visual() };
    const content = buildGenerationSnapshotContent(input);
    expect(content.schema).toBe("kf-generation-snapshot/v1");
    expect(content.sourceMap).toHaveLength(1);
    expect(content.assetManifest).toEqual([]);
    expect(canonicalServerHash(content)).toBe(canonicalServerHash(buildGenerationSnapshotContent(structuredClone(input))));
    expect(canonicalServerHash(fixture.plan)).toBe(planHash);
  });
  it("rejects unvalidated semantic payloads and altered native provenance", () => {
    const input = { workspaceId: "snapshot-workspace", baseRevisionId: "snapshot-base", artifact: fixture.artifact, materialization: fixture.materialization, assetManifest: [], visual: null };
    expect(() => buildGenerationSnapshotContent({ ...input, artifact: { ...fixture.artifact, semanticPlan: {} } })).toThrow();
    expect(() => buildGenerationSnapshotContent({ ...input, materialization: { ...fixture.materialization, workspaceId: "other" } })).toThrow();
    expect(() => buildGenerationSnapshotContent({ ...input, assetManifest: [{ purpose: "reference", sourceHash: spec.sourceHash }] })).toThrow();
  });
  it("resolves model semantic bindings only through compiler-owned provenance", () => {
    const compiled = compileSolutionImplementationWithProvenance({ plan: fixture.artifact.semanticPlan, candidateBundle: fixture.artifact.candidateBundle,
      moduleRegistry: createDefaultModuleRegistry(), approvedAssets: [], activeCatalogVersion: "1.0.0" });
    const control = fixture.materialization.controls.find(control => control.semanticControlId === componentId)!;
    const { bindings: ignored, ...context } = visual();
    void ignored;
    const input = { context, bindings: [{ regionId: "heading", nodeId: control.sourceSolutionNodeId }], plan: fixture.artifact.semanticPlan,
      provenance: compiled.provenance, materialization: fixture.materialization };
    expect(resolveVisualSemanticBindings(input)).toMatchObject({ bindings: [{ regionId: "heading", componentId }] });
    expect(() => resolveVisualSemanticBindings({ ...input, bindings: [{ regionId: "heading", nodeId: "invented-node" }] })).toThrow("VISUAL_SEMANTIC_NODE_MISSING");
    expect(() => resolveVisualSemanticBindings({ ...input, provenance: {} as typeof compiled.provenance })).toThrow("SEMANTIC_PROVENANCE_REQUIRED");
    expect(() => resolveVisualSemanticBindings({ ...input, bindings: [...input.bindings, ...input.bindings] })).toThrow("VISUAL_SEMANTIC_BINDING_DUPLICATE");
  });
});
// end
