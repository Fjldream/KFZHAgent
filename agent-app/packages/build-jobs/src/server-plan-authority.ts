import type {
  ChangePlan,
  ServerPlanEnvelope,
  ServerPlanEnvelopeExpectations,
  TrustedSemanticOperationInput,
} from "@kf/contracts";
import {
  canonicalAcceptedBlueprintArtifactSigningBytes,
  canonicalModuleCompilationHash,
  canonicalModuleCompilationArtifactSigningBytes,
  canonicalProjectCreationSeedArtifactSigningBytes,
  parseAcceptedBlueprintArtifactData,
  parseModuleCompilationArtifactData,
  parseProjectCreationSeedArtifactData,
  ProjectCreationSeedArtifactSchema,
  UIComponentSpecSchema,
  type AcceptedBlueprintArtifact,
  type ModuleCompilationArtifact,
  type ProjectCreationSeedArtifact,
  type UIComponentSpec,
} from "@kf/contracts";
import {
  canonicalChangePlanHash,
  canonicalServerPlanSigningBytes,
  parseServerPlanEnvelopeData,
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

export interface ProjectCreationSeedArtifactExpectations {
  readonly projectKey?: string;
  readonly revisionId?: string;
}

declare const verifiedAcceptedBlueprintBrand: unique symbol;
declare const verifiedModuleCompilationBrand: unique symbol;
declare const verifiedProjectCreationSeedBrand: unique symbol;
export type VerifiedAcceptedBlueprintArtifact = Readonly<{ readonly [verifiedAcceptedBlueprintBrand]: true }>;
export type VerifiedModuleCompilationArtifact = Readonly<{ readonly [verifiedModuleCompilationBrand]: true }>;
export type VerifiedProjectCreationSeedArtifact = Readonly<{ readonly [verifiedProjectCreationSeedBrand]: true }>;

export interface ProjectCreationSeedSignInput {
  readonly projectKey: string;
  readonly revisionId: string;
  readonly seeds: readonly {
    readonly pageId: string;
    readonly component: UIComponentSpec;
    readonly generator: "new-project";
    readonly projectCreationMarker: string;
  }[];
}

export interface ModuleArtifactAuthority {
  signModuleCompilation(input: Omit<ModuleCompilationArtifact, "signature">): ModuleCompilationArtifact;
  verifyModuleCompilation(input: unknown, expected?: ModuleCompilationArtifactExpectations): VerifiedModuleCompilationArtifact;
  signAcceptedBlueprint(input: Omit<AcceptedBlueprintArtifact, "signature">): AcceptedBlueprintArtifact;
  verifyAcceptedBlueprint(input: unknown, expected?: AcceptedBlueprintArtifactExpectations): VerifiedAcceptedBlueprintArtifact;
  signProjectCreationSeeds(input: ProjectCreationSeedSignInput): ProjectCreationSeedArtifact;
  verifyProjectCreationSeeds(input: unknown, expected?: ProjectCreationSeedArtifactExpectations): VerifiedProjectCreationSeedArtifact;
}

const acceptedBlueprintPayloads = new WeakMap<object, AcceptedBlueprintArtifact>();
const moduleCompilationPayloads = new WeakMap<object, ModuleCompilationArtifact>();
const projectCreationSeedPayloads = new WeakMap<object, ProjectCreationSeedArtifact>();

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

export function readVerifiedProjectCreationSeedArtifact(input: unknown): ProjectCreationSeedArtifact {
  const payload = input !== null && typeof input === "object" ? projectCreationSeedPayloads.get(input) : undefined;
  if (payload === undefined) throw new Error("UNVERIFIED_PROJECT_CREATION_SEED_ARTIFACT");
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
    signProjectCreationSeeds(input: ProjectCreationSeedSignInput): ProjectCreationSeedArtifact {
      const seeds = input.seeds.map((seed) => {
        const component = UIComponentSpecSchema.parse(seed.component);
        return {
          pageId: seed.pageId, entityId: component.id, generator: seed.generator,
          schema: "kf-seed/v1" as const,
          componentHash: `sha256:${canonicalModuleCompilationHash(component)}`,
          projectCreationMarker: seed.projectCreationMarker,
        };
      }).sort((left, right) => compareCodePoints(`${left.pageId}\u0000${left.entityId}`, `${right.pageId}\u0000${right.entityId}`));
      const unsigned = ProjectCreationSeedArtifactSchema.parse({
        schema: "kf-project-creation-seed-artifact/v1", projectKey: input.projectKey,
        revisionId: input.revisionId, seeds, signature: "0".repeat(64),
      });
      return { ...unsigned, signature: digest("kf-authority/project-creation-seed/v1", canonicalProjectCreationSeedArtifactSigningBytes(unsigned)).toString("hex") };
    },
    verifyProjectCreationSeeds(input: unknown, expected: ProjectCreationSeedArtifactExpectations = {}): VerifiedProjectCreationSeedArtifact {
      const parsed = parseProjectCreationSeedArtifactData(input);
      verifyDigest(parsed.signature, digest("kf-authority/project-creation-seed/v1", canonicalProjectCreationSeedArtifactSigningBytes(parsed)), "PROJECT_CREATION_SEED_ARTIFACT_SIGNATURE_INVALID");
      if (expected.projectKey !== undefined && parsed.projectKey !== expected.projectKey) throw new Error("PROJECT_CREATION_SEED_ARTIFACT_BINDING_MISMATCH");
      if (expected.revisionId !== undefined && parsed.revisionId !== expected.revisionId) throw new Error("PROJECT_CREATION_SEED_ARTIFACT_BINDING_MISMATCH");
      return brand(projectCreationSeedPayloads, parsed) as VerifiedProjectCreationSeedArtifact;
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

function compareCodePoints(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }

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
