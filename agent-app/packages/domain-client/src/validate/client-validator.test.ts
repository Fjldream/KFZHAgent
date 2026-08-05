// @ts-nocheck -- 测试含 brief 逐字代码（JS 风格、无类型标注）；运行时行为由 vitest 断言验证。
/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
import { describe, expect, it } from "vitest";
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { applyClientPatch, deleteOperationDigest } from "../patch/client-patcher.js";
import { inspectClientProject } from "../inspect/client-inspector.js";
import { validateClientProject } from "./client-validator.js";

const pkgDir = fileURLToPath(new URL(".", import.meta.url));
const fixturesRoot = join(pkgDir, "../../../../tests/fixtures");
const fixture = (name) => join(fixturesRoot, name);

async function tempDir(prefix) {
  return mkdtemp(join(tmpdir(), prefix));
}

async function copyFixture(name) {
  const dest = await tempDir("kf-validate-base-");
  await cp(fixture(name), dest, { recursive: true });
  return dest;
}

function plan(operations) {
  return { schema: "kf-change-plan/v1", workspaceId: "w-test", operations };
}

async function rootDirOf(root) {
  return typeof root === "string" ? root : root.rootDir;
}

function happyPlan() {
  return plan([
    { op: "update", entityId: "button-guid-1", changes: [{ path: "/backgroundColor", value: "#ff0000" }] }
  ]);
}

async function resolveVersionDir(root) {
  const dir = await rootDirOf(root);
  const entries = await import("node:fs/promises").then((m) => m.readdir(dir, { withFileTypes: true }));
  const version = entries.find((e) => e.isDirectory() && /^\d+\.\d+\.\d+\.\d+$/.test(e.name));
  return version ? join(dir, version.name) : dir;
}

async function pageFile(root) {
  const projectRoot = await resolveVersionDir(root);
  return join(projectRoot, "project", "page", "Page1.json");
}

async function readPage(root) {
  return JSON.parse(await readFile(await pageFile(root), "utf8"));
}

async function writePage(root, page) {
  await writeFile(await pageFile(root), JSON.stringify(page, null, 2));
}

describe("client validator (Task 7 brief Step 2)", () => {
  it("passes a legal field-level update", async () => {
    const base = await copyFixture("client-unknown-field");
    const candidate = await applyClientPatch(base, happyPlan());
    const report = await validateClientProject(base, candidate, happyPlan());
    expect(report.status).toBe("pass");
    for (const check of Object.values(report.checks)) {
      expect(["pass", "warn"]).toContain(check);
    }
  });

  it("fails on duplicate control GUIDs", async () => {
    const base = await copyFixture("client-unknown-field");
    const candidate = await applyClientPatch(base, happyPlan());
    const page = await readPage(candidate);
    page.objects.push({
      name: "ClonedButton",
      uiModelType: 35,
      guid: "button-guid-1",
      leftTopPt: { x: 0, y: 0 },
      width: 90,
      height: 60,
      text: "clone",
    });
    await writePage(candidate, page);
    const report = await validateClientProject(base, candidate, happyPlan());
    expect(report.checks.references).toBe("fail");
    expect(report.status).toBe("fail");
  });

  it("fails on a missing variable reference in a script action", async () => {
    const base = await copyFixture("client-unknown-field");
    const candidate = await applyClientPatch(base, happyPlan());
    const page = await readPage(candidate);
    page.objects[0].linkMng = {
      linkList: [{ action: "setVariable", variableId: "$NoSuchVar", value: 1 }],
    };
    await writePage(candidate, page);
    const report = await validateClientProject(base, candidate, happyPlan());
    expect(report.checks.references).toBe("fail");
    expect(report.status).toBe("fail");
  });

  it("fails on an unknown uiModelType", async () => {
    const base = await copyFixture("client-unknown-field");
    const candidate = await applyClientPatch(base, happyPlan());
    const page = await readPage(candidate);
    page.objects[0].uiModelType = 999;
    await writePage(candidate, page);
    const report = await validateClientProject(base, candidate, happyPlan());
    expect(report.checks.businessRules).toBe("fail");
    expect(report.status).toBe("fail");
  });

  it("fails on page geometry outside bounds", async () => {
    const base = await copyFixture("client-unknown-field");
    const candidate = await applyClientPatch(base, happyPlan());
    const page = await readPage(candidate);
    page.objects[0].leftTopPt = { x: 1300, y: 80 }; // beyond 1280x720 page
    await writePage(candidate, page);
    const report = await validateClientProject(base, candidate, happyPlan());
    expect(report.checks.businessRules).toBe("fail");
    expect(report.status).toBe("fail");
  });

  it("fails on an unconfirmed delete in the plan", async () => {
    const base = await copyFixture("client-unknown-field");
    const candidate = await copyFixture("client-unknown-field");
    const report = await validateClientProject(base, candidate, plan([
      { op: "delete", entityId: "button-guid-1", destructiveConfirmed: false }
    ]));
    expect(report.checks.businessRules).toBe("fail");
    expect(report.status).toBe("fail");
  });

  it("fails when a file outside the plan scope changed", async () => {
    const base = await copyFixture("client-unknown-field");
    const candidate = await applyClientPatch(base, happyPlan());
    // Tamper with a field the plan did NOT touch (same file, different field).
    const page = await readPage(candidate);
    page.objects[0].text = "hacked";
    await writePage(candidate, page);
    const report = await validateClientProject(base, candidate, happyPlan());
    expect(report.checks.changeScope).toBe("fail");
    expect(report.status).toBe("fail");
  });

  it("fails on a malformed script action", async () => {
    const base = await copyFixture("client-unknown-field");
    const candidate = await applyClientPatch(base, happyPlan());
    const page = await readPage(candidate);
    page.objects[0].linkMng = {
      linkList: [{ action: "teleportToMoon", moon: "full" }],
    };
    await writePage(candidate, page);
    const report = await validateClientProject(base, candidate, happyPlan());
    expect(report.checks.businessRules).toBe("fail");
    expect(report.status).toBe("fail");
  });

  it("fails on a package round-trip mismatch", async () => {
    const base = await copyFixture("client-unknown-field");
    const candidate = await applyClientPatch(base, happyPlan());
    // The packager excludes pagerecord, so it never shows up in the unpacked
    // output; a candidate that keeps it cannot round-trip byte-for-byte.
    const projectRoot = await resolveVersionDir(candidate);
    await mkdir(join(projectRoot, "project", "pagerecord"), { recursive: true });
    await writeFile(join(projectRoot, "project", "pagerecord", "secret.page"), "top-secret");
    const report = await validateClientProject(base, candidate, happyPlan());
    expect(report.checks.roundTrip).toBe("fail");
    expect(report.status).toBe("fail");
  });

  it("warns but does not fail when a planned change had no effect", async () => {
    const base = await copyFixture("client-unknown-field");
    // Plan updates /backgroundColor to the value it already... doesn't have, so
    // the patch does apply; instead use a plan whose field equals current value
    // of an existing field: /text stays "确定".
    const planText = plan([
      { op: "update", entityId: "button-guid-1", changes: [{ path: "/text", value: "确定" }] }
    ]);
    const candidate = await applyClientPatch(base, planText);
    const report = await validateClientProject(base, candidate, planText);
    expect(report.status).toBe("pass");
    expect(report.warnings.length).toBeGreaterThan(0);
  });

  it("passes a confirmed delete end-to-end", async () => {
    const base = await copyFixture("client-unknown-field");
    const deletePlan = plan([
      { op: "delete", entityId: "button-guid-1", destructiveConfirmed: true, digest: deleteOperationDigest("button-guid-1") }
    ]);
    const candidate = await applyClientPatch(base, deletePlan);
    const report = await validateClientProject(base, candidate, deletePlan);
    expect(report.status).toBe("pass");
  });

  it("passes a create-control end-to-end", async () => {
    const base = await copyFixture("client-unknown-field");
    const createPlan = plan([
      {
        op: "create",
        entityType: "control",
        entityId: "FreshButton",
        properties: { pageId: "page-guid-1", type: "button", text: "New", x: 10, y: 10, width: 90, height: 60 }
      }
    ]);
    const candidate = await applyClientPatch(base, createPlan);
    const report = await validateClientProject(base, candidate, createPlan);
    expect(report.status).toBe("pass");
  });
});

describe("validator reports", () => {
  it("always returns all six checks", async () => {
    const base = await copyFixture("client-unknown-field");
    const candidate = await applyClientPatch(base, happyPlan());
    const report = await validateClientProject(base, candidate, happyPlan());
    expect(Object.keys(report.checks).sort()).toEqual([
      "businessRules",
      "changeScope",
      "jsonSchema",
      "packageStructure",
      "references",
      "roundTrip",
    ]);
  });

  it("keeps candidate inspectable after validation", async () => {
    const base = await copyFixture("client-unknown-field");
    const candidate = await applyClientPatch(base, happyPlan());
    await validateClientProject(base, candidate, happyPlan());
    const result = await inspectClientProject(await rootDirOf(candidate));
    expect(result.index.controls["button-guid-1"].type).toBe("button");
  });
});
