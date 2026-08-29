// @ts-nocheck -- integration fixture uses narrow Prisma/storage doubles.
import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import {
  CapabilityCandidateBundleSchema,
  CustomerSolutionBlueprintSchema,
  SolutionImplementationPlanSchema,
  canonicalServerHash,
} from "@kf/contracts";
import {
  attachRuntimeCorrelation,
  compileInteractions,
  compileSolutionImplementation,
  createDefaultModuleRegistry,
} from "@kf/domain-client";
import { createCreativeSolutionCompilerFromEnvironment } from "./graph-ports.js";

const FIXTURE_URL = new URL("./fixtures/v4-flash-portfolio-interactions.json", import.meta.url);

function semanticContext() {
  const blueprint = CustomerSolutionBlueprintSchema.parse({
    schema: "kf-design-plan/v3",
    displayName: "脱敏交互作品集",
    objective: "验证筛选、表单、导航与弹层的前端交互闭环",
    audiences: ["演示用户"],
    scenarios: ["筛选作品并提交联系信息"],
    pages: [
      {
        id: "bp-home", title: "作品概览", purpose: "筛选和操作作品", readingOrder: ["region-home", "region-form"],
        regions: [{
          id: "region-home", purpose: "作品交互", semanticRoles: ["content", "action"],
          dataShape: "records", density: "comfortable", importance: "primary",
          content: ["作品列表", "联系表单"], sampleData: [],
          interactions: ["筛选作品", "提交联系表单", "打开弹层", "进入详情"],
          states: ["ready", "filtered", "submitted"], visualIntent: "专业清晰",
        }, {
          id: "region-form", purpose: "联系表单", semanticRoles: ["action"],
          dataShape: "form", density: "comfortable", importance: "secondary",
          content: ["联系表单"], sampleData: [], interactions: ["校验并提交联系表单"],
          states: ["ready", "submitted"], visualIntent: "简洁",
        }],
      },
      {
        id: "bp-detail", title: "项目详情", purpose: "展示项目详情", readingOrder: ["region-detail"],
        regions: [{
          id: "region-detail", purpose: "项目内容", semanticRoles: ["content"],
          dataShape: "content", density: "comfortable", importance: "primary",
          content: ["项目详情"], sampleData: [], interactions: [], states: ["ready"], visualIntent: "清晰",
        }],
      },
    ],
    journeys: [{
      id: "open-detail", actor: "演示用户", goal: "查看项目详情",
      steps: [{ pageId: "bp-home", regionId: "region-home", action: "点击详情入口", result: "详情页可见" }],
      completion: "详情页可见",
    }],
    visualDirection: { tone: "专业", colors: ["深蓝", "橙色"], typography: "清晰", spacingAndSurfaces: "舒适" },
    acceptanceScenarios: ["筛选、提交、导航和弹层均可演示"], openQuestions: [],
  });
  const ranked = (id: string, score = 3) => ({ id, score, reasons: ["交互测试所需"], limitations: [], knowledgeVersion: "1.0.0" });
  const homeControls = ["button", "easyui.1", "image", "select", "text"].map((id) => ranked(id));
  const formControls = ["button", "input", "text"].map((id) => ranked(id));
  const candidateBundle = CapabilityCandidateBundleSchema.parse({
    schema: "kf-capability-candidates/v1", knowledgeCatalogVersion: "1.0.0",
    blueprintHash: canonicalServerHash(blueprint),
    regions: [
      { pageId: "bp-home", regionId: "region-home", controls: homeControls, layouts: [ranked("layout.4")], recipes: [ranked("content.hero")] },
      { pageId: "bp-home", regionId: "region-form", controls: formControls, layouts: [ranked("layout.4")], recipes: [ranked("form.contact")] },
      { pageId: "bp-detail", regionId: "region-detail", controls: [ranked("text"), ranked("button"), ranked("image")], layouts: [ranked("layout.4")], recipes: [ranked("content.hero")] },
    ],
    detailedCapabilityIds: ["button", "easyui.1", "image", "input", "layout.4", "select", "text"],
    generatedAtPolicy: "deterministic-no-timestamp",
  });
  return { blueprint, candidateBundle };
}

async function loadFixturePlan() {
  const fixtureText = await readFile(FIXTURE_URL, "utf8");
  const fixture = JSON.parse(fixtureText) as { fixtureProvenance: unknown; semanticPlan: Record<string, unknown> };
  const { blueprint, candidateBundle } = semanticContext();
  const plan = SolutionImplementationPlanSchema.parse({
    ...fixture.semanticPlan,
    blueprintHash: canonicalServerHash(blueprint),
    candidateBundleHash: canonicalServerHash(candidateBundle),
  });
  return { fixtureText, blueprint, candidateBundle, plan };
}

function auditSanitizedFixture(value: unknown, path = "fixture"): void {
  const forbiddenKeys = /^(?:source|code|javascript|executable|api[_-]?key|credential|secret|token|tenantId|workspaceId|conversationId|baseRevisionId)$/i;
  const forbiddenValue = /(?:\bBearer\s+[A-Za-z0-9._-]+|sk-[A-Za-z0-9]{8,}|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY)/i;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => auditSanitizedFixture(entry, `${path}[${index}]`));
    return;
  }
  if (value === null || typeof value !== "object") {
    if (typeof value === "string") expect(value, `${path} contains a secret-shaped value`).not.toMatch(forbiddenValue);
    return;
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    expect(key, `${path}.${key} is source-bearing or environment-specific`).not.toMatch(forbiddenKeys);
    auditSanitizedFixture(entry, `${path}.${key}`);
  }
}

function graphPrisma() {
  type IdQuery = { where: { id: string } };
  type UpsertQuery = IdQuery & { create: Record<string, unknown>; update: Record<string, unknown> };
  type CreateQuery = { data: Record<string, unknown> & { id: string } };
  const requests = new Map<string, Record<string, unknown>>();
  const plans = new Map<string, Record<string, unknown>>();
  const solutionRevision = { findFirst: vi.fn().mockResolvedValue({ id: "revision-advanced", kind: "built", state: { pages: [] } }) };
  const domainProjectRevision = { findMany: vi.fn().mockResolvedValue([]) };
  const client = {
    solutionRevision,
    domainProjectRevision,
    async $transaction(run: (tx: unknown) => Promise<unknown>) {
      const requestDraft = new Map([...requests].map(([key, value]) => [key, structuredClone(value)]));
      const planDraft = new Map([...plans].map(([key, value]) => [key, structuredClone(value)]));
      const tx = {
        solutionRevision,
        changeRequest: {
          findUnique: async ({ where: { id } }: IdQuery) => requestDraft.get(id) ?? null,
          upsert: async ({ where: { id }, create, update }: UpsertQuery) => requestDraft.set(id, { ...(requestDraft.get(id) ?? create), ...update }),
        },
        changePlan: {
          findUnique: async ({ where: { id } }: IdQuery) => planDraft.get(id) ?? null,
          create: async ({ data }: CreateQuery) => { planDraft.set(data.id, structuredClone(data)); },
        },
      };
      const result = await run(tx);
      requests.clear(); plans.clear();
      requestDraft.forEach((value, key) => requests.set(key, value));
      planDraft.forEach((value, key) => plans.set(key, value));
      return result;
    },
  };
  return { client, plans };
}

describe("sanitized V4 Flash advanced interactions", () => {
  it("lowers reviewed intent, preserves raw provenance, and compiles through the production graph port", async () => {
    const { fixtureText, blueprint, candidateBundle, plan } = await loadFixturePlan();
    expect(fixtureText).not.toMatch(/sk-[A-Za-z0-9]|api[_-]?key|credential|tenantId|workspaceId|semantic-js|"source"\s*:\s*"[;$]/i);
    auditSanitizedFixture(JSON.parse(fixtureText));

    const implementation = compileSolutionImplementation({
      plan, candidateBundle, moduleRegistry: createDefaultModuleRegistry(), approvedAssets: [],
      activeCatalogVersion: candidateBundle.knowledgeCatalogVersion,
    });
    const correlated = attachRuntimeCorrelation({
      workspaceId: "workspace-advanced", baseRevisionId: "revision-advanced", implementation,
      semanticStateIds: plan.localState.map((state) => state.id),
    });
    const interactions = compileInteractions({ blueprint, plan, implementation: correlated });
    expect(interactions.diagnostics.errors.filter((entry) =>
      ["INTERACTION_SCRIPT_BLOCKED", "INTERACTION_OUTPUT_CONSUMER_MISSING"].includes(entry.code),
    )).toEqual([]);
    expect(interactions.diagnostics.requests).toEqual([
      expect.objectContaining({ reason: "TRIGGER_EVENT_UNSUPPORTED", actionId: "action-open-avatar-overlay" }),
    ]);
    expect(interactions.sourceSolutionPlanHash).toBe(canonicalServerHash(plan));
    expect(interactions.loweredSolutionPlanHash).not.toBe(interactions.sourceSolutionPlanHash);
    expect(interactions.implementation.sourceSolutionPlanHash).toBe(interactions.sourceSolutionPlanHash);
    expect(interactions.implementation.pages.flatMap((page) => page.controls)
      .find((control) => control.id === "details-link")?.capabilityId).toBe("button");
    const compiledSource = interactions.implementation.compiledScripts.map((script) => script.source).join("\n");
    expect(compiledSource).toContain("Select");
    expect(compiledSource).toContain(".GetCheckedNodes()");
    expect(compiledSource).toContain(".SetData(filtered)");
    expect(compiledSource).toContain(".Value");
    expect(compiledSource).toContain("ShowMessage(");
    expect(compiledSource).not.toContain("按已声明条件筛选记录并更新表格");

    const prisma = graphPrisma();
    const outcome = await createCreativeSolutionCompilerFromEnvironment(
      prisma.client as never, {} as never,
      { resolveManyForCompilation: vi.fn().mockResolvedValue([]) },
      { KF_SERVER_PLAN_HMAC_KEY_BASE64: Buffer.alloc(32, 0x65).toString("base64") },
    ).compile({
      tenantId: "tenant-advanced", workspaceId: "workspace-advanced", conversationId: "conversation-advanced",
      baseRevisionId: "revision-advanced", projectKey: plan.projectKey, domainKind: "kingclient",
      blueprint, candidateBundle, semanticPlan: plan,
    });
    expect(outcome.status, outcome.status === "blocked" ? JSON.stringify(outcome.diagnostics) : undefined).toBe("compiled");
    if (outcome.status !== "compiled") return;
    expect(prisma.plans.get(outcome.changePlanId)).toBeDefined();
    expect(outcome.warnings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "INTERACTION_COMPILATION_REQUEST", nodeId: "action-open-avatar-overlay" }),
    ]));
  });

  it("blocks a missing non-Image closure at the production graph boundary", async () => {
    const { blueprint, candidateBundle, plan } = await loadFixturePlan();
    const nonImageClosurePlan = SolutionImplementationPlanSchema.parse({
      ...plan,
      actions: plan.actions
        .filter((action) => action.id !== "navigate-detail")
        .map((action) => action.id === "mark-details-opened" ? { ...action, afterActionIds: [] } : action),
    });
    const prisma = graphPrisma();
    const outcome = await createCreativeSolutionCompilerFromEnvironment(
      prisma.client as never, {} as never,
      { resolveManyForCompilation: vi.fn().mockResolvedValue([]) },
      { KF_SERVER_PLAN_HMAC_KEY_BASE64: Buffer.alloc(32, 0x65).toString("base64") },
    ).compile({
      tenantId: "tenant-advanced", workspaceId: "workspace-advanced", conversationId: "conversation-non-image-closure",
      baseRevisionId: "revision-advanced", projectKey: nonImageClosurePlan.projectKey, domainKind: "kingclient",
      blueprint, candidateBundle, semanticPlan: nonImageClosurePlan,
    });

    expect(outcome.status).toBe("blocked");
    if (outcome.status !== "blocked") return;
    expect(outcome.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "INTERACTION_CLOSURE_MISSING", nodeId: "mark-details-opened", phase: "interaction" }),
    ]));
    expect(prisma.plans.size).toBe(0);
  });
});
