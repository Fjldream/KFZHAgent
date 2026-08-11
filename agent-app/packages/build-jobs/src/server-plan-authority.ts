import type {
  ChangePlan,
  ServerPlanEnvelope,
  ServerPlanEnvelopeExpectations,
  TrustedSemanticOperationInput,
} from "@kf/contracts";
import {
  canonicalChangePlanHash,
  canonicalServerPlanSigningBytes,
  ServerPlanEnvelopeSchema,
  validateServerPlanEnvelopeData,
} from "@kf/contracts";
import { createHmac, timingSafeEqual } from "node:crypto";

export interface ServerPlanSignInput {
  plan: ChangePlan;
  revisionId: string;
  semanticOperations: readonly TrustedSemanticOperationInput[];
}

export interface ServerPlanAuthority {
  sign(input: ServerPlanSignInput): ServerPlanEnvelope;
  verify(input: unknown, expected?: ServerPlanEnvelopeExpectations): ServerPlanEnvelope;
}

export function decodeServerPlanHmacKey(raw: string | undefined): Uint8Array {
  if (raw === undefined || raw === "" || raw.trim() !== raw
    || raw.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) {
    throw new Error("server plan HMAC key must be canonical base64");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length < 32 || key.toString("base64") !== raw) {
    throw new Error("server plan HMAC key must decode to at least 32 bytes");
  }
  return key;
}

export function createHmacServerPlanAuthority(key: Uint8Array): ServerPlanAuthority {
  if (key.byteLength < 32) throw new Error("server plan HMAC key must contain at least 32 bytes");
  const ownedKey = Buffer.from(key);
  const digest = (envelope: ServerPlanEnvelope): Buffer => createHmac("sha256", ownedKey)
    .update(canonicalServerPlanSigningBytes(envelope))
    .digest();

  return Object.freeze({
    sign(input: ServerPlanSignInput): ServerPlanEnvelope {
      const unsigned = ServerPlanEnvelopeSchema.parse({
        schema: "kf-server-plan-envelope/v1",
        plan: input.plan,
        planHash: canonicalChangePlanHash(input.plan),
        revisionId: input.revisionId,
        semanticOperations: input.semanticOperations,
        signature: "0".repeat(64),
      });
      validateServerPlanEnvelopeData(unsigned);
      return { ...unsigned, signature: digest(unsigned).toString("hex") };
    },
    verify(input: unknown, expected: ServerPlanEnvelopeExpectations = {}): ServerPlanEnvelope {
      const parsed = ServerPlanEnvelopeSchema.safeParse(input);
      if (!parsed.success) {
        throw new Error(`SERVER_PLAN_SCHEMA_INVALID: ${parsed.error.issues[0]?.message ?? "invalid envelope"}`);
      }
      const supplied = Buffer.from(parsed.data.signature, "hex");
      const wanted = digest(parsed.data);
      if (supplied.length !== wanted.length || !timingSafeEqual(supplied, wanted)) {
        throw new Error("SERVER_PLAN_SIGNATURE_INVALID");
      }
      return validateServerPlanEnvelopeData(parsed.data, expected);
    },
  });
}
