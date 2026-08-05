/**
 * CLI：只读 SDB 盘点与脱敏流水线。
 *
 * 用法：
 *   pnpm --filter @kf/kf-schema-extractor cli \
 *     --root ../KingFusion3.6_Center/sdb --mode inventory --output .private/inventory.json
 *
 * 安全约束：
 *  - 绝不打印工程名、绝不打印字段值；
 *  - 拒绝把输出写到 tests/fixtures 或任何已被 git 跟踪的文件；
 *  - --dry-run 只打印统计，不写任何文件。
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { inventory } from "./inventory.ts";
import { sanitizeProject } from "./sanitizer.ts";

type CliMode = "inventory" | "sanitize";

interface CliOptions {
  root: string;
  mode: CliMode;
  output: string | undefined;
  dryRun: boolean;
}

function parseCli(argv: string[]): CliOptions {
  const parsed = parseArgs({
    args: argv,
    options: {
      root: { type: "string" },
      mode: { type: "string", default: "inventory" },
      output: { type: "string" },
      "dry-run": { type: "boolean", default: false },
    },
  });
  const rawMode = parsed.values.mode ?? "inventory";
  if (rawMode !== "inventory" && rawMode !== "sanitize") {
    throw new Error(`invalid --mode '${rawMode}' (expected inventory|sanitize)`);
  }
  const mode: CliMode = rawMode;
  return {
    root: parsed.values.root ?? ".",
    mode,
    output: parsed.values.output,
    dryRun: parsed.values["dry-run"] ?? false,
  };
}

function workspaceRoot(cwd: string): string {
  let dir = cwd;
  for (;;) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(`cannot locate pnpm workspace root from ${cwd}`);
    }
    dir = parent;
  }
}

function isGitTracked(absPath: string, cwd: string): boolean {
  const result = spawnSync("git", ["ls-files", "--error-unmatch", "--", absPath], {
    cwd,
    encoding: "utf8",
  });
  return result.status === 0;
}

/**
 * 拒绝把输出写到 workspace 的 tests/fixtures 下或已被 git 跟踪的路径。
 */
function assertOutputAllowed(output: string, cwd: string): void {
  const abs = resolve(cwd, output);
  const fixturesAbs = join(workspaceRoot(cwd), "tests", "fixtures");
  if (abs === fixturesAbs || abs.startsWith(`${fixturesAbs}${sep}`)) {
    throw new Error(`refusing to write inside tests/fixtures: ${output}`);
  }
  if (isGitTracked(abs, cwd)) {
    throw new Error(`refusing to overwrite git-tracked file: ${output}`);
  }
}

function printInventoryReport(result: Awaited<ReturnType<typeof inventory>>): void {
  console.log("SDB inventory (structural only, no field values):");
  console.log(`  projects: ${result.projectCount}`);
  for (const mod of result.modules) {
    console.log(`  module ${mod.module}: ${mod.projectCount}`);
  }
  console.log(`  files: ${result.files.length}`);
  console.log(`  json fields: ${result.jsonFields.length}`);
  console.log(
    `  skipped: ${result.skipped} (symlinks: ${result.symlinksRejected}, ` +
      `outside-root: ${result.outsideRootRejected}, unreadable json: ${result.unreadableJson})`,
  );
}

async function runInventory(opts: CliOptions, cwd: string): Promise<number> {
  const result = await inventory(opts.root);
  printInventoryReport(result);
  if (opts.dryRun) {
    console.log("dry-run: no file written");
    return 0;
  }
  if (opts.output === undefined) {
    throw new Error("--output is required unless --dry-run is set");
  }
  assertOutputAllowed(opts.output, cwd);
  const outAbs = resolve(cwd, opts.output);
  await mkdir(dirname(outAbs), { recursive: true });
  await writeFile(outAbs, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(`wrote inventory to ${opts.output}`);
  return 0;
}

async function runSanitize(opts: CliOptions, cwd: string): Promise<number> {
  const result = await inventory(opts.root);
  let jsonFiles = 0;
  let findings = 0;
  let bytes = 0;
  for (const file of result.files) {
    if (file.extension !== ".json") {
      continue;
    }
    jsonFiles += 1;
    const abs = join(result.root, file.path);
    const text = await readFile(abs, "utf8");
    const sanitized = sanitizeProject(text);
    findings += sanitized.findings.length;
    bytes += sanitized.byteSize;
    if (!opts.dryRun) {
      if (opts.output === undefined) {
        throw new Error("--output is required unless --dry-run is set");
      }
      assertOutputAllowed(opts.output, cwd);
      const outAbs = join(resolve(cwd, opts.output), file.path);
      await mkdir(dirname(outAbs), { recursive: true });
      await writeFile(outAbs, `${sanitized.content}\n`, "utf8");
    }
  }
  console.log("SDB sanitize (values redacted, keys preserved):");
  console.log(`  json files: ${jsonFiles}`);
  console.log(`  secret findings: ${findings}`);
  console.log(`  output bytes: ${bytes}`);
  if (opts.dryRun) {
    console.log("dry-run: no file written");
  } else {
    console.log(`wrote sanitized corpus to ${opts.output}`);
  }
  return 0;
}

async function main(argv: string[]): Promise<number> {
  const opts = parseCli(argv);
  const cwd = process.cwd();
  if (opts.mode === "inventory") {
    return await runInventory(opts, cwd);
  }
  return await runSanitize(opts, cwd);
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`kf-schema-extractor: ${message}`);
    process.exitCode = 1;
  },
);
