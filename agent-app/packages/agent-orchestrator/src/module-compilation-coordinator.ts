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
  /** 从AgentGraphState/checkpoint加载的JSON，从不涉及运行时品牌。 */
  readonly acceptedBlueprintArtifact: AcceptedBlueprintArtifact;
  readonly plan: ModulePlan;
  readonly workspaceId: string;
  readonly editableEntities: readonly EditableEntity[];
  readonly previousPlan?: ModulePlan;
  readonly previousImplementation?: UIImplementationSpec;
  /** 从前一个检查点加载的JSON，经过验证后再使用。 */
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
      /** 持久化在 AgentGraphState 中的签名 JSON。绝不包含 HMAC 密钥。 */
      moduleCompilationArtifact: ModuleCompilationArtifact;
      uiCompilation: Awaited<ReturnType<UiImplementationCompilerPort["compile"]>>;
    }>;

/**
 * 任务 10 模块节点的具体服务器服务。它特意不要求编译前已有当前制品：确定性编译器生成未签名候选项，服务器为其签名，像检查点一样对其进行 JSON 往返，将其重新校验为运行时品牌，然后把已校验的当前制品交给 UI 编译器。
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
