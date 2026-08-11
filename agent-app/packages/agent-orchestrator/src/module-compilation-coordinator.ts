import {
  canonicalModuleCompilationHash,
  type AcceptedBlueprintArtifact,
  type ModuleCompilationArtifact,
  type ModulePlan,
  type UIImplementationSpec,
} from "@kf/contracts";
import {
  type ModuleArtifactAuthority,
} from "@kf/build-jobs";
import type {
  EditableEntity,
  ModulePlanCompilerPort,
  UiImplementationCompilerPort,
} from "./ports.js";

export interface CoordinateModuleCompilationInput {
  readonly tenantId: string;
  readonly projectKey: string;
  readonly revisionId: string;
  readonly acceptedBlueprintHash: string;
  /** JSON loaded from AgentGraphState/checkpoint, never a runtime brand. */
  readonly acceptedBlueprintArtifact: AcceptedBlueprintArtifact;
  readonly plan: ModulePlan;
  readonly workspaceId: string;
  readonly editableEntities: readonly EditableEntity[];
  readonly previousPlan?: ModulePlan;
  readonly previousImplementation?: UIImplementationSpec;
  /** JSON loaded from the preceding checkpoint; verified again before use. */
  readonly previousCompilationArtifact?: ModuleCompilationArtifact;
}

export type CoordinatedModuleCompilation =
  | Readonly<{
      status: "blocked";
      outcome: Extract<Awaited<ReturnType<ModulePlanCompilerPort["compile"]>>, { status: "blocked" }>;
    }>
  | Readonly<{
      status: "compiled";
      outcome: Extract<Awaited<ReturnType<ModulePlanCompilerPort["compile"]>>, { status: "compiled" }>;
      /** Signed JSON persisted in AgentGraphState. Never contains the HMAC key. */
      moduleCompilationArtifact: ModuleCompilationArtifact;
      uiCompilation: Awaited<ReturnType<UiImplementationCompilerPort["compile"]>>;
    }>;

/**
 * Concrete server service for Task 10's module node. It intentionally does not
 * require a current artifact before compilation: the deterministic compiler
 * emits an unsigned candidate, the server signs it, JSON-roundtrips it as a
 * checkpoint would, verifies it back into a runtime brand, then hands that
 * verified current artifact to the UI compiler.
 */
export class ModuleCompilationCoordinator {
  constructor(
    private readonly authority: ModuleArtifactAuthority,
    private readonly moduleCompiler: ModulePlanCompilerPort,
    private readonly uiCompiler: UiImplementationCompilerPort,
  ) {}

  async compile(input: CoordinateModuleCompilationInput): Promise<CoordinatedModuleCompilation> {
    const accepted = this.authority.verifyAcceptedBlueprint(jsonRoundTrip(input.acceptedBlueprintArtifact), {
      projectKey: input.projectKey,
      revisionId: input.revisionId,
      blueprintHash: input.acceptedBlueprintHash,
    });
    const previous = input.previousCompilationArtifact === undefined
      ? undefined
      : this.authority.verifyModuleCompilation(jsonRoundTrip(input.previousCompilationArtifact), {
          projectKey: input.projectKey,
          ...(input.previousPlan === undefined ? {} : { planHash: canonicalModuleCompilationHash(input.previousPlan) }),
          ...(input.previousImplementation === undefined ? {} : { implementationHash: canonicalModuleCompilationHash(input.previousImplementation) }),
        });
    const outcome = await this.moduleCompiler.compile({
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      plan: input.plan,
      acceptedBlueprintArtifact: accepted,
      ...(previous === undefined ? {} : { previousCompilationArtifact: previous }),
      ...(input.previousPlan === undefined ? {} : { previousPlan: input.previousPlan }),
      ...(input.previousImplementation === undefined ? {} : { previousImplementation: input.previousImplementation }),
    });
    if (outcome.status === "blocked") return Object.freeze({ status: "blocked", outcome });

    const signed = this.authority.signModuleCompilation(outcome.artifactCandidate);
    const persisted = jsonRoundTrip(signed);
    const current = this.authority.verifyModuleCompilation(persisted, {
      projectKey: input.projectKey,
      revisionId: input.revisionId,
      acceptedBlueprintHash: input.acceptedBlueprintHash,
      planHash: canonicalModuleCompilationHash(input.plan),
      implementationHash: canonicalModuleCompilationHash(outcome.implementation),
    });
    const uiCompilation = await this.uiCompiler.compile({
      workspaceId: input.workspaceId,
      spec: outcome.implementation,
      moduleCompilationArtifact: current,
      ...(input.previousImplementation === undefined ? {} : { previousSpec: input.previousImplementation }),
      editableEntities: [...input.editableEntities],
    });
    return Object.freeze({ status: "compiled", outcome, moduleCompilationArtifact: persisted, uiCompilation });
  }
}

function jsonRoundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
