// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import { VisualRegionSchema, type VisualRegion } from "@kf/contracts";
import { z } from "zod";
import { getVisualCapabilitySurface } from "../design-knowledge/design-knowledge-catalog.js";
import { evaluateCapabilityEvidence, type CapabilityEvidence } from "./capability-evidence.js";
// modified by jinlong.feng at 2026-10-26 Agent工作台迭代
import { suggestVisualContainerArrangement } from "./visual-layout-proposal.js";
// end
export type MappingCandidate = {
  capabilityId: string; controlType: string; supportedRoles: VisualRegion["role"][];
  evidence: CapabilityEvidence[]; fallback: string | null;
  score?: number;
  // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
  regionScores?: Record<string, number>;
  // end
};
export type RegionMapping = {
  regionId: string; controlType: string | null; capabilityId: string | null;
  support: "verified" | "supported_unverified" | "unsupported";
  reason: string; evidenceIds: string[]; fallback: string | null;
};
export type VisualRegionRequirements = { properties: string[]; interactions: string[] };
const requirementName = z.string().min(1).max(128);
const requirementsSchema = z.object({
  properties: z.array(requirementName).max(200), interactions: z.array(requirementName).max(100),
}).strict();

function fallbackFor(role: VisualRegion["role"]): string {
  if (role === "chart" || role === "table") return "可选择用现有布局和文本组成静态数据表；不等同原图的图表、分页或数据绑定，须用户确认。";
  if (role === "image") return "请提供并批准独立业务素材，或确认使用文字占位；参考图本身不会作为工程素材。";
  return "请调整需求，或确认以已支持的布局、文本和按钮拆分实现；不会自动替换。";
}

export function mapVisualRegions(input: {
  regions: VisualRegion[]; candidates: MappingCandidate[]; targetRuntimeVersion: string;
  requirements?: Record<string, VisualRegionRequirements>;
}): RegionMapping[] {
  if (input.regions.length > 100 || input.candidates.length > 25) throw new Error("VISUAL_MAPPING_LIMIT_EXCEEDED");
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(input.targetRuntimeVersion)) throw new Error("VISUAL_RUNTIME_INVALID");
  const regions = input.regions.map(region => VisualRegionSchema.parse(region));
  if (new Set(regions.map(region => region.id)).size !== regions.length) throw new Error("VISUAL_REGION_DUPLICATE");
  if (new Set(input.candidates.map(candidate => candidate.capabilityId)).size !== input.candidates.length) throw new Error("VISUAL_CANDIDATE_DUPLICATE");
  for (const regionId of Object.keys(input.requirements ?? {})) {
    if (!regions.some(region => region.id === regionId)) throw new Error("UNKNOWN_VISUAL_REGION");
    if (!requirementsSchema.safeParse(input.requirements![regionId]).success) throw new Error("VISUAL_REQUIREMENTS_INVALID");
  }
  return regions.map(region => {
    // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
    const arrangement = suggestVisualContainerArrangement(region, regions);
    const suggestedCapabilityId = arrangement?.axis === "row" ? "layout.2" : arrangement?.axis === "column" ? "layout.4" : null;
    // end
    // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
    const hasClarifications = Boolean(region.clarifications?.interaction || region.clarifications?.dataSource);
    const withClarificationNotice = (reason: string) => hasClarifications
      ? `补充说明未验证，不代表交互或数据绑定已实现。${reason}`.slice(0, 4000) : reason;
    const feedbackRequired = region.interactionRequirement !== undefined;
    const workspaceDataRequired = region.dataRequirement !== undefined;
    // end
    const requirements = Object.hasOwn(input.requirements ?? {}, region.id) ? input.requirements![region.id] : undefined;
    const rejected: string[] = [];
    const eligible = input.candidates.flatMap(candidate => {
      // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
      if (candidate.regionScores && !Object.hasOwn(candidate.regionScores, region.id)) return [];
      // end
      const surface = getVisualCapabilitySurface(candidate.capabilityId);
      if (surface === undefined || !surface.eligible || candidate.controlType !== surface.controlType
        || !surface.supportedRoles.includes(region.role) || !candidate.supportedRoles.includes(region.role)) return [];
      // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
      if (feedbackRequired && (region.role !== "action" || candidate.capabilityId !== "button")) {
        rejected.push("当前点击反馈仅支持已审核的 button 组件，不自动替代。");
        return [];
      }
      if (workspaceDataRequired && (region.role !== "text" || candidate.capabilityId !== "text")) {
        rejected.push("工作区字段只读快照仅支持 text 组件，不自动替代或连接外部数据源。");
        return [];
      }
      // end
      if (region.interactionHint?.trim() && requirements === undefined) {
        rejected.push("交互需确认：截图中的提示不等于经过确认的语义事件或数据源。");
        return [];
      }
      const properties = [...new Set([
        ...(requirements?.properties ?? []),
        ...(region.text.length > 0 && surface.properties.includes("property:text") ? ["property:text"] : []),
      ])];
      // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
      const interactions = [...new Set([...(requirements?.interactions ?? []), ...(feedbackRequired ? ["click"] : [])])];
      // end
      const missing = [
        ...properties.filter(property => !surface.properties.includes(property)),
        ...interactions.filter(interaction => !surface.interactions.includes(interaction)),
      ];
      if (missing.length > 0) {
        rejected.push(`所需能力未支持：${missing.slice().sort().join("、")}。`);
        return [];
      }
      const evidence = evaluateCapabilityEvidence({ controlType: surface.controlType, properties, interactions,
        targetRuntimeVersion: input.targetRuntimeVersion, evidence: candidate.evidence });
      return [{ candidate, surface, evidence }];
    }).sort((left, right) => {
      const verification = Number(right.evidence.support === "verified") - Number(left.evidence.support === "verified");
      // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
      const localScore = (candidate: MappingCandidate) => candidate.regionScores ? candidate.regionScores[region.id] : candidate.score;
      const leftScore = Number.isFinite(localScore(left.candidate)) ? localScore(left.candidate)! : 0;
      const rightScore = Number.isFinite(localScore(right.candidate)) ? localScore(right.candidate)! : 0;
      const geometryPreference = Number(right.candidate.capabilityId === suggestedCapabilityId) - Number(left.candidate.capabilityId === suggestedCapabilityId);
      return verification || geometryPreference || rightScore - leftScore
        || (left.candidate.capabilityId < right.candidate.capabilityId ? -1 : left.candidate.capabilityId > right.candidate.capabilityId ? 1 : 0);
      // end
    });
    const chosen = eligible[0];
    // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
    const arrangementNote = arrangement && chosen?.candidate.capabilityId === suggestedCapabilityId
      ? `子区域几何建议${arrangement.axis === "row" ? "横向" : "纵向"}排列；仅为待审核布局建议，不代表还原效果或原生运行已验证。` : "";
    // end
    const confidenceNote = region.confidence < 0.7 ? " 识别置信度低，关键内容须澄清。" : "";
    if (chosen === undefined) return {
      regionId: region.id, controlType: null, capabilityId: null, support: "unsupported" as const,
      // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
      reason: withClarificationNotice(([...new Set(rejected)].sort().join(" ") || "没有满足该区域角色的已审核新生成能力；空壳、partial 和 preserve-only 不作为可还原控件。") + confidenceNote),
      // end
      evidenceIds: [], fallback: fallbackFor(region.role),
    };
    return {
      regionId: region.id, controlType: chosen.surface.controlType, capabilityId: chosen.candidate.capabilityId,
      // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
      support: (hasClarifications || feedbackRequired || workspaceDataRequired) && chosen.evidence.support === "verified" ? "supported_unverified" as const : chosen.evidence.support, evidenceIds: chosen.evidence.evidenceIds,
      // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
      reason: withClarificationNotice(`${arrangementNote}${workspaceDataRequired ? "工作区字段只读快照须按服务端取值编译，非实时连接，尚未经过原生运行验证。" : ""}${feedbackRequired ? "点击反馈须匹配实际 click/show-feedback 动作，尚未经过原生运行验证。" : ""}目录状态 ${chosen.surface.generationStatus}。${chosen.evidence.reason}${confidenceNote}`),
      // end
      // end
      fallback: chosen.candidate.fallback,
    };
  });
}
// end
