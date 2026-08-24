import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { readVerifiedAcceptedBlueprintArtifact } from "@kf/build-jobs";
import {
  createCreativeBuildFacadeFromEnvironment,
  createModuleArtifactAuthorityFromEnvironment,
  createServerPlanAuthorityFromEnvironment,
  signAcceptedBlueprintAtConfirmation,
} from "./server-plan-authority.js";

describe("API server plan authority configuration", () => {
  it.each([{}, { KF_SERVER_PLAN_HMAC_KEY_BASE64: Buffer.alloc(8).toString("base64") }])(
    "fails startup when the shared server-only HMAC key is missing or short",
    (environment) => expect(() => createServerPlanAuthorityFromEnvironment(environment)).toThrow(/HMAC key/i),
  );

  it("creates the authority from a 256-bit key without exposing the key", () => {
    const authority = createServerPlanAuthorityFromEnvironment({
      KF_SERVER_PLAN_HMAC_KEY_BASE64: Buffer.alloc(32, 0x31).toString("base64"),
    });
    expect(Object.keys(authority).sort()).toEqual(["sign", "verify"]);
  });

  it("binds the creative issuer and asset attester inside one server-scoped facade", () => {
    const environment = {
      KF_SERVER_PLAN_HMAC_KEY_BASE64: Buffer.alloc(32, 0x32).toString("base64"),
    };

    const facade = createCreativeBuildFacadeFromEnvironment(environment);

    expect(Object.keys(facade).sort()).toEqual(["authority", "compiler"]);
    expect(Object.keys(facade.authority).sort()).toEqual(["sign", "verify"]);
    expect(Object.keys(facade.compiler).sort()).toEqual(["assetProofResolver", "compiler"]);
    expect(JSON.stringify(facade)).not.toContain(environment.KF_SERVER_PLAN_HMAC_KEY_BASE64);
    expect(JSON.stringify(facade)).not.toContain("issuer");
  });

  it("uses the same server key with a separated module domain and signs Registry-derived blueprint facts only at confirmation", () => {
    const environment = { KF_SERVER_PLAN_HMAC_KEY_BASE64: Buffer.alloc(32, 0x31).toString("base64") };
    const authority = createModuleArtifactAuthorityFromEnvironment(environment);
    const signed = signAcceptedBlueprintAtConfirmation({ authority, projectKey: "project", revisionId: "revision", blueprint: {
      schema: "kf-design-plan/v2", displayName: "Portal", overview: { objective: "Navigate", audiences: ["User"], scenarios: ["Open"], valueProposition: "Fast" }, informationArchitecture: { narrative: "Navigation", wireframe: "Header" }, modules: [{ id: "nav", name: "Navigation", purpose: "Navigate", content: ["Home"], sampleData: [], interactions: [], expectedKind: "navigation.top", expectedCategory: "model-forged", interactionRequirements: [{ type: "navigate", actionKind: "model-forged", target: "home" }], presentation: "Header" }], visualDirection: { tone: "Clean", colors: ["Blue"], typography: "Sans", spacingAndSurfaces: "Compact" }, highlights: ["Navigation"], revisionNotes: { added: [], changed: [], retained: [] }, acceptanceCriteria: ["Works"], openQuestions: [],
    } });
    const verified = authority.verifyAcceptedBlueprint(JSON.parse(JSON.stringify(signed)), { projectKey: "project", revisionId: "revision" });
    expect(readVerifiedAcceptedBlueprintArtifact(verified).modules).toEqual([{ blueprintModuleId: "nav", expectedKind: "navigation.top", expectedCategory: "navigation", interactionRequirements: [{ type: "navigate", actionKind: "navigate", target: "home" }] }]);
    expect(JSON.stringify(signed)).not.toContain(environment.KF_SERVER_PLAN_HMAC_KEY_BASE64);
  });

  it("blocks legacy text-only interactions until the customer reconfirms machine requirements", () => {
    const authority = createModuleArtifactAuthorityFromEnvironment({
      KF_SERVER_PLAN_HMAC_KEY_BASE64: Buffer.alloc(32, 0x31).toString("base64"),
    });
    expect(() => signAcceptedBlueprintAtConfirmation({ authority, projectKey: "project", revisionId: "revision", blueprint: {
      schema: "kf-design-plan/v2", displayName: "Portal", overview: { objective: "Navigate", audiences: ["User"], scenarios: ["Open"], valueProposition: "Fast" }, informationArchitecture: { narrative: "Navigation", wireframe: "Header" }, modules: [{ id: "nav", name: "Navigation", purpose: "Navigate", content: ["Home"], sampleData: [], interactions: ["点击进入首页"], expectedKind: "navigation.top", interactionRequirements: [], presentation: "Header" }], visualDirection: { tone: "Clean", colors: ["Blue"], typography: "Sans", spacingAndSurfaces: "Compact" }, highlights: ["Navigation"], revisionNotes: { added: [], changed: [], retained: [] }, acceptanceCriteria: ["Works"], openQuestions: [],
    } })).toThrow("ACCEPTED_BLUEPRINT_INTERACTIONS_NEED_RECONFIRM");
  });

  it.each(["start:api", "start:worker"])(
    "%s loads the deployment-local .env before server configuration is created",
    async (scriptName) => {
      const packageJson = JSON.parse(
        await readFile(new URL("../../../../package.json", import.meta.url), "utf8"),
      ) as { scripts?: Record<string, string> };
      const script = packageJson.scripts?.[scriptName];
      expect(script).toMatch(/^node --env-file=\.env /);
      expect(script).not.toMatch(/KF_SERVER_PLAN_HMAC_KEY_BASE64=/);
    },
  );
});
