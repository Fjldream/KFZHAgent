// modified by jinlong.feng at 2026-10-26 Agent工作台迭代
import { ControlNodeSchema, LayoutNodeSchema, NativeThemeSpecSchema, RoleStyleIntentSchema,
  readAddressableVisualSemanticGraph, resolveVisualBlueprintSources, CustomerSolutionBlueprintSchema, type ApprovedAssetFacts } from "@kf/contracts";
import { compileResolvedStyle, getControlCapability, KF36_RUNTIME_PROFILE, layoutCapabilityIdsFor, validateVisualNodeCapability } from "@kf/domain-client";
import type { ModelPortContext } from "@kf/agent-orchestrator";
import { normalizeSolutionStyleAliases } from "../conversations/deepseek-model.js";
import type { SemanticOutputIssue } from "./visual-semantic-output.js";
// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import { canonicalServerHash, CapabilityCandidateBundleSchema } from "@kf/contracts";
import { visualLayoutAdmission } from "./visual-layout-obligations.js";
// end

/** Independent diagnostics only: no tree synthesis, native IDs, signing or materialization. */
// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
export function inspectVisualSemanticCapabilities(context: ModelPortContext, raw: unknown, assets: readonly ApprovedAssetFacts[]): SemanticOutputIssue[] {
  const addressable = readAddressableVisualSemanticGraph(raw);
  if (!addressable) return [];
  const graph = readAddressableVisualSemanticGraph(normalizeSolutionStyleAliases(addressable));
  if (!graph || !context.visualReference) return [];
  const byId = new Map(graph.nodes.map(node => [node.id, node]));
  if (byId.size !== graph.nodes.length) return [];
  const blueprint = CustomerSolutionBlueprintSchema.parse(context.confirmedSolutionBlueprint);
  const candidates = CapabilityCandidateBundleSchema.safeParse(context.capabilityCandidates);
  if (!candidates.success || candidates.data.blueprintHash !== canonicalServerHash(blueprint)) return [];
  const sources = resolveVisualBlueprintSources(blueprint, context.visualReference);
  const issues: SemanticOutputIssue[] = [];
  for (const binding of graph.bindings) {
    if (issues.length >= 12) break;
    const source = sources.find(item => item.visualRegionId === binding.regionId);
    const node = byId.get(binding.nodeId);
    if (!source || !node) continue;
    const payload: Record<string, unknown> = node;
    const layout = LayoutNodeSchema.shape.layout.safeParse(payload.layout);
    const capability = ControlNodeSchema.shape.capabilityId.safeParse(payload.capabilityId);
    const typed = node.kind === "layout" && layout.success ? { kind: "layout" as const, layout: layout.data }
      : node.kind === "control" && capability.success ? { kind: "control" as const, capabilityId: capability.data } : null;
    if (!typed) continue;
    try { validateVisualNodeCapability(typed, source); }
    catch (error) {
      if (!(error instanceof Error)) continue;
      const code = error.message.split(":", 1)[0]!;
      if (!["VISUAL_BLUEPRINT_LAYOUT_CAPABILITY_MISMATCH", "VISUAL_BLUEPRINT_CONTROL_CAPABILITY_MISMATCH"].includes(code)) continue;
      const admission = visualLayoutAdmission(source.capabilityId, candidates.data.regions.find(region => region.pageId === source.pageId && region.regionId === source.regionId));
      const suggestedInnerLayoutKind = typed.kind === "layout" && admission.directLayoutKinds.length > 0
        && !admission.directLayoutKinds.includes(typed.layout) && admission.availableInnerLayoutKinds.some(kind => kind === typed.layout) ? typed.layout : undefined;
      issues.push({ code, regionId: binding.regionId, nodeId: node.id,
        bindingRequirement: { requiredCapabilityId: source.capabilityId, actualKind: typed.kind, ...admission,
          ...(typed.kind === "layout" ? { actualLayout: typed.layout } : { actualCapabilityId: typed.capabilityId }),
          ...(suggestedInnerLayoutKind ? { suggestedInnerLayoutKind } : {}) },
        detail: "The bound node itself must emit the approved capability; a parent/sibling cannot satisfy this binding."
          + (suggestedInnerLayoutKind ? ` Explicitly keep the bound node as an allowed outer layout with one inner ${suggestedInnerLayoutKind} for its content; retain sources on both and styles only on the outer node.` : "") });
    }
  }
  const plan = graph.plan as Record<string, unknown>;
  const theme = NativeThemeSpecSchema.safeParse(plan.theme);
  if (!theme.success) issues.push({ code: "SEMANTIC_THEME_INVALID", path: "plan.theme" });
  const styles = new Map<string, ReturnType<typeof RoleStyleIntentSchema.parse>>();
  if (Array.isArray(plan.roleStyles)) for (const [index, style] of plan.roleStyles.entries()) {
    const parsedStyle = RoleStyleIntentSchema.safeParse(style);
    if (parsedStyle.success) styles.set(parsedStyle.data.role, parsedStyle.data);
    else {
      const role = RoleStyleIntentSchema.shape.role.safeParse(style && typeof style === "object" ? (style as Record<string, unknown>).role : null);
      issues.push({ code: "SEMANTIC_ROLE_STYLE_INVALID", path: `plan.roleStyles.${index}`,
        ...(role.success ? { roleIds: [role.data] } : {}), detail: parsedStyle.error.issues[0]?.message.slice(0, 256) ?? "Invalid role style" });
    }
  }
  if (!theme.success) return issues.slice(0, 12);
  const checked = new Set<string>();
  for (const node of graph.nodes) {
    if (issues.length >= 12) break;
    const payload: Record<string, unknown> = node;
    const role = RoleStyleIntentSchema.shape.role.safeParse(payload.styleRole);
    if (!role.success) continue;
    const style = styles.get(role.data);
    if (!style) continue;
    const layout = LayoutNodeSchema.shape.layout.safeParse(payload.layout);
    const capability = ControlNodeSchema.shape.capabilityId.safeParse(payload.capabilityId);
    const capabilities = node.kind === "layout" && layout.success ? layoutCapabilityIdsFor(layout.data)
      : node.kind === "control" && capability.success ? [capability.data] : [];
    const override = ControlNodeSchema.shape.styleOverride.safeParse(payload.styleOverride);
    if (!override.success) continue;
    for (const capabilityId of capabilities) {
      if (!getControlCapability(capabilityId)) continue;
      const key = JSON.stringify([capabilityId, style, override.data]);
      if (checked.has(key)) continue;
      checked.add(key);
      try {
        compileResolvedStyle({ componentId: "visual-diagnostic", capabilityId, theme: theme.data, styleRole: role.data,
          roleStyle: style, ...(override.data ? { instanceOverride: override.data } : {}), approvedAssets: assets, runtimeProfile: KF36_RUNTIME_PROFILE });
      } catch (error) {
        if (!(error instanceof Error)) continue;
        const code = error.message.match(/^(STYLE_[A-Z0-9_]+):/);
        if (code) issues.push({ code: `NATIVE_${code[1]}`, nodeId: node.id, roleIds: [role.data], detail: error.message.slice(0, 600) });
      }
    }
  }
  return issues.slice(0, 12);
}
// end
// end
