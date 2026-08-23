import type {
  InternalChangePlan,
  ServerPlanEnvelope,
  ServerPlanEnvelopeExpectations,
  TrustedSemanticOperationInput,
  CreativeBuildArtifact,
  TrustedNativeMaterialization,
} from "@kf/contracts";
import {
  canonicalAcceptedBlueprintArtifactSigningBytes,
  canonicalModuleCompilationArtifactSigningBytes,
  parseAcceptedBlueprintArtifactData,
  parseModuleCompilationArtifactData,
  type AcceptedBlueprintArtifact,
  type ModuleCompilationArtifact,
} from "@kf/contracts";
import {
  canonicalChangePlanHash,
  CreativeBuildArtifactSchema,
  canonicalCreativeBuildArtifactHash,
  canonicalTrustedNativeMaterializationHash,
  validateCreativeArtifactMaterializationProjection,
  internalChangePlanSchema,
  validateCreativePlanMaterializationProjection,
  canonicalServerPlanSigningBytes,
  parseServerPlanEnvelopeData,
  ServerPlanEnvelopeSchema,
  validateServerPlanEnvelopeData,
} from "@kf/contracts";
import { createHmac, timingSafeEqual } from "node:crypto";

export interface ServerPlanSignInput {
  plan: InternalChangePlan;
  revisionId: string;
  semanticOperations: readonly TrustedSemanticOperationInput[];
  creative?: TrustedCreativePayloadHandle;
}

declare const trustedCreativePayloadBrand: unique symbol;
export interface TrustedCreativePayloadHandle { readonly [trustedCreativePayloadBrand]: true }
const creativePayloads = new WeakMap<object, Readonly<{ planHash: string; artifact: CreativeBuildArtifact; materialization: TrustedNativeMaterialization }>>();

/** Server-only brand issued after the complete plan/artifact/materialization projection is verified. */
export function createTrustedCreativePayload(input: {
  readonly plan: InternalChangePlan;
  readonly artifact: CreativeBuildArtifact;
  readonly materialization: TrustedNativeMaterialization;
}): TrustedCreativePayloadHandle {
  const plan = internalChangePlanSchema.parse(input.plan);
  const artifact = deepFreeze(CreativeBuildArtifactSchema.parse(input.artifact));
  const materialization = deepFreeze(validateCreativeArtifactMaterializationProjection(artifact, input.materialization));
  const artifactHash = canonicalCreativeBuildArtifactHash(artifact);
  const materializationHash = canonicalTrustedNativeMaterializationHash(materialization);
  const planHash = canonicalChangePlanHash(plan);
  if (plan.creative?.artifactHash !== artifactHash || plan.creative.materializationHash !== materializationHash) {
    throw new Error("CREATIVE_PLAN_BINDING_MISMATCH");
  }
  validateCreativePlanMaterializationProjection(plan, materialization);
  const handle = Object.freeze(Object.create(null)) as TrustedCreativePayloadHandle;
  creativePayloads.set(handle, Object.freeze({ planHash, artifact, materialization }));
  return handle;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Reflect.ownKeys(value).forEach((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor !== undefined && "value" in descriptor) deepFreeze(descriptor.value);
    });
    Object.freeze(value);
  }
  return value;
}

export interface ServerPlanAuthority {
  sign(input: ServerPlanSignInput): ServerPlanEnvelope;
  verify(input: unknown, expected?: ServerPlanEnvelopeExpectations): ServerPlanEnvelope;
}

/** Same server HMAC key, with discriminator-prefixed bytes to prevent cross-artifact replay. */
export interface AcceptedBlueprintArtifactExpectations {
  readonly projectKey?: string;
  readonly revisionId?: string;
  readonly blueprintHash?: string;
}

export interface ModuleCompilationArtifactExpectations {
  readonly projectKey?: string;
  readonly revisionId?: string;
  readonly acceptedBlueprintHash?: string;
  readonly planHash?: string;
  readonly implementationHash?: string;
}

declare const verifiedAcceptedBlueprintBrand: unique symbol;
declare const verifiedModuleCompilationBrand: unique symbol;
export type VerifiedAcceptedBlueprintArtifact = Readonly<{ readonly [verifiedAcceptedBlueprintBrand]: true }>;
export type VerifiedModuleCompilationArtifact = Readonly<{ readonly [verifiedModuleCompilationBrand]: true }>;
export interface ModuleArtifactAuthority {
  signModuleCompilation(input: Omit<ModuleCompilationArtifact, "signature">): ModuleCompilationArtifact;
  verifyModuleCompilation(input: unknown, expected?: ModuleCompilationArtifactExpectations): VerifiedModuleCompilationArtifact;
  signAcceptedBlueprint(input: Omit<AcceptedBlueprintArtifact, "signature">): AcceptedBlueprintArtifact;
  verifyAcceptedBlueprint(input: unknown, expected?: AcceptedBlueprintArtifactExpectations): VerifiedAcceptedBlueprintArtifact;
}

const acceptedBlueprintPayloads = new WeakMap<object, AcceptedBlueprintArtifact>();
const moduleCompilationPayloads = new WeakMap<object, ModuleCompilationArtifact>();

export function readVerifiedAcceptedBlueprintArtifact(input: unknown): AcceptedBlueprintArtifact {
  const payload = input !== null && typeof input === "object" ? acceptedBlueprintPayloads.get(input) : undefined;
  if (payload === undefined) throw new Error("UNVERIFIED_ACCEPTED_BLUEPRINT_ARTIFACT");
  return payload;
}

export function readVerifiedModuleCompilationArtifact(input: unknown): ModuleCompilationArtifact {
  const payload = input !== null && typeof input === "object" ? moduleCompilationPayloads.get(input) : undefined;
  if (payload === undefined) throw new Error("UNVERIFIED_MODULE_COMPILATION_ARTIFACT");
  return payload;
}

export function createHmacModuleArtifactAuthority(key: Uint8Array): ModuleArtifactAuthority {
  if (key.byteLength < 32) throw new Error("server plan HMAC key must contain at least 32 bytes");
  const ownedKey = Buffer.from(key);
  const digest = (domain: string, bytes: Uint8Array) => createHmac("sha256", ownedKey).update(domain, "utf8").update("\0", "utf8").update(bytes).digest();
  return Object.freeze({
    signModuleCompilation(input: Omit<ModuleCompilationArtifact, "signature">): ModuleCompilationArtifact {
      const unsigned = parseModuleCompilationArtifactData({ ...input, signature: "0".repeat(64) });
      return { ...unsigned, signature: digest("kf-authority/module-compilation/v1", canonicalModuleCompilationArtifactSigningBytes(unsigned)).toString("hex") };
    },
    verifyModuleCompilation(input: unknown, expected: ModuleCompilationArtifactExpectations = {}): VerifiedModuleCompilationArtifact {
      const parsed = parseModuleCompilationArtifactData(input);
      verifyDigest(parsed.signature, digest("kf-authority/module-compilation/v1", canonicalModuleCompilationArtifactSigningBytes(parsed)), "MODULE_ARTIFACT_SIGNATURE_INVALID");
      assertModuleCompilationBindings(parsed, expected);
      return brand(moduleCompilationPayloads, parsed) as VerifiedModuleCompilationArtifact;
    },
    signAcceptedBlueprint(input: Omit<AcceptedBlueprintArtifact, "signature">): AcceptedBlueprintArtifact {
      const unsigned = parseAcceptedBlueprintArtifactData({ ...input, signature: "0".repeat(64) });
      return { ...unsigned, signature: digest("kf-authority/accepted-blueprint/v1", canonicalAcceptedBlueprintArtifactSigningBytes(unsigned)).toString("hex") };
    },
    verifyAcceptedBlueprint(input: unknown, expected: AcceptedBlueprintArtifactExpectations = {}): VerifiedAcceptedBlueprintArtifact {
      const parsed = parseAcceptedBlueprintArtifactData(input);
      verifyDigest(parsed.signature, digest("kf-authority/accepted-blueprint/v1", canonicalAcceptedBlueprintArtifactSigningBytes(parsed)), "ACCEPTED_BLUEPRINT_SIGNATURE_INVALID");
      assertAcceptedBlueprintBindings(parsed, expected);
      return brand(acceptedBlueprintPayloads, parsed) as VerifiedAcceptedBlueprintArtifact;
    },
  });
}

function verifyDigest(suppliedHex: string, wanted: Buffer, code: string): void {
  const supplied = Buffer.from(suppliedHex, "hex");
  if (supplied.length !== wanted.length || !timingSafeEqual(supplied, wanted)) throw new Error(code);
}

function brand<T extends object>(store: WeakMap<object, T>, payload: T): object {
  deepFreezeJson(payload);
  const handle = Object.freeze(Object.create(null) as object);
  store.set(handle, payload);
  return handle;
}

function deepFreezeJson(root: object): void {
  const pending: object[] = [root]; const seen = new Set<object>();
  while (pending.length > 0) {
    const value = pending.pop()!; if (seen.has(value)) continue; seen.add(value);
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      const nested: unknown = descriptor !== undefined && "value" in descriptor ? descriptor.value : undefined;
      if (nested !== null && typeof nested === "object") pending.push(nested);
    }
    Object.freeze(value);
  }
}

function assertAcceptedBlueprintBindings(parsed: AcceptedBlueprintArtifact, expected: AcceptedBlueprintArtifactExpectations): void {
  if (expected.projectKey !== undefined && parsed.projectKey !== expected.projectKey) throw new Error("ACCEPTED_BLUEPRINT_BINDING_MISMATCH");
  if (expected.revisionId !== undefined && parsed.revisionId !== expected.revisionId) throw new Error("ACCEPTED_BLUEPRINT_BINDING_MISMATCH");
  if (expected.blueprintHash !== undefined && parsed.blueprintHash !== expected.blueprintHash) throw new Error("ACCEPTED_BLUEPRINT_BINDING_MISMATCH");
}

function assertModuleCompilationBindings(parsed: ModuleCompilationArtifact, expected: ModuleCompilationArtifactExpectations): void {
  if (expected.projectKey !== undefined && parsed.projectKey !== expected.projectKey) throw new Error("MODULE_ARTIFACT_BINDING_MISMATCH");
  if (expected.revisionId !== undefined && parsed.revisionId !== expected.revisionId) throw new Error("MODULE_ARTIFACT_BINDING_MISMATCH");
  if (expected.acceptedBlueprintHash !== undefined && parsed.acceptedBlueprintHash !== expected.acceptedBlueprintHash) throw new Error("MODULE_ARTIFACT_BINDING_MISMATCH");
  if (expected.planHash !== undefined && parsed.planHash !== expected.planHash) throw new Error("MODULE_ARTIFACT_BINDING_MISMATCH");
  if (expected.implementationHash !== undefined && parsed.implementationHash !== expected.implementationHash) throw new Error("MODULE_ARTIFACT_BINDING_MISMATCH");
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
      const creative = input.creative === undefined ? undefined : creativePayloads.get(input.creative);
      if (input.creative !== undefined && creative === undefined) throw new Error("UNTRUSTED_CREATIVE_PAYLOAD");
      if (creative !== undefined && creative.planHash !== canonicalChangePlanHash(input.plan)) throw new Error("CREATIVE_PLAN_BINDING_MISMATCH");
      const unsigned = ServerPlanEnvelopeSchema.parse({
        schema: "kf-server-plan-envelope/v1",
        plan: input.plan,
        planHash: canonicalChangePlanHash(input.plan),
        revisionId: input.revisionId,
        semanticOperations: input.semanticOperations,
        ...(creative === undefined ? {} : {
          creativeArtifact: creative.artifact,
          creativeArtifactHash: canonicalCreativeBuildArtifactHash(creative.artifact),
          trustedNativeMaterialization: creative.materialization,
          nativeMaterializationHash: canonicalTrustedNativeMaterializationHash(creative.materialization),
        }),
        signature: "0".repeat(64),
      });
      validateServerPlanEnvelopeData(unsigned);
      return { ...unsigned, signature: digest(unsigned).toString("hex") };
    },
    verify(input: unknown, expected: ServerPlanEnvelopeExpectations = {}): ServerPlanEnvelope {
      const parsed = parseServerPlanEnvelopeData(input);
      const supplied = Buffer.from(parsed.signature, "hex");
      const wanted = digest(parsed);
      if (supplied.length !== wanted.length || !timingSafeEqual(supplied, wanted)) {
        throw new Error("SERVER_PLAN_SIGNATURE_INVALID");
      }
      return validateServerPlanEnvelopeData(parsed, expected);
    },
  });
}
