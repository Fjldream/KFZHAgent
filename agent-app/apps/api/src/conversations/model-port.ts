import type { ModelPort } from "@kf/agent-orchestrator";

/**
 * Injection token for the ModelPort consumed by the solution graph.
 *
 * The production LLM implementation is intentionally out of scope for
 * Task 11/12 (Phase 3): the API exposes this injection point and defaults to a
 * deterministic stub so every workflow stage stays exercisable end to end.
 * Tests override this token with a programmable FakeModelPort; a deployment
 * wires a real ModelPort here without touching the graph or controllers.
 */
export const MODEL_PORT = Symbol("MODEL_PORT");

/**
 * Raised when a default-stub capability is called that would need a real LLM
 * (planning). A deployment must provide a real ModelPort before those routes
 * are used; failing loudly beats silently fabricating a plan.
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
  reviseChangePlan() {
    return Promise.reject(new ModelPortNotConfiguredError("reviseChangePlan"));
  },
  explainValidation() {
    return Promise.resolve("（当前为演示模型）校验已通过。");
  },
};
