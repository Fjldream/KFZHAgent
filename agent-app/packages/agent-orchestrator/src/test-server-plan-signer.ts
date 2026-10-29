import {
  ServerPlanEnvelopeSchema,
  canonicalChangePlanHash,
} from "@kf/contracts";
import type { ServerPlanSignerPort } from "./ports.js";

/** 仅用于测试的结构签名；加密行为在@kf/build-jobs中测试。 */
export const TEST_SERVER_PLAN_SIGNER: ServerPlanSignerPort = Object.freeze({
  sign(input: Parameters<ServerPlanSignerPort["sign"]>[0]) {
    return ServerPlanEnvelopeSchema.parse({
      schema: "kf-server-plan-envelope/v1",
      plan: input.plan,
      planHash: canonicalChangePlanHash(input.plan),
      revisionId: input.revisionId,
      semanticOperations: input.semanticOperations,
      signature: "a".repeat(64),
    });
  },
});
