import { z } from "zod";

const stableId = z.string().trim().min(1).max(100).regex(/^[A-Za-z][A-Za-z0-9_-]*$/);
const semver = z.string().trim().regex(/^\d+\.\d+\.\d+$/);
const text = z.string().trim().min(1).max(400);

const RankedCandidateSchema = z.object({
  id: stableId,
  score: z.number().finite().min(-1000).max(1000),
  reasons: z.array(text).min(1).max(8),
  limitations: z.array(text).max(8),
  knowledgeVersion: semver,
}).strict();

export const RegionCapabilityCandidatesSchema = z.object({
  pageId: stableId,
  regionId: stableId,
  controls: z.array(RankedCandidateSchema).min(3).max(5),
  layouts: z.array(RankedCandidateSchema).min(1).max(3),
  recipes: z.array(RankedCandidateSchema).min(1).max(3),
}).strict();

export const CapabilityCandidateBundleSchema = z.object({
  schema: z.literal("kf-capability-candidates/v1"),
  knowledgeCatalogVersion: semver,
  blueprintHash: z.string().regex(/^[0-9a-f]{64}$/),
  regions: z.array(RegionCapabilityCandidatesSchema).min(1).max(96),
  detailedCapabilityIds: z.array(stableId).min(1).max(25),
  generatedAtPolicy: z.literal("deterministic-no-timestamp"),
}).strict().superRefine((bundle, ctx) => {
  const pageRegionPairs = new Set<string>();
  bundle.regions.forEach((region, regionIndex) => {
    const pair = `${region.pageId}\u0000${region.regionId}`;
    if (pageRegionPairs.has(pair)) {
      ctx.addIssue({ code: "custom", path: ["regions", regionIndex], message: "duplicate page-region pair" });
    }
    pageRegionPairs.add(pair);

    (["controls", "layouts", "recipes"] as const).forEach((category) => {
      const candidateIds = region[category].map((candidate) => candidate.id);
      if (new Set(candidateIds).size !== candidateIds.length) {
        ctx.addIssue({ code: "custom", path: ["regions", regionIndex, category], message: `duplicate ${category} candidate` });
      }
    });
  });

  const detailedIds = new Set(bundle.detailedCapabilityIds);
  if (detailedIds.size !== bundle.detailedCapabilityIds.length) {
    ctx.addIssue({ code: "custom", path: ["detailedCapabilityIds"], message: "detailed capability IDs must be unique" });
  }
  if (!isCodePointSorted(bundle.detailedCapabilityIds)) {
    ctx.addIssue({ code: "custom", path: ["detailedCapabilityIds"], message: "detailed capability IDs must be canonically sorted" });
  }
  bundle.regions.forEach((region, regionIndex) => {
    (["controls", "layouts"] as const).forEach((category) => {
      region[category].forEach((candidate, candidateIndex) => {
        if (!detailedIds.has(candidate.id)) {
          ctx.addIssue({
            code: "custom",
            path: ["regions", regionIndex, category, candidateIndex, "id"],
            message: `${category} candidates must be present in detailedCapabilityIds`,
          });
        }
      });
    });
  });
});

function isCodePointSorted(values: readonly string[]): boolean {
  return values.every((value, index) => index === 0 || values[index - 1]! <= value);
}

export type CapabilityCandidateBundle = z.infer<typeof CapabilityCandidateBundleSchema>;
export type RegionCapabilityCandidates = z.infer<typeof RegionCapabilityCandidatesSchema>;
