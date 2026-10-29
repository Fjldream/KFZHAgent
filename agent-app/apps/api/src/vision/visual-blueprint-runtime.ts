// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
import type { PrismaClient } from "@prisma/client";
import type { ModelPort } from "@kf/agent-orchestrator";
import { canonicalServerHash, type ModelRoute } from "@kf/contracts";
import { decodeServerPlanHmacKey } from "@kf/build-jobs";
import { ModelGatewayService, type ModelGateway } from "../models/model-gateway.js";
import { ModelInvocationService } from "../models/model-invocation.service.js";
import { resolveModelRoutes } from "../models/model-config.js";
import { freezeVisualBlueprintModel } from "./visual-blueprint-request.js";
import { VisualBlueprintService } from "./visual-blueprint.service.js";
import { VisualReviewService } from "./visual-review.service.js";
import { VisualSemanticService } from "./visual-semantic.service.js";
import { freezeVisualSemanticModel } from "./visual-semantic-request.js";

export const VISUAL_PLANNING_RUNTIME = Symbol("VISUAL_PLANNING_RUNTIME");
export type VisualPlanningRuntime = { reviews: VisualReviewService | null; blueprints: VisualBlueprintService | null; semantics: VisualSemanticService | null };

/** The semantic task must never inherit credentials for a different frozen host/model. */
export function bindVisualSemanticGateway(gateway: ModelGateway, route: ModelRoute): ModelGateway {
  const identity = canonicalServerHash(structuredClone(route));
  return { completeJson: async request => {
    if (canonicalServerHash(request.route) !== identity) throw new Error("VISUAL_SEMANTIC_CREDENTIAL_ROUTE_MISMATCH");
    return gateway.completeJson(request);
  } };
}

/** Credentials belong to this exact server route. Old Runs cannot send them to a different frozen host/model. */
export function bindVisualBlueprintGateway(gateway: ModelGateway, route: ModelRoute): ModelGateway {
  const identity = canonicalServerHash(structuredClone(route));
  return { completeJson: async request => {
    if (canonicalServerHash(request.route) !== identity) throw new Error("VISUAL_BLUEPRINT_CREDENTIAL_ROUTE_MISMATCH");
    return gateway.completeJson(request);
  } };
}

/** Composition preserves class private receivers; it does not mutate existing text adapters or change their routes. */
export function composeVisualBlueprintModel(base: ModelPort, visual: Pick<VisualBlueprintService, "createVisualDesignPlan"> | null,
  semantic?: Pick<VisualSemanticService, "createVisualSolutionImplementationPlan"> | null): ModelPort {
  if (!visual && semantic === undefined) return base;
  return new Proxy(base, { get(target, property, receiver) {
    if (property === "createVisualDesignPlan" && visual) return visual.createVisualDesignPlan.bind(visual);
    if (property === "createVisualSolutionImplementationPlan" && semantic !== undefined) return semantic?.createVisualSolutionImplementationPlan.bind(semantic);
    const value: unknown = Reflect.get(target, property, receiver);
    return typeof value === "function" ? value.bind(target) as unknown : value;
  } });
}

/** Pure assembly only; never sends a request, enables rollout, mutates env or starts a worker. */
export function createVisualPlanningRuntime(prisma: PrismaClient, env: Record<string, string | undefined>, fetchImpl: typeof fetch = fetch): VisualPlanningRuntime {
  let key: Uint8Array;
  try { key = decodeServerPlanHmacKey(env.KF_SERVER_PLAN_HMAC_KEY_BASE64); }
  catch { return { reviews: null, blueprints: null, semantics: null }; }
  const apiKey = env.DEEPSEEK_API_KEY?.trim();
  if (env.MODEL_PORT_MODE !== "deepseek" || !apiKey) return { reviews: new VisualReviewService(prisma, key), blueprints: null, semantics: null };
  const routes = resolveModelRoutes(env); const route = routes.blueprint;
  // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
  const repairPolicy = env.KF_VISUAL_BLUEPRINT_REPAIR ?? "none";
  try { if (repairPolicy !== "none" && repairPolicy !== "once") throw new Error("invalid repair policy"); freezeVisualBlueprintModel(route, repairPolicy); }
  // end
  catch { return { reviews: new VisualReviewService(prisma, key), blueprints: null, semantics: null }; }
  let implementation: ModelRoute | undefined;
  // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
  const semanticRepairPolicy = env.KF_VISUAL_SEMANTIC_REPAIR ?? "none";
  try {
    if (semanticRepairPolicy !== "none" && semanticRepairPolicy !== "once") throw new Error("invalid semantic repair policy");
    freezeVisualSemanticModel(routes.implementation, semanticRepairPolicy); implementation = routes.implementation;
  }
  // end
  catch { /* Preserve text/blueprint availability without exposing an unfrozen semantic model. */ }
  // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
  const reviews = new VisualReviewService(prisma, key, { blueprint: route, blueprintRepairPolicy: repairPolicy,
    ...(implementation && (semanticRepairPolicy === "none" || semanticRepairPolicy === "once") ? { implementation, semanticRepairPolicy } : {}) });
  // end
  const gateway = bindVisualBlueprintGateway(new ModelGatewayService(new ModelInvocationService(prisma), fetchImpl, apiKey), route);
  // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
  return { reviews, blueprints: new VisualBlueprintService(prisma, reviews, gateway, { allowRepair: repairPolicy === "once" }), semantics: implementation
    ? new VisualSemanticService(prisma, reviews, bindVisualSemanticGateway(new ModelGatewayService(new ModelInvocationService(prisma), fetchImpl, apiKey), implementation),
      { allowRepair: semanticRepairPolicy === "once" }) : null };
  // end
}
// end
