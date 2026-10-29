// modified by jinlong.feng at 2026-10-26 Agent工作台迭代
import { VisualReferenceSpecSchema, type VisualReferenceSpec, type VisualReviewAcceptance } from "../../packages/contracts/src/index.js";

/** Test-operator decisions for one inspected synthetic image. Never imported by production review/mapping code. */
export function reviewedEnergyDecorationOmissions(input: VisualReferenceSpec): VisualReviewAcceptance["acceptedDifferences"] {
  const spec = VisualReferenceSpecSchema.parse(input);
  if (spec.sourceHash !== "3a79f4361e1e48b80ce64b1ec4053be63b4827df1c3f42deb5c7887bd3f2488c") return [];
  const descendants = (id: string): string[] => spec.regions.filter(region => region.parentId === id)
    .flatMap(region => [...region.text, ...descendants(region.id)]);
  return spec.regions.flatMap(region => {
    if (region.text.length || region.interactionHint !== null || region.interactionRequirement || region.dataRequirement
      || spec.regions.some(child => child.parentId === region.id)) return [];
    const parent = spec.regions.find(item => item.id === region.parentId);
    if (!parent) return [];
    const labels = [...parent.text, ...descendants(parent.id)];
    const staticStatusDot = ["image", "table"].includes(region.role) && region.box.x >= 0.45 && region.box.x <= 0.5
      && region.box.y >= 0.6 && region.box.y <= 0.88 && region.box.width >= 0.008 && region.box.width <= 0.02
      && region.box.height >= 0.01 && region.box.height <= 0.03
      && ["1号配电室", "中央空调", "光伏逆变器"].some(label => labels.includes(label))
      && ["运行正常", "待检修"].some(label => labels.includes(label));
    const headerDivider = region.role === "image" && parent.role === "header" && labels.includes("能源管理系统")
      && region.box.x >= 0.15 && region.box.x <= 0.23 && region.box.y < 0.12
      && region.box.width <= 0.005 && region.box.height >= 0.02 && region.box.height <= 0.09;
    if (!staticStatusDot && !headerDivider) return [];
    return [{ regionId: region.id, disposition: "omit" as const, capabilityId: null,
      reason: staticStatusDot ? "固定能源演示验收场景明确省略与相邻状态文字冗余的小色点，完整保留设备及运行正常/待检修文字；不代表像素一致。"
        : "固定能源演示验收场景明确省略页头纯装饰细分隔线，完整保留系统名称和总览文字；不代表像素一致。" }];
  });
}
// end
