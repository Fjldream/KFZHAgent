// modified by jinlong.feng at 2026-10-26 Agent工作台迭代
import { readFileSync } from "node:fs";
import { CustomerSolutionBlueprintSchema } from "../../packages/contracts/src/solution-blueprint.js";
import { VisualPlanningContextSchema } from "../../packages/contracts/src/generation-snapshot.js";

/** Explicit test approval of region grouping. Never used by production or to mutate the retained negative evidence. */
export function approvedEnergyVisualBlueprint() {
  const base = new URL("../fixtures/energy-overview-20261023/live-semantic-layout-recipe/", import.meta.url);
  const read = (name: string): unknown => JSON.parse(readFileSync(new URL(name, base), "utf8")) as unknown;
  const blueprint = CustomerSolutionBlueprintSchema.parse(read("blueprint.json"));
  const visual = VisualPlanningContextSchema.parse({ ...(read("reference-review.json") as Record<string, unknown>), acceptedDifferences: read("accepted-differences.json") });
  const regionById = new Map(visual.spec.regions.map((region) => [region.id, region]));
  const approvedGroups: Readonly<Record<string, string>> = { header: "appHeader", sidebar: "sideNav", content: "headlineBlock", headlineGroup: "headlineBlock",
    kpiRow: "kpiRow", bottomRow: "deviceCard", deviceCard: "deviceCard", summaryCard: "summaryCard", footnote: "pageFootnote" };
  for (const region of visual.spec.regions) {
    if (visual.acceptedDifferences.some((difference) => difference.regionId === region.id && difference.disposition === "omit")) continue;
    let current = region;
    while (approvedGroups[current.id] === undefined && current.parentId !== null) current = regionById.get(current.parentId)!;
    const destination = blueprint.pages[0]!.regions.find((candidate) => candidate.id === approvedGroups[current.id]);
    if (!destination) throw new Error(`test visual grouping missing: ${region.id}`);
    destination.visualRegionIds = [...(destination.visualRegionIds ?? []), region.id];
  }
  return { blueprint: CustomerSolutionBlueprintSchema.parse(blueprint), visual };
}
// end
