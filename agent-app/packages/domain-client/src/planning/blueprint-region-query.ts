import type { CustomerSolutionBlueprint } from "@kf/contracts";

export interface BlueprintRegionQuery {
  readonly pageId: string;
  readonly regionId: string;
  readonly semanticRoles: readonly string[];
  readonly dataShape: string;
  readonly density: "compact" | "comfortable" | "spacious";
  readonly purpose: string;
  readonly interactions: readonly string[];
  readonly visualIntent: string;
}

/** Extracts the bounded customer semantics used by local capability retrieval. */
export function buildBlueprintRegionQueries(
  blueprint: CustomerSolutionBlueprint,
): readonly BlueprintRegionQuery[] {
  return Object.freeze(blueprint.pages.flatMap((page) =>
    page.regions.map((region) => Object.freeze({
      pageId: page.id,
      regionId: region.id,
      semanticRoles: Object.freeze([...region.semanticRoles]),
      dataShape: region.dataShape,
      density: region.density,
      purpose: region.purpose,
      interactions: Object.freeze([...region.interactions]),
      visualIntent: region.visualIntent,
    })),
  ));
}
