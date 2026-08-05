// @ts-nocheck -- brief 逐字测试代码（JS 风格、无类型标注），运行时行为由 vitest 断言验证。
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFile, access } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inventory } from "./inventory.js";
import { scanSecrets, redactMarker } from "./secret-scanner.js";
import { sanitizeProject } from "./sanitizer.js";

const pkgDir = dirname(fileURLToPath(import.meta.url));
const fixturesRoot = join(pkgDir, "../../../tests/fixtures");
const workspaceRoot = resolve(fixturesRoot, "../..");
const fixtureRoot = (name: string) => join(fixturesRoot, name);
const readFixture = (rel: string) => readFile(join(fixturesRoot, rel), "utf8");

function runCli(args: readonly string[]): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync("node", [join(pkgDir, "cli.ts"), ...args], {
      cwd: workspaceRoot,
      encoding: "utf8",
    });
    return { status: 0, stdout, stderr: "" };
  } catch (caught) {
    const error = caught as { status?: number; stdout?: string | Buffer; stderr?: string | Buffer };
    return {
      status: error.status ?? 1,
      stdout: (error.stdout ?? "").toString(),
      stderr: (error.stderr ?? "").toString(),
    };
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

describe("inventory", () => {
  it("counts projects without returning field values", async () => {
    const result = await inventory(fixtureRoot("extractor-safe"));
    expect(result.projectCount).toBe(1);
    expect(JSON.stringify(result)).not.toContain("DemoProject");
  });

  it("records structural paths and inferred primitive types only", async () => {
    const result = await inventory(fixtureRoot("extractor-safe"));
    const fieldTypes = result.jsonFields.map((f) => `${f.path}:${f.type}`);
    expect(fieldTypes).toEqual(
      expect.arrayContaining([
        "name:string",
        "projectData.type:string",
        "project.enabled:boolean",
        "project.retryCount:number",
        "project.owner:null",
      ]),
    );
    // 绝不包含任何 JSON 值（fixture 里的值都被拒之门外）
    const serialized = JSON.stringify(result);
    for (const value of ["DemoProject", "kingclient", "demo", "00000000-0000-0000-0000-000000000001"]) {
      expect(serialized).not.toContain(value);
    }
  });

  it("rejects symlinks and files outside the root without aborting", async () => {
    const dir = fixtureRoot("extractor-safe");
    // 指向 root 之外的 symlink 必须被跳过并计入 skipped
    const result = await inventory(dir);
    expect(result.skipped).toBeGreaterThanOrEqual(0);
    expect(result.projectCount).toBe(1);
  });
});

describe("secret handling", () => {
  it("detects secrets and replaces their values", async () => {
    const source = await readFixture("extractor-secret/project.json");
    const findings = scanSecrets(source);
    expect(findings.map((f) => f.kind)).toEqual(
      expect.arrayContaining(["password", "token", "connection-string", "ip-address"]),
    );
    expect(JSON.stringify(sanitizeProject(source))).not.toContain("secret-value");
  });

  it("maps every sensitive key name case-insensitively to a kind", () => {
    const source = JSON.stringify({
      PASSWORD: "v1",
      PassWd: "v2",
      pwd: "v3",
      TOKEN: "v4",
      Secret: "v5",
      connectionString: "v6",
      USERNAME: "v7",
      HOST: "v8",
      IP: "v9",
      Url: "v10",
    });
    const kinds = scanSecrets(source).map((f) => f.kind);
    expect(kinds).toEqual(
      expect.arrayContaining([
        "password",
        "password",
        "password",
        "token",
        "secret",
        "connection-string",
        "username",
        "host",
        "ip-address",
        "url",
      ]),
    );
  });

  it("uses one deterministic marker per key", async () => {
    const source = await readFixture("extractor-secret/project.json");
    const sanitized = sanitizeProject(source);
    expect(sanitized.content).toContain(`"password":"${redactMarker("password")}"`);
    expect(sanitized.content).toContain(`"token":"${redactMarker("token")}"`);
    expect(sanitized.content).not.toContain("secret-value");
    expect(sanitized.content).not.toContain("203.0.113.");
  });
});

describe("cli", () => {
  it("refuses to write into tests/fixtures", async () => {
    const r = runCli([
      "--root",
      "tests/fixtures/extractor-safe",
      "--mode",
      "inventory",
      "--output",
      "tests/fixtures/out.json",
    ]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("refusing");
    expect(await exists(join(workspaceRoot, "tests/fixtures/out.json"))).toBe(false);
  });

  it("refuses to overwrite a git-tracked file", async () => {
    const r = runCli([
      "--root",
      "tests/fixtures/extractor-safe",
      "--mode",
      "inventory",
      "--output",
      "packages/kf-schema-extractor/package.json",
    ]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("refusing");
  });

  it("dry-run inventory prints stats and writes nothing", async () => {
    const r = runCli(["--root", "tests/fixtures/extractor-safe", "--mode", "inventory", "--dry-run"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("projects: 1");
    expect(await exists(join(workspaceRoot, ".private/dry-run-probe.json"))).toBe(false);
  });
});
