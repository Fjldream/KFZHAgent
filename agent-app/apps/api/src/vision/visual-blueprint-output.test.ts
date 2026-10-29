// modified by jinlong.feng at 2026-10-26 Agent工作台迭代
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { VisualPlanningContextSchema } from "@kf/contracts";
import { inspectVisualBlueprintOutput } from "./visual-blueprint-output.js";
import { createVisualPlanningRuntime } from "./visual-blueprint-runtime.js";
import type { PrismaClient } from "@prisma/client";

describe("bounded blueprint validation feedback", () => {
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  it("identifies duplicate expected-text indexes in the exact provider repair without echoing or editing its text", () => {
    const base = new URL("../../../../tests/fixtures/energy-overview-20261023/live-blueprint-duplicate-observe-20261027/", import.meta.url);
    const reference = VisualPlanningContextSchema.parse(JSON.parse(readFileSync(new URL("reference.json", base), "utf8")));
    const reply = JSON.parse(readFileSync(new URL("provider-reply.json", base), "utf8")) as { content: string };
    const raw = JSON.parse(reply.content) as { journeys: Array<{ steps: Array<{ expectedTexts: string[] }> }> };
    const before = structuredClone(raw);
    const result = inspectVisualBlueprintOutput(raw, reference);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("real duplicate fixture must stay rejected");
    const issue = result.issues.find(item => item.code === "BLUEPRINT_OBSERVATION_TEXT_DUPLICATE");
    expect(issue).toMatchObject({ path: "journeys.2.steps.0.expectedTexts", expectedTextIndexes: [4] });
    expect(JSON.stringify(issue)).not.toContain(raw.journeys[2]!.steps[0]!.expectedTexts[4]);
    expect(result.issues.some(item => item.code === "SCHEMA_custom" && item.path === issue?.path)).toBe(false);
    expect(raw).toEqual(before);
    // Only an explicitly revised proposal is accepted; the inspection never normalizes the failed draft.
    const proposal = structuredClone(raw);
    proposal.journeys[2]!.steps[0]!.expectedTexts.splice(4, 1);
    expect(inspectVisualBlueprintOutput(proposal, reference).ok).toBe(true);
  });
  // end
  it("identifies the two omitted containers in the unmodified real provider draft", () => {
    const base = new URL("../../../../tests/fixtures/energy-overview-20261023/live-blueprint-missing-source/", import.meta.url);
    const read = (name: string): unknown => JSON.parse(readFileSync(new URL(name, base), "utf8")) as unknown;
    const reference = VisualPlanningContextSchema.parse({ ...(read("reference-review.json") as Record<string, unknown>), acceptedDifferences: read("accepted-differences.json") });
    const reply = read("provider-reply.json") as { content: string };
    const raw: unknown = JSON.parse(reply.content) as unknown;
    expect(inspectVisualBlueprintOutput(raw, reference)).toEqual({ ok: false, repairable: true,
      issues: [{ code: "VISUAL_BLUEPRINT_SOURCE_MISSING", regionIds: ["root", "content"] }] });
  });
  it("assembles only explicitly bounded server repair modes and fails closed for unknown values", () => {
    const environment = { MODEL_PORT_MODE: "deepseek", DEEPSEEK_API_KEY: "fixture-key", DEEPSEEK_MODEL: "deepseek-chat",
      KF_SERVER_PLAN_HMAC_KEY_BASE64: Buffer.alloc(32, 0x48).toString("base64") };
    const unusedPrisma = {} as PrismaClient; // Assembly is pure and must not access the database.
    expect(createVisualPlanningRuntime(unusedPrisma, environment).blueprints).not.toBeNull();
    expect(createVisualPlanningRuntime(unusedPrisma, { ...environment, KF_VISUAL_BLUEPRINT_REPAIR: "once" }).blueprints).not.toBeNull();
    expect(createVisualPlanningRuntime(unusedPrisma, { ...environment, KF_VISUAL_BLUEPRINT_REPAIR: "unbounded" }).blueprints).toBeNull();
  });
});
// end
