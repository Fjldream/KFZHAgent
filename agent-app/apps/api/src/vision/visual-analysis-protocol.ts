// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
import { canonicalServerHash, type ModelRoute } from "@kf/contracts";
import type { ModelGateway } from "../models/model-gateway.js";

/** Rotating a deployment's endpoint/model/key must not send current credentials to an old Run's frozen route. */
export function bindVisualAnalysisGateway(gateway: ModelGateway, route: ModelRoute): ModelGateway {
  const identity = canonicalServerHash(structuredClone(route));
  return { completeJson: async request => {
    if (canonicalServerHash(request.route) !== identity) throw new Error("VISUAL_ANALYSIS_CREDENTIAL_ROUTE_MISMATCH");
    return gateway.completeJson(request);
  } };
}
// end
