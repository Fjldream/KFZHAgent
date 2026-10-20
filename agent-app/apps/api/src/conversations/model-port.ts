import type { ModelPort } from "@kf/agent-orchestrator";

/**
 * 解耦解决方案图中消耗的注入令牌。
 *
 * 生产 LLM 实现是故意超出任务 11/12（阶段 3）的范围（任务 3）：API 通过暴露此注入点并默认为确定性 stub，确保每个工作流阶段都能从头到尾运行测试。测试覆盖此令牌，将一个可编程的 FakeModelPort 用于替代；部署在这里不触及图或控制器，而是直接连接到实际的 ModelPort。
 */
export const MODEL_PORT = Symbol("MODEL_PORT");

/**
 * 当调用一个需要真实语言模型（LLM）的默认-ModelPort 时，部署必须在使用这些路由之前提供一个真实 ModelPort；失败比沉默地伪造计划好。
 */
export class ModelPortNotConfiguredError extends Error {
  override name = "ModelPortNotConfiguredError";
  constructor(method: string) {
    super(`ModelPort stub: ${method}() requires a real LLM (Phase 3 wiring)`);
  }
}

/**
 * Default stub. classifyIntent is safe (always a plain question that returns
 * to idle), so an unconfigured API can never enqueue a build or mutate a
 * plan by accident. Every planning entry point throws a clear error instead.
 */
export const DEFAULT_MODEL_PORT: ModelPort = {
  classifyIntent() {
    return Promise.resolve({
      intent: "QUESTION",
      requestedDomains: ["kingclient"],
      reply: "（当前为演示模型）已收到你的问题，请继续描述需求。",
    });
  },
  createProjectDesign() {
    return Promise.reject(new ModelPortNotConfiguredError("createProjectDesign"));
  },
  createChangePlan() {
    return Promise.reject(new ModelPortNotConfiguredError("createChangePlan"));
  },
  createDesignPlan() {
    return Promise.reject(new ModelPortNotConfiguredError("createDesignPlan"));
  },
  createUiImplementation() {
    return Promise.reject(new ModelPortNotConfiguredError("createUiImplementation"));
  },
  reviseUiImplementation() {
    return Promise.reject(new ModelPortNotConfiguredError("reviseUiImplementation"));
  },
  createModulePlan() {
    return Promise.reject(new ModelPortNotConfiguredError("createModulePlan"));
  },
  reviseModulePlan() {
    return Promise.reject(new ModelPortNotConfiguredError("reviseModulePlan"));
  },
  createSolutionImplementationPlan() {
    return Promise.reject(new ModelPortNotConfiguredError("createSolutionImplementationPlan"));
  },
  reviseSolutionImplementationSubtree() {
    return Promise.reject(new ModelPortNotConfiguredError("reviseSolutionImplementationSubtree"));
  },
  reviseChangePlan() {
    return Promise.reject(new ModelPortNotConfiguredError("reviseChangePlan"));
  },
  explainValidation() {
    return Promise.resolve("（当前为演示模型）校验已通过。");
  },
};
