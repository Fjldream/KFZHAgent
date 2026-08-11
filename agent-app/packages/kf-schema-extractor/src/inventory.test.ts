// @ts-nocheck -- brief 逐字测试代码（JS 风格、无类型标注），运行时行为由 vitest 断言验证。
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, symlink, writeFile, readFile, access } from "node:fs/promises";
import { tmpdir } from "node:os";
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
    const stdout = execFileSync(process.execPath, ["--import", "tsx", join(pkgDir, "cli.ts"), ...args], {
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
    const tmp = await mkdtemp(join(tmpdir(), "kf-extract-symlink-"));
    try {
      const root = join(tmp, "root");
      const outside = join(tmp, "outside.json");
      await mkdir(root);
      await writeFile(join(root, "project.json"), '{"name":"SafeProject"}');
      await writeFile(outside, '{"password":"s3cr3t"}');
      await symlink(outside, join(root, "leak.json")); // 文件 symlink -> root 外
      await symlink(tmp, join(root, "leakdir")); // 目录 symlink -> root 外
      const result = await inventory(root);
      expect(result.projectCount).toBe(1);
      expect(result.symlinksRejected).toBe(2);
      expect(result.skipped).toBe(2);
      // 外部文件内容绝不进入盘点结果
      expect(JSON.stringify(result)).not.toContain("s3cr3t");
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
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

  it("does not echo unparsable JSON content back", () => {
    const broken = '{"name":"MySensitiveProject","password":"s3cr3t"';
    const result = sanitizeProject(broken);
    expect(result.parseFailed).toBe(true);
    expect(result.content).toBe("");
    expect(JSON.stringify(result)).not.toContain("s3cr3t");
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

  it("refuses output into tests/fixtures regardless of case", async () => {
    const r = runCli([
      "--root",
      "tests/fixtures/extractor-safe",
      "--mode",
      "inventory",
      "--output",
      "Tests/Fixtures/out.json",
    ]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("refusing to write inside tests/fixtures");
    expect(await exists(join(workspaceRoot, "Tests/Fixtures/out.json"))).toBe(false);
  });

  it("refuses output through a symlink into tests/fixtures", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "kf-extract-symlink-out-"));
    try {
      const link = join(tmp, "fixtures-link");
      await symlink(join(workspaceRoot, "tests/fixtures"), link, "dir");
      const r = runCli([
        "--root",
        "tests/fixtures/extractor-safe",
        "--mode",
        "inventory",
        "--output",
        join(link, "out.json"),
      ]);
      expect(r.status).not.toBe(0);
      expect(r.stderr).toContain("refusing to write inside tests/fixtures");
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
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

  it("refuses a new file inside a git-tracked directory", async () => {
    const r = runCli([
      "--root",
      "tests/fixtures/extractor-safe",
      "--mode",
      "inventory",
      "--output",
      "packages/kf-schema-extractor/src/__rev_out.json",
    ]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain("refusing to write inside git-tracked directory");
    expect(await exists(join(workspaceRoot, "packages/kf-schema-extractor/src/__rev_out.json"))).toBe(
      false,
    );
  });

  it("allows output into a gitignored directory", async () => {
    const r = runCli([
      "--root",
      "tests/fixtures/extractor-safe",
      "--mode",
      "inventory",
      "--output",
      ".private/review-inventory.json",
    ]);
    expect(r.status).toBe(0);
    expect(r.stderr).not.toContain("refusing");
    try {
      expect(await exists(join(workspaceRoot, ".private/review-inventory.json"))).toBe(true);
    } finally {
      await rm(join(workspaceRoot, ".private"), { recursive: true, force: true });
    }
  });

  it("dry-run inventory prints stats and writes nothing", async () => {
    const r = runCli([
      "--root",
      "tests/fixtures/extractor-safe",
      "--mode",
      "inventory",
      "--output",
      ".private/dry-run-probe.json",
      "--dry-run",
    ]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain("projects: 1");
    expect(r.stdout).toContain("dry-run: no file written");
    expect(await exists(join(workspaceRoot, ".private/dry-run-probe.json"))).toBe(false);
  });

  it("sanitize skips unparsable JSON and reports the skip", async () => {
    const tmp = await mkdtemp(join(tmpdir(), "kf-extract-sanitize-"));
    try {
      const root = join(tmp, "root");
      await mkdir(root);
      await writeFile(
        join(root, "broken.json"),
        '{"name":"MySensitiveProject","password":"s3cr3t"',
      );
      await writeFile(
        join(root, "ok.json"),
        '{"server":{"password":"s3cr3t","host":"203.0.113.9"}}',
      );
      const out = join(tmp, "out");
      const r = runCli(["--root", root, "--mode", "sanitize", "--output", out]);
      expect(r.status).toBe(0);
      expect(r.stdout).toContain("skipped-unreadable: 1");
      expect(await exists(join(out, "broken.json"))).toBe(false);
      const ok = await readFile(join(out, "ok.json"), "utf8");
      expect(ok).not.toContain("s3cr3t");
      expect(ok).not.toContain("203.0.113.9");
      expect(ok).toContain("[REDACTED:password]");
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
