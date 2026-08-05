/**
 * CLI：只读 SDB 盘点与脱敏流水线。
 *
 * 用法：
 *   pnpm --filter @kf/kf-schema-extractor cli \
 *     --root ../KingFusion3.6_Center/sdb --mode inventory --output .private/inventory.json
 *
 * 安全约束：
 *  - 绝不打印工程名、绝不打印字段值；
 *  - 拒绝把输出写到 tests/fixtures（含大小写变体/symlink 目录）或任何 git 跟踪目录；
 *  - sanitize 对无法解析或无法读取的 JSON 跳过并计数上报，绝不把原文写入脱敏产物；
 *  - --dry-run 只打印统计，不写任何文件。
 */

import { existsSync, realpathSync } from "node:fs";
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

/** 输出路径向上最近的、真实存在的祖先目录。 */
function nearestExistingDir(absPath: string): string {
  let dir = dirname(absPath);
  while (!existsSync(dir)) {
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error(`no existing parent directory for ${absPath}`);
    }
    dir = parent;
  }
  return dir;
}

function gitCheckIgnore(absPath: string, cwd: string): boolean {
  const result = spawnSync("git", ["check-ignore", "-q", "--", absPath], { cwd, encoding: "utf8" });
  return result.status === 0;
}

/** 目录（真实存在）下已 git 跟踪的文件列表；仓库外或非仓库路径返回空数组。 */
function gitTrackedFilesUnder(dir: string, cwd: string): string[] {
  const result = spawnSync("git", ["ls-files", "--", dir], { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    return [];
  }
  return result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function realpathOrNull(path: string): string | null {
  try {
    return realpathSync(path);
  } catch {
    return null;
  }
}

function isWithin(child: string, parent: string): boolean {
  return child === parent || child.startsWith(`${parent}${sep}`);
}

/**
 * 拒绝把输出写到 workspace 的 tests/fixtures（realpath 归一化 + 大小写不敏感兜底，
 * 覆盖大小写变体与 symlink 目录绕过）或任何 git 跟踪目录下的新文件。
 * gitignored 的产出目录（.private/、raw-corpus/、sanitized-golden/）与仓库外路径允许。
 */
function assertOutputAllowed(output: string, cwd: string): void {
  const abs = resolve(cwd, output);
  const fixturesAbs = join(workspaceRoot(cwd), "tests", "fixtures");

  // 1) tests/fixtures：realpath 归一化（解析磁盘真实大小写与符号链接）后再比较
  const nearest = nearestExistingDir(abs);
  const nearestReal = realpathOrNull(nearest);
  const fixturesReal = realpathOrNull(fixturesAbs);
  if (
    nearestReal !== null &&
    fixturesReal !== null &&
    isWithin(nearestReal, fixturesReal)
  ) {
    throw new Error(`refusing to write inside tests/fixtures: ${output}`);
  }
  // 大小写不敏感兜底（Windows NTFS / macOS APFS 均为大小写不敏感文件系统）
  if (
    isWithin(abs.toLowerCase(), fixturesAbs.toLowerCase())
  ) {
    throw new Error(`refusing to write inside tests/fixtures: ${output}`);
  }

  // 2) git 跟踪目录：未被 .gitignore 忽略的新文件若落入已有 git 跟踪内容的目录则拒绝
  if (!gitCheckIgnore(abs, cwd)) {
    const tracked = gitTrackedFilesUnder(nearest, cwd);
    if (tracked.length > 0) {
      throw new Error(`refusing to write inside git-tracked directory: ${output}`);
    }
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
  let outputAbs: string | undefined;
  if (!opts.dryRun) {
    if (opts.output === undefined) {
      throw new Error("--output is required unless --dry-run is set");
    }
    assertOutputAllowed(opts.output, cwd);
    outputAbs = resolve(cwd, opts.output);
  }

  let jsonFiles = 0;
  let findings = 0;
  let bytes = 0;
  let skippedUnreadable = 0;
  for (const file of result.files) {
    if (file.extension !== ".json") {
      continue;
    }
    jsonFiles += 1;
    const abs = join(result.root, file.path);
    let text: string;
    try {
      text = await readFile(abs, "utf8");
    } catch {
      skippedUnreadable += 1;
      continue;
    }
    const sanitized = sanitizeProject(text);
    if (sanitized.parseFailed) {
      // 无法解析的 JSON 可能含未脱敏原文，绝不写入脱敏产物
      skippedUnreadable += 1;
      continue;
    }
    findings += sanitized.findings.length;
    bytes += sanitized.byteSize;
    if (outputAbs !== undefined) {
      const outAbs = join(outputAbs, file.path);
      await mkdir(dirname(outAbs), { recursive: true });
      await writeFile(outAbs, `${sanitized.content}\n`, "utf8");
    }
  }
  console.log("SDB sanitize (values redacted, keys preserved):");
  console.log(`  json files: ${jsonFiles}`);
  console.log(`  secret findings: ${findings}`);
  console.log(`  output bytes: ${bytes}`);
  console.log(`  skipped-unreadable: ${skippedUnreadable}`);
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
