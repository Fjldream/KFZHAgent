import { createHash } from "node:crypto";
import { mkdir, open, lstat, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  internalChangePlanSchema,
  type ChangePlanAssetBinding,
  type DomainAssetInput,
} from "@kf/contracts";
import { deriveGuid } from "../compile/guid-factory.js";
import { stableStringify } from "../compile/client-compiler.js";
import { inspectClientProject } from "../inspect/client-inspector.js";
import { resolveVersionDirName } from "../patch/change-scope.js";

const DEFAULT_MAX_AGGREGATE_BYTES = 100 * 1024 * 1024;
const SHA256 = /^[0-9a-f]{64}$/;
const TARGET = /^static\/agent-assets\/([0-9a-f]{64})\.(png|jpg|webp)$/;

export async function materializeClientAssets(input: {
  workspaceRoot: string;
  plan: unknown;
  assets: readonly DomainAssetInput[];
  maxAggregateBytes?: number;
}): Promise<void> {
  // Asset materialization is an internal extension of the long-lived patch API.
  // Preserve legacy callers that have neither approved bytes nor an own binding
  // field without forcing their already-validated plan through the newer schema.
  // Use the descriptor so an untrusted accessor is never executed by this guard.
  if (input.assets.length === 0 && !hasOwnDataAssetBindings(input.plan)) return;
  const parsed = internalChangePlanSchema.safeParse(input.plan);
  if (!parsed.success) throw new Error(`invalid internal asset plan: ${parsed.error.issues[0]?.message ?? "schema mismatch"}`);
  const bindings = parsed.data.assetBindings ?? [];
  if (bindings.length === 0) {
    if (input.assets.length > 0) throw new Error("unreferenced build assets");
    return;
  }

  const maxAggregate = input.maxAggregateBytes ?? DEFAULT_MAX_AGGREGATE_BYTES;
  if (!Number.isSafeInteger(maxAggregate) || maxAggregate < 0 || maxAggregate > DEFAULT_MAX_AGGREGATE_BYTES) {
    throw new Error("invalid asset aggregate size limit");
  }
  const byAssetId = new Map<string, DomainAssetInput>();
  const targetOwners = new Map<string, string>();
  let aggregate = 0;
  for (const asset of input.assets) {
    if (byAssetId.has(asset.assetId)) throw new Error(`duplicate asset input: ${asset.assetId}`);
    const target = validatedTarget(asset);
    const priorOwner = targetOwners.get(target);
    if (priorOwner !== undefined) throw new Error(`duplicate target collision: ${target}`);
    targetOwners.set(target, asset.assetId);
    byAssetId.set(asset.assetId, asset);
    aggregate += asset.bytes.byteLength;
    if (aggregate > maxAggregate) throw new Error("asset aggregate size exceeds materialization limit");
  }

  const referenced = new Set(bindings.map((binding) => binding.assetId));
  for (const assetId of referenced) {
    if (!byAssetId.has(assetId)) throw new Error(`missing approved asset bytes: ${assetId}`);
  }
  for (const assetId of byAssetId.keys()) {
    if (!referenced.has(assetId)) throw new Error(`unreferenced build asset: ${assetId}`);
  }

  const versionDir = await resolveVersionDirName(input.workspaceRoot);
  const versionRoot = versionDir === "." ? input.workspaceRoot : path.join(input.workspaceRoot, versionDir);
  await assertSafeDirectory(versionRoot, "workspace version root");
  const inspection = await inspectClientProject(input.workspaceRoot);
  const rewrites = bindings.map((binding) => resolveBoundImage(binding, parsed.data.workspaceId, inspection, byAssetId.get(binding.assetId)!));

  for (const asset of input.assets) {
    const target = path.join(versionRoot, ...asset.targetPath.split("/"));
    await ensureSafeAncestors(versionRoot, path.dirname(target));
    await writeExclusiveOrVerify(target, asset.bytes, asset.sha256);
  }

  const pages = new Map<string, { file: string; doc: Record<string, unknown> }>();
  for (const rewrite of rewrites) {
    let page = pages.get(rewrite.file);
    if (page === undefined) {
      const file = path.join(versionRoot, ...rewrite.file.split("/"));
      page = { file, doc: JSON.parse(await readFile(file, "utf8")) as Record<string, unknown> };
      pages.set(rewrite.file, page);
    }
    const control = findControl(page.doc, rewrite.guid);
    if (control === undefined) throw new Error(`bound image disappeared before materialization: ${rewrite.binding.entityId}`);
    const current = control["src"];
    if (current !== "asset"
      && current !== `static/agent-assets/pending-${rewrite.binding.assetId}`
      && current !== rewrite.targetPath) {
      throw new Error(`bound image has an unauthorized source: ${rewrite.binding.entityId}`);
    }
    control["src"] = rewrite.targetPath;
  }
  for (const page of pages.values()) {
    await writeFile(page.file, stableStringify(page.doc), { encoding: "utf8", flag: "w" });
  }
}

function hasOwnDataAssetBindings(plan: unknown): boolean {
  if (plan === null || typeof plan !== "object") return false;
  const descriptor = Object.getOwnPropertyDescriptor(plan, "assetBindings");
  if (descriptor === undefined) return false;
  if (!("value" in descriptor)) throw new Error("invalid internal asset plan: assetBindings must be a data property");
  return true;
}

function validatedTarget(asset: DomainAssetInput): string {
  if (!SHA256.test(asset.sha256)) throw new Error(`invalid asset checksum: ${asset.assetId}`);
  const expectedExtension = asset.mediaType === "image/png" ? "png"
    : asset.mediaType === "image/jpeg" ? "jpg"
      : asset.mediaType === "image/webp" ? "webp"
        : undefined;
  const match = TARGET.exec(asset.targetPath);
  if (expectedExtension === undefined || match === null || match[1] !== asset.sha256 || match[2] !== expectedExtension) {
    throw new Error(`invalid asset target path: ${asset.assetId}`);
  }
  if (!(asset.bytes instanceof Uint8Array) || asset.bytes.byteLength < 1) throw new Error(`invalid asset bytes: ${asset.assetId}`);
  const actual = createHash("sha256").update(asset.bytes).digest("hex");
  if (actual !== asset.sha256) throw new Error(`asset checksum mismatch: ${asset.assetId}`);
  return asset.targetPath;
}

async function assertSafeDirectory(target: string, label: string): Promise<void> {
  const entry = await lstat(target);
  if (entry.isSymbolicLink()) throw new Error(`${label} must not be a symlink`);
  if (!entry.isDirectory()) throw new Error(`${label} must be a directory`);
}

async function ensureSafeAncestors(root: string, targetDir: string): Promise<void> {
  const relative = path.relative(root, targetDir);
  if (relative === "" || relative === ".") return;
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("asset target path escapes workspace");
  let current = root;
  for (const segment of relative.split(path.sep)) {
    if (segment === "" || segment === "." || segment === "..") throw new Error("invalid asset target path segment");
    current = path.join(current, segment);
    try {
      await mkdir(current, { mode: 0o755 });
    } catch (error) {
      if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") throw error;
    }
    await assertSafeDirectory(current, `asset ancestor ${segment}`);
  }
}

async function writeExclusiveOrVerify(target: string, bytes: Uint8Array, sha256: string): Promise<void> {
  try {
    const handle = await open(target, "wx", 0o644);
    try { await handle.writeFile(bytes); }
    finally { await handle.close(); }
  } catch (error) {
    if (!(error instanceof Error) || !("code" in error) || error.code !== "EEXIST") throw error;
    const entry = await lstat(target);
    if (entry.isSymbolicLink() || !entry.isFile()) throw new Error(`asset target collision: ${target}`);
    const existing = await readFile(target);
    const actual = createHash("sha256").update(existing).digest("hex");
    if (actual !== sha256 || existing.byteLength !== bytes.byteLength) throw new Error(`asset target checksum collision: ${target}`);
  }
}

function resolveBoundImage(
  binding: ChangePlanAssetBinding,
  workspaceId: string,
  inspection: Awaited<ReturnType<typeof inspectClientProject>>,
  asset: DomainAssetInput,
): { binding: ChangePlanAssetBinding; guid: string; file: string; targetPath: string } {
  const direct = inspection.index.controls[binding.entityId];
  const derivedGuid = deriveGuid({ seed: workspaceId }, binding.entityId);
  const derived = inspection.index.controls[derivedGuid];
  const control = direct ?? derived;
  if (control === undefined) throw new Error(`asset binding target image is missing: ${binding.entityId}`);
  if (control.type !== "image" && control.capabilityId !== "image") {
    throw new Error(`asset binding target is not an image: ${binding.entityId}`);
  }
  const page = inspection.index.pages[control.pageGuid];
  if (page === undefined) throw new Error(`asset binding page is missing: ${binding.entityId}`);
  return { binding, guid: control.guid, file: page.file, targetPath: asset.targetPath };
}

function findControl(root: unknown, guid: string): Record<string, unknown> | undefined {
  const pending: unknown[] = [root];
  while (pending.length > 0) {
    const value = pending.pop();
    if (value === null || typeof value !== "object") continue;
    if (Array.isArray(value)) {
      for (const item of value as unknown[]) pending.push(item);
      continue;
    }
    const record = value as Record<string, unknown>;
    if (record["guid"] === guid) return record;
    for (const key of ["objects", "children", "layoutItems", "insiderObjects"]) {
      if (record[key] !== undefined) pending.push(record[key]);
    }
  }
  return undefined;
}
