// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
import type { CustomerSolutionBlueprint } from "./solution-blueprint.js";
import type { ControlNode, SolutionImplementationPlan } from "./solution-implementation-plan.js";
import type { StyleDeclarationV2, UIImplementationControlV2, UIImplementationSpecV2 } from "./ui-style.js";
import { projectSolutionNodes, projectedObservationText, SolutionProvenanceError, type ProjectedSolutionNode } from "./solution-node-projection.js";

export interface ObservationJourneyIssue {
  stepKey: string;
  expectedText: string;
  message: string;
}

interface ObservationWitness {
  pageId: string;
  node: ControlNode;
  entry: ProjectedSolutionNode;
  text: string;
  ancestors: ProjectedSolutionNode[];
}

function allowsStaticReading(style: StyleDeclarationV2 | undefined, theme: Readonly<Record<string, unknown>>): boolean {
  let color = style?.textColor?.toLowerCase();
  if (style?.textColor?.startsWith("{theme.")) {
    const value = theme[style.textColor.slice(7, -1)];
    if (typeof value !== "string") return false;
    color = value.toLowerCase();
  }
  // Fail closed on functional alpha colors until a reviewed color/readability evaluator is available.
  if (color === "transparent" || color?.includes("(") === true
    || (color?.length === 5 && color.startsWith("#") && Number.parseInt(color.slice(-1), 16) < 2)
    || (color?.length === 9 && color.startsWith("#") && Number.parseInt(color.slice(-2), 16) < 26)) return false;
  return style === undefined || (
    (style.opacity === undefined || style.opacity >= 0.1)
    && style.truncate !== true
    && (style.advanced?.length ?? 0) === 0
  );
}

function readableSemanticControls(plan: SolutionImplementationPlan): ObservationWitness[] {
  const witnesses: ObservationWitness[] = [];
  for (const page of plan.pages) {
    let projected: ReadonlyMap<string, ProjectedSolutionNode>;
    try { projected = projectSolutionNodes(plan, page.root); }
    catch (error) { if (error instanceof SolutionProvenanceError) continue; throw error; }
    for (const entry of projected.values()) {
      const node = entry.sourceNode;
      if (node.kind !== "control" || !["text", "richtext", "button"].includes(node.capabilityId)
        || node.tabIds.length > 0 || node.mockDataId !== undefined) continue;
      const text = projectedObservationText(node.content, entry);
      if (text === undefined || /[<>]/.test(text)
        || node.properties.some((property) => property.name !== "text" || projectedObservationText(property.value, entry) !== text)) continue;
      const ancestors: ProjectedSolutionNode[] = [];
      let parentId = entry.parentId;
      while (parentId !== undefined) {
        const parent = projected.get(parentId)!;
        ancestors.unshift(parent);
        parentId = parent.parentId;
      }
      if (ancestors.some((parent) => parent.kind !== "repeater-item"
        && (parent.sourceNode.kind !== "layout" || parent.sourceNode.layout === "overlay-anchor"))) continue;
      const role = plan.roleStyles.find((style) => style.role === node.styleRole);
      if (!allowsStaticReading({ ...role?.declarations, ...node.styleOverride?.declarations }, plan.theme)) continue;
      witnesses.push({ pageId: page.id, node, entry, text, ancestors });
    }
  }
  return witnesses;
}

function readableNativeWitness(
  witness: ObservationWitness,
  text: string,
  blueprintPageId: string,
  regionId: string,
  implementation: UIImplementationSpecV2,
): boolean {
  const page = implementation.pages.find((candidate) => candidate.id === witness.pageId);
  if (page?.compatibility !== "native" || page.sourceBlueprintPageId !== blueprintPageId) return false;
  const controls = new Map(page.controls.map((control) => [control.id, control]));
  const control = controls.get(witness.entry.id);
  if (control === undefined || control.sourceSolutionNodeId !== witness.entry.id
    || control.capabilityId !== witness.node.capabilityId || control.content !== text || control.nativeProperties["text"] !== text
    || control.sourceBlueprintPageId !== blueprintPageId || !control.sourceBlueprintRegionIds.includes(regionId)) return false;
  const readable = (candidate: UIImplementationControlV2, expected: ProjectedSolutionNode): boolean => {
    const role = implementation.compiledRoleStyles[candidate.role];
    return candidate.sourceRepeaterId === expected.sourceRepeaterId && candidate.sourceModuleId === undefined
      && candidate.sourceSolutionNodeId === expected.id && candidate.sourceBlueprintPageId === blueprintPageId
      && candidate.sourceBlueprintRegionIds.length === expected.sourceNode.sourceBlueprintRegionIds.length
      && candidate.sourceBlueprintRegionIds.every((id, index) => id === expected.sourceNode.sourceBlueprintRegionIds[index])
      && (expected.kind !== "repeater-item" || (candidate.role === "repeater-item" && candidate.compiledLayout?.kind === "column"))
      && (expected.sourceNode.kind !== "layout" || candidate.compiledLayout?.kind === expected.sourceNode.layout)
      && candidate.overlayHost === undefined
      && candidate.tabPane === undefined && candidate.dataBinding === undefined
      && candidate.nativeProperties["visible"] !== false && candidate.nativeProperties["runVisible"] !== false
      && candidate.geometry.width > 0 && candidate.geometry.height > 0
      && candidate.geometry.x >= 0 && candidate.geometry.y >= 0
      && candidate.geometry.x + candidate.geometry.width <= page.width
      && candidate.geometry.y + candidate.geometry.height <= page.height
      && allowsStaticReading({ textColor: implementation.theme.textPrimary }, implementation.theme)
      && allowsStaticReading(role?.declarations, implementation.theme)
      && allowsStaticReading(candidate.style?.declarations, implementation.theme)
      && (candidate.compiledStyle?.cssFragments ?? [])
        .filter((fragment) => fragment.state === "normal").every((fragment) => allowsStaticReading(fragment.declarations, implementation.theme));
  };
  if (!readable(control, witness.entry)) return false;
  let child = control;
  // Require the actual compiled parent chain to be the same ordinary semantic layout path.
  for (const ancestor of [...witness.ancestors].reverse()) {
    const parent = controls.get(ancestor.id);
    if (child.parentId !== ancestor.id || parent === undefined
      || parent.compiledLayout === undefined || !readable(parent, ancestor)
      || child.geometry.x < parent.geometry.x || child.geometry.y < parent.geometry.y
      || child.geometry.x + child.geometry.width > parent.geometry.x + parent.geometry.width
      || child.geometry.y + child.geometry.height > parent.geometry.y + parent.geometry.height) return false;
    child = parent;
  }
  return child.parentId === undefined;
}

/** Bounded static-content proof, not pixel/occlusion or KF runtime evidence. Inputs must already pass their strict schemas. */
export function validateObservationJourneys(
  blueprint: CustomerSolutionBlueprint,
  plan: SolutionImplementationPlan,
  implementation?: UIImplementationSpecV2,
): ObservationJourneyIssue[] {
  if (!blueprint.journeys.some((journey) => journey.steps.some((step) => step.kind === "observe"))) return [];
  const witnesses = readableSemanticControls(plan);
  const pageById = new Map(plan.pages.map((page) => [page.id, page]));
  const issues: ObservationJourneyIssue[] = [];
  blueprint.journeys.forEach((journey) => journey.steps.forEach((step, stepIndex) => {
    if (step.kind !== "observe") return;
    step.expectedTexts.forEach((text) => {
      const matched = witnesses.some((witness) => pageById.get(witness.pageId)?.sourceBlueprintPageId === step.pageId
        && witness.node.sourceBlueprintRegionIds.includes(step.regionId) && witness.text === text
        && (implementation === undefined || readableNativeWitness(witness, text, step.pageId, step.regionId, implementation)));
      if (!matched) issues.push({ stepKey: `${journey.id}:${stepIndex}`, expectedText: text,
        message: "observation requires exact static text on an ownership-correct readable native path" });
    });
  }));
  return issues;
}
// end
