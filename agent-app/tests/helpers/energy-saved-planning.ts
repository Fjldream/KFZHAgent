// modified by jinlong.feng at 2026-10-26 Agent工作台迭代
import { readFileSync } from "node:fs";
import { canonicalServerHash, CustomerSolutionBlueprintSchema, VisualReferenceSpecSchema } from "../../packages/contracts/src/index.js";

/** Local test proposals only. Every consumer must obtain new server reviews and approvals; no old receipt is loaded. */
export function createSavedEnergyPlanningFixture() {
  const root = new URL("../fixtures/energy-overview-20261023/live-layout-proposal-incomplete-graph/", import.meta.url);
  const reference = JSON.parse(readFileSync(new URL("reference-review.json", root), "utf8")) as { spec: unknown };
  const spec = VisualReferenceSpecSchema.parse(reference.spec);
  if (spec.sourceHash !== "3a79f4361e1e48b80ce64b1ec4053be63b4827df1c3f42deb5c7887bd3f2488c") throw new Error("SAVED_ENERGY_SOURCE_INVALID");
  const blueprint = CustomerSolutionBlueprintSchema.parse(JSON.parse(readFileSync(new URL("blueprint.json", root), "utf8")));
  let served = 0;
  const fixtureFetch: typeof fetch = (url, init) => {
    const target = new URL(typeof url === "string" ? url : url instanceof URL ? url.href : url.url);
    if (target.href !== "https://api.deepseek.com/chat/completions" || init?.method !== "POST" || typeof init.body !== "string" || served >= 2) {
      throw new Error("SAVED_ENERGY_FIXTURE_REQUEST_INVALID");
    }
    const request = JSON.parse(init.body) as { messages?: Array<{ role?: string; content?: unknown }> };
    const messages = request.messages;
    const system = messages?.[0]?.content;
    if (!messages || typeof system !== "string") throw new Error("SAVED_ENERGY_FIXTURE_REQUEST_INVALID");
    const containsImage = JSON.stringify(messages).includes('"image_url"');
    if ((served === 0 && !containsImage) || (served === 1 && (containsImage || !system.includes("kf-design-plan/v3")))) {
      throw new Error("SAVED_ENERGY_FIXTURE_STAGE_INVALID");
    }
    const stage = served++ === 0 ? "vision" : "blueprint";
    return Promise.resolve(new Response(JSON.stringify({ model: `saved-public-${stage}-fixture`, choices: [{ finish_reason: "stop", message: {
      content: JSON.stringify(stage === "vision" ? spec : blueprint) } }], usage: { prompt_tokens: 0, completion_tokens: 0 } })));
  };
  return { fetch: fixtureFetch, fixtureRequests: () => served, publicFactsHash: canonicalServerHash({ spec, blueprint }) };
}
// end
