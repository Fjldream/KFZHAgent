import { describe, expect, it } from "vitest";
import {
  SERVER_PLAN_RAW_LIMITS,
  canonicalChangePlanHash,
  canonicalModuleCompilationHash,
  semanticPayloadHash,
  type ChangePlan,
  type InternalChangePlan,
} from "@kf/contracts";
import {
  createHmacModuleArtifactAuthority,
  createHmacServerPlanAuthority,
  decodeServerPlanHmacKey,
  readVerifiedAcceptedBlueprintArtifact,
  readVerifiedModuleCompilationArtifact,
} from "./server-plan-authority.js";
import * as moduleAuthorityExports from "./server-plan-authority.js";

const keyA = Buffer.alloc(32, 0x41).toString("base64");
const keyB = Buffer.alloc(32, 0x42).toString("base64");
const tableData = {
  columns: [{ key: "name", label: "设备", align: "left" }],
  rows: [{ name: "泵 A" }],
  pageSize: 20,
};
const plan: ChangePlan = {
  schema: "kf-change-plan/v1",
  workspaceId: "w",
  operations: [{
    op: "create",
    entityType: "control",
    entityId: "table-guid",
    properties: { type: "easyui", proto: 1, tableData },
  }],
};
const assetId = "asset-00000000000040008000000000000001";
const workspaceAssetId = "00000000-0000-4000-8000-000000000001";
const assetSha = "1".repeat(64);

function signedAssets() {
  const assetPlan: InternalChangePlan = {
    schema: "kf-change-plan/v1",
    workspaceId: "w",
    operations: [{
      op: "create",
      entityType: "control",
      entityId: "portrait-guid",
      properties: { type: "image", src: `static/agent-assets/pending-${assetId}` },
    }],
    assetBindings: [{
      assetId,
      workspaceAssetId,
      entityId: "portrait-guid",
      controlId: "portrait-guid",
      capabilityId: "image",
      targetPath: `project/res/images/${assetSha}.png`,
      mediaType: "image/png",
      sha256: assetSha,
      sizeBytes: 42,
    }],
  };
  return createHmacServerPlanAuthority(decodeServerPlanHmacKey(keyA)).sign({
    plan: assetPlan,
    revisionId: "revision-1",
    semanticOperations: [],
  });
}

function signed() {
  return createHmacServerPlanAuthority(decodeServerPlanHmacKey(keyA)).sign({
    plan,
    revisionId: "revision-1",
    semanticOperations: [{
      kind: "kf.table-data/v1",
      entityId: "table-guid",
      capabilityId: "easyui.1",
      sourceModuleId: "table-module",
      payloadHash: semanticPayloadHash(tableData),
    }],
  });
}

function signedUpdate() {
  return createHmacServerPlanAuthority(decodeServerPlanHmacKey(keyA)).sign({
    plan: {
      schema: "kf-change-plan/v1",
      workspaceId: "w",
      operations: [{
        op: "update",
        entityId: "button-guid",
        changes: [{ path: "/text", value: "Reviewed" }],
      }],
    },
    revisionId: "revision-1",
    semanticOperations: [],
  });
}

function envelopeWithUnsignedUpdateValue(value: unknown) {
  const envelope = structuredClone(signedUpdate());
  const operation = envelope.plan.operations[0]!;
  if (operation.op !== "update") throw new Error("expected update");
  operation.changes[0]!.value = value;
  return envelope;
}

function expectRawBudgetFailure(value: unknown): void {
  let caught: unknown;
  try {
    createHmacServerPlanAuthority(decodeServerPlanHmacKey(keyA))
      .verify(envelopeWithUnsignedUpdateValue(value));
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(Error);
  expect(caught).not.toBeInstanceOf(RangeError);
  expect((caught as Error).message).toMatch(/^SERVER_PLAN_RAW_INVALID:/);
}

describe("HMAC server plan authority", () => {
  it.each([undefined, "", Buffer.alloc(31, 0x41).toString("base64"), "not-base64***"])(
    "rejects missing, malformed, or short server-only key material",
    (raw) => expect(() => decodeServerPlanHmacKey(raw)).toThrow(/HMAC key/i),
  );

  it("verifies a JSON/Prisma roundtrip with the same key", () => {
    const envelope = signed();
    const cloned: unknown = JSON.parse(JSON.stringify(envelope));
    expect(createHmacServerPlanAuthority(decodeServerPlanHmacKey(keyA)).verify(cloned, {
      expectedPlanHash: envelope.planHash,
      expectedRevisionId: "revision-1",
    })).toEqual(envelope);
  });

  it("retains compiler-owned asset bindings through persistence and rejects binding tampering", () => {
    const envelope = signedAssets();
    const roundTripped: unknown = JSON.parse(JSON.stringify(envelope));
    expect(createHmacServerPlanAuthority(decodeServerPlanHmacKey(keyA)).verify(roundTripped))
      .toEqual(envelope);

    const mutations: Array<(binding: NonNullable<typeof envelope.plan.assetBindings>[number]) => void> = [
      (binding) => { binding.entityId = "different-guid"; },
      (binding) => { binding.controlId = "different-control"; },
      (binding) => { binding.sizeBytes += 1; },
      (binding) => {
        binding.assetId = "asset-00000000000040008000000000000002";
        binding.workspaceAssetId = "00000000-0000-4000-8000-000000000002";
      },
      (binding) => {
        binding.mediaType = "image/jpeg";
        binding.targetPath = `project/res/images/${binding.sha256}.jpg`;
      },
      (binding) => {
        binding.sha256 = "2".repeat(64);
        binding.targetPath = `project/res/images/${binding.sha256}.png`;
      },
    ];
    for (const mutate of mutations) {
      const tampered = structuredClone(envelope);
      mutate(tampered.plan.assetBindings![0]!);
      tampered.planHash = canonicalChangePlanHash(tampered.plan);
      expect(() => createHmacServerPlanAuthority(decodeServerPlanHmacKey(keyA)).verify(tampered))
        .toThrow(/signature/i);
    }

    const invalidCapability = structuredClone(envelope) as unknown as {
      plan: { assetBindings: Array<{ capabilityId: string }> };
    };
    invalidCapability.plan.assetBindings[0]!.capabilityId = "text";
    expect(() => createHmacServerPlanAuthority(decodeServerPlanHmacKey(keyA)).verify(invalidCapability))
      .toThrow(/schema|invalid/i);
  });

  it("accepts a semantically identical persisted object whose JSON keys were reordered", () => {
    const envelope = signedUpdate();
    const reordered = {
      signature: envelope.signature,
      semanticOperations: envelope.semanticOperations,
      revisionId: envelope.revisionId,
      planHash: envelope.planHash,
      plan: envelope.plan,
      schema: envelope.schema,
    };
    expect(createHmacServerPlanAuthority(decodeServerPlanHmacKey(keyA)).verify(reordered))
      .toEqual(envelope);
  });

  it("rejects a valid envelope signed by another server key", () => {
    expect(() => createHmacServerPlanAuthority(decodeServerPlanHmacKey(keyB)).verify(signed(), {
      expectedPlanHash: signed().planHash,
      expectedRevisionId: "revision-1",
    })).toThrow(/signature/i);
  });

  it("rejects binding tampering even after public hashes are recomputed", () => {
    const tampered = structuredClone(signed());
    tampered.plan.workspaceId = "copied-workspace";
    tampered.planHash = canonicalChangePlanHash(tampered.plan);
    expect(() => createHmacServerPlanAuthority(decodeServerPlanHmacKey(keyA)).verify(tampered, {
      expectedPlanHash: tampered.planHash,
      expectedRevisionId: "revision-1",
    })).toThrow(/signature/i);
  });

  it.each([
    ["revision", (value: ReturnType<typeof signed>) => { value.revisionId = "revision-2"; }],
    ["entity", (value: ReturnType<typeof signed>) => { value.semanticOperations[0]!.entityId = "other"; }],
    ["capability", (value: ReturnType<typeof signed>) => { (value.semanticOperations[0] as { capabilityId: string }).capabilityId = "easyui.9"; }],
    ["source module", (value: ReturnType<typeof signed>) => { value.semanticOperations[0]!.sourceModuleId = "other-module"; }],
    ["payload", (value: ReturnType<typeof signed>) => { value.semanticOperations[0]!.payloadHash = "c".repeat(64); }],
  ])("rejects arbitrary signed %s binding tampering", (_label, mutate) => {
    const value = structuredClone(signed());
    mutate(value);
    expect(() => createHmacServerPlanAuthority(decodeServerPlanHmacKey(keyA)).verify(value)).toThrow(/(?:signature|schema)/i);
  });

  it.each([0, 2])("refuses to issue %i authorizations for one actual semantic operation", (count) => {
    const semantic = {
      kind: "kf.table-data/v1" as const,
      entityId: "table-guid",
      capabilityId: "easyui.1" as const,
      sourceModuleId: "table-module",
      payloadHash: semanticPayloadHash(tableData),
    };
    expect(() => createHmacServerPlanAuthority(decodeServerPlanHmacKey(keyA)).sign({
      plan,
      revisionId: "revision-1",
      semanticOperations: Array.from({ length: count }, () => semantic),
    })).toThrow(/SEMANTIC_MISMATCH/);
  });

  it.each([
    ["inner plan", (value: ReturnType<typeof signedUpdate>) => {
      (value.plan as unknown as Record<string, unknown>)["unknownPlanField"] = true;
    }],
    ["operation", (value: ReturnType<typeof signedUpdate>) => {
      (value.plan.operations[0] as unknown as Record<string, unknown>)["unknownOperationField"] = true;
    }],
    ["field patch", (value: ReturnType<typeof signedUpdate>) => {
      const operation = value.plan.operations[0]!;
      if (operation.op !== "update") throw new Error("expected update");
      (operation.changes[0] as unknown as Record<string, unknown>)["unknownPatchField"] = true;
    }],
  ])("rejects unsigned unknown fields at the %s level", (_label, mutate) => {
    const value = structuredClone(signedUpdate());
    mutate(value);
    expect(() => createHmacServerPlanAuthority(decodeServerPlanHmacKey(keyA)).verify(value))
      .toThrow(/raw|unknown|exact|schema/i);
  });

  it("rejects an own property attached to a signed array", () => {
    const value = structuredClone(signedUpdate());
    (value.plan.operations as unknown as Record<string, unknown>)["extra"] = "unsigned";
    expect(() => createHmacServerPlanAuthority(decodeServerPlanHmacKey(keyA)).verify(value))
      .toThrow(/raw|array|exact|schema/i);
  });

  it("rejects accessors without executing them", () => {
    const value = structuredClone(signedUpdate());
    let reads = 0;
    Object.defineProperty(value.plan, "trap", {
      enumerable: true,
      get() {
        reads += 1;
        return "unsigned";
      },
    });
    expect(() => createHmacServerPlanAuthority(decodeServerPlanHmacKey(keyA)).verify(value))
      .toThrow(/accessor|raw|schema/i);
    expect(reads).toBe(0);
  });

  it.each([
    ["non-enumerable", (planValue: object) => Object.defineProperty(planValue, "hidden", { value: true })],
    ["symbol", (planValue: object) => Object.defineProperty(planValue, Symbol("hidden"), { value: true, enumerable: true })],
    ["prototype", (planValue: object) => Object.setPrototypeOf(planValue, { unsigned: true })],
  ])("rejects %s persisted object state", (_label, mutate) => {
    const value = structuredClone(signedUpdate());
    mutate(value.plan);
    expect(() => createHmacServerPlanAuthority(decodeServerPlanHmacKey(keyA)).verify(value))
      .toThrow(/raw|prototype|symbol|enumerable|schema/i);
  });

  it("rejects a 12k-deep raw value with a uniform budget error instead of recursing", () => {
    let value: unknown = "leaf";
    for (let depth = 0; depth < 12_000; depth += 1) value = { next: value };
    expectRawBudgetFailure(value);
  });

  it("rejects a sparse super-long array before allocating from its untrusted length", () => {
    const value: unknown[] = [];
    value.length = 1_000_000;
    expectRawBudgetFailure(value);
  });

  it("rejects raw values beyond the node budget", () => {
    const groups: unknown[][] = [];
    for (let group = 0; group < 51; group += 1) groups.push(new Array(1_000).fill(null));
    expectRawBudgetFailure({ groups });
  });

  it("rejects objects beyond the per-object key budget", () => {
    const value: Record<string, unknown> = {};
    for (let index = 0; index <= SERVER_PLAN_RAW_LIMITS.maxKeysPerObject; index += 1) {
      value[`key${index}`] = index;
    }
    expectRawBudgetFailure(value);
  });

  it("rejects values beyond the total UTF-8 string budget", () => {
    expectRawBudgetFailure("x".repeat(SERVER_PLAN_RAW_LIMITS.maxTotalStringBytes + 1));
  });

  it("accepts the reviewed boundary array length and a normal 500-operation plan", () => {
    const authority = createHmacServerPlanAuthority(decodeServerPlanHmacKey(keyA));
    const operations: ChangePlan["operations"] = Array.from({ length: 500 }, (_, index) => ({
      op: "update" as const,
      entityId: `control-${index}`,
      changes: [{
        path: "/value",
        value: index === 0
          ? new Array(SERVER_PLAN_RAW_LIMITS.maxArrayLength).fill(null)
          : index,
      }],
    }));
    const envelope = authority.sign({
      plan: { schema: "kf-change-plan/v1", workspaceId: "large-reviewed", operations },
      revisionId: "revision-large",
      semanticOperations: [],
    });
    expect(authority.verify(structuredClone(envelope))).toEqual(envelope);
  });
});

describe("HMAC module artifact authority", () => {
  const artifactKeyA = decodeServerPlanHmacKey(keyA);
  const artifactKeyB = decodeServerPlanHmacKey(keyB);
  const hash = (value: unknown) => canonicalModuleCompilationHash(value);
  const acceptedInput = {
    schema: "kf-accepted-blueprint-artifact/v1" as const,
    projectKey: "kingclient.portal",
    revisionId: "revision-1",
    blueprintHash: hash("blueprint"),
    modules: [{
      blueprintModuleId: "hero",
      expectedKind: "content.hero",
      expectedCategory: "content",
      interactionRequirements: [{ type: "navigate" as const, actionKind: "navigate", target: "projects" }],
    }],
  };
  const compilationMetadata = {
    schema: "kf-module-compilation-metadata/v1" as const,
    projectKey: "kingclient.portal",
    moduleDefinitions: [], assets: [], blueprintMappings: [],
  };
  const compilationInput = {
    schema: "kf-module-compilation-artifact/v1" as const,
    projectKey: "kingclient.portal",
    revisionId: "revision-1",
    acceptedBlueprintHash: acceptedInput.blueprintHash,
    planHash: hash("plan"),
    implementationHash: hash("implementation"),
    metadataHash: hash(compilationMetadata),
    sourceModuleIds: ["hero"],
    metadata: compilationMetadata,
  };

  it("verifies persisted JSON into non-forgeable runtime brands", () => {
    const authority = createHmacModuleArtifactAuthority(artifactKeyA);
    const accepted = authority.signAcceptedBlueprint(acceptedInput);
    const compilation = authority.signModuleCompilation(compilationInput);
    const verifiedAccepted = authority.verifyAcceptedBlueprint(JSON.parse(JSON.stringify(accepted)), {
      projectKey: accepted.projectKey, revisionId: accepted.revisionId, blueprintHash: accepted.blueprintHash,
    });
    const verifiedCompilation = authority.verifyModuleCompilation(JSON.parse(JSON.stringify(compilation)), {
      projectKey: compilation.projectKey, revisionId: compilation.revisionId, planHash: compilation.planHash,
      implementationHash: compilation.implementationHash,
    });
    expect(readVerifiedAcceptedBlueprintArtifact(verifiedAccepted)).toEqual(accepted);
    expect(readVerifiedModuleCompilationArtifact(verifiedCompilation)).toEqual(compilation);
    expect(() => readVerifiedAcceptedBlueprintArtifact(accepted as never)).toThrow("UNVERIFIED_ACCEPTED_BLUEPRINT_ARTIFACT");
    expect(() => readVerifiedModuleCompilationArtifact(compilation as never)).toThrow("UNVERIFIED_MODULE_COMPILATION_ARTIFACT");
  });

  it.each([
    ["wrong key", (authority: ReturnType<typeof createHmacModuleArtifactAuthority>, artifact: unknown) => authority.verifyAcceptedBlueprint(artifact)],
    ["cross type replay", (authority: ReturnType<typeof createHmacModuleArtifactAuthority>, artifact: unknown) => authority.verifyModuleCompilation(artifact)],
  ])("rejects %s", (_label, verify) => {
    const signedArtifact = createHmacModuleArtifactAuthority(artifactKeyA).signAcceptedBlueprint(acceptedInput);
    expect(() => verify(createHmacModuleArtifactAuthority(artifactKeyB), signedArtifact)).toThrow();
  });

  it("rejects tampering and every expected binding mismatch", () => {
    const authority = createHmacModuleArtifactAuthority(artifactKeyA);
    const signedArtifact = authority.signModuleCompilation(compilationInput);
    const tampered = structuredClone(signedArtifact);
    tampered.sourceModuleIds = ["other"];
    expect(() => authority.verifyModuleCompilation(tampered)).toThrow(/SIGNATURE/);
    for (const expected of [
      { projectKey: "kingclient.other" }, { revisionId: "revision-2" },
      { planHash: hash("other-plan") }, { implementationHash: hash("other-spec") },
    ]) expect(() => authority.verifyModuleCompilation(signedArtifact, expected)).toThrow(/BINDING/);
  });

  it("does not expose project seed signing or verification before a creation service exists", () => {
    const authority = createHmacModuleArtifactAuthority(artifactKeyA);
    expect(authority).not.toHaveProperty("signProjectCreationSeeds");
    expect(authority).not.toHaveProperty("verifyProjectCreationSeeds");
    expect(moduleAuthorityExports).not.toHaveProperty("readVerifiedProjectCreationSeedArtifact");
  });
});
