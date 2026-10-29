// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import "reflect-metadata";
import { readFile } from "node:fs/promises";
import { Test } from "@nestjs/testing";
import { canonicalServerHash, type DesignPlan, type SolutionImplementationPlan, type UIImplementationSpec } from "@kf/contracts";
import type { ModelPortContext } from "@kf/agent-orchestrator";
import { DeterministicFakeModelPort } from "../src/conversations/fake-model.js";
import { MODEL_PORT } from "../src/conversations/model-port.js";
import { AgentWorkerModule } from "../src/runs/run-worker.module.js";
import { startAgentWorker } from "../src/runs/agent-worker-bootstrap.js";
import { assertE2eDestructiveResetAllowed } from "../../../tests/e2e/helpers/destructive-reset.js";

// Test-only composition root. Never selected by production environment flags or imported by src/.
assertE2eDestructiveResetAllowed({ databaseUrl: process.env.DATABASE_URL, allowDestructiveReset: process.env.KF_E2E_ALLOW_DESTRUCTIVE_RESET });
const golden = JSON.parse(await readFile(new URL("../../../tests/fixtures/creative-goldens/industrial-dashboard.json", import.meta.url), "utf8")) as {
  blueprint: DesignPlan; plan: SolutionImplementationPlan;
};
class BrowserFixtureModel extends DeterministicFakeModelPort {
  override createDesignPlan(input: ModelPortContext): Promise<DesignPlan> {
    if (input.requirementText?.includes("E2E_SCHEMA_FAILURE")) return Promise.reject(new Error("Injected model fixture failure"));
    return input.generationWorkflow !== "creative-v2" ? super.createDesignPlan(input) : Promise.resolve(structuredClone(golden.blueprint));
  }
  override async createUiImplementation(input: ModelPortContext): Promise<UIImplementationSpec> {
    const spec = await super.createUiImplementation(input);
    const button = input.editableEntities?.find(entity => entity.kind === "control" && entity.name === "Button1");
    if (!button) return spec;
    return { ...spec, pages: spec.pages.map(page => ({ ...page, width: 1280, height: 720, components: [{
      id: "Button1", role: "primary-action", sourceModuleId: "main", capabilityId: "button", critical: true,
      geometry: { x: button.x!, y: button.y!, width: button.width!, height: button.height! }, properties: {},
      style: { declarations: { backgroundColor: "#ff0000" }, states: {} },
    }] })) };
  }
  override createSolutionImplementationPlan(input?: ModelPortContext): Promise<SolutionImplementationPlan> {
    if (!input) return Promise.reject(new Error("E2E model input is required"));
    return Promise.resolve({ ...structuredClone(golden.plan),
      blueprintHash: canonicalServerHash(input.confirmedSolutionBlueprint),
      candidateBundleHash: canonicalServerHash(input.capabilityCandidates),
    });
  }
  override reviseSolutionImplementationSubtree(input?: ModelPortContext): Promise<SolutionImplementationPlan> {
    return this.createSolutionImplementationPlan(input);
  }
}

await startAgentWorker(async () => {
  const app = await Test.createTestingModule({ imports: [AgentWorkerModule] })
    .overrideProvider(MODEL_PORT).useValue(new BrowserFixtureModel()).compile();
  await app.init();
  return app;
});
// end
