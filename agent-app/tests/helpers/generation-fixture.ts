// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
import { readFile } from "node:fs/promises";
import { CustomerSolutionBlueprintSchema, SolutionImplementationPlanSchema, canonicalServerHash } from "../../packages/contracts/src/index.js";
import { createHmacCreativeBuildFacade } from "../../packages/build-jobs/src/index.js";
import { attachRuntimeCorrelation, compileInteractions, compileSolutionImplementation, createCreativeUIImplementationV2Compiler,
  createDefaultModuleRegistry, getDesignKnowledgeSnapshot, retrieveCapabilities } from "../../packages/domain-client/src/index.js";

/** Real semantic/layout/interaction/signing pipeline; fixture inputs only, no external service. */
export async function generationFixture(workspaceId = "snapshot-workspace", baseRevisionId = "snapshot-base") {
  const raw = JSON.parse(await readFile(new URL("../fixtures/creative-goldens/management-admin.json", import.meta.url), "utf8")) as { blueprint: unknown; plan: Record<string, unknown> };
  const blueprint = CustomerSolutionBlueprintSchema.parse(raw.blueprint);
  const candidateBundle = retrieveCapabilities({ blueprint, knowledge: getDesignKnowledgeSnapshot() });
  const plan = SolutionImplementationPlanSchema.parse({ ...raw.plan,
    blueprintHash: canonicalServerHash(blueprint), candidateBundleHash: canonicalServerHash(candidateBundle) });
  const implementation = compileSolutionImplementation({ plan, candidateBundle, approvedAssets: [],
    moduleRegistry: createDefaultModuleRegistry(), activeCatalogVersion: candidateBundle.knowledgeCatalogVersion });
  const correlated = attachRuntimeCorrelation({ workspaceId, baseRevisionId, implementation, semanticStateIds: plan.localState.map(state => state.id) });
  const interactions = compileInteractions({ blueprint, plan, implementation: correlated });
  const facade = createHmacCreativeBuildFacade(Buffer.alloc(32, 0x68), createCreativeUIImplementationV2Compiler);
  const result = facade.compiler.compiler.compile({ workspaceId, baseRevisionId, blueprint, candidateBundle, semanticPlan: plan,
    implementation: interactions.implementation, compilerVersion: "1.0.0", evidenceVersion: "1.0.0" });
  const envelope = facade.authority.sign({ plan: result.plan, revisionId: baseRevisionId,
    semanticOperations: result.semanticOperations, creative: result.trustedCreativePayload });
  return { ...result, envelope };
}
// end
