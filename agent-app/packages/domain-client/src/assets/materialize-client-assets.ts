import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { link, mkdir, mkdtemp, open, lstat, realpath, rm, unlink, type FileHandle } from "node:fs/promises";
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
  /** Deterministic race injection used only by filesystem security tests. */
  hooks?: {
    beforePublish?: () => Promise<void>;
    afterStageBeforePublish?: () => Promise<void>;
    afterPublishBeforeRewrite?: () => Promise<void>;
  };
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
  for (const binding of bindings) {
    const asset = byAssetId.get(binding.assetId)!;
    if (binding.targetPath !== asset.targetPath
      || binding.mediaType !== asset.mediaType
      || binding.sha256 !== asset.sha256
      || binding.sizeBytes !== asset.bytes.byteLength) {
      throw new Error(`signed asset binding does not match verified bytes: ${binding.assetId}`);
    }
  }

  const workspaceRoot = await realpath(input.workspaceRoot);
  const versionDir = await resolveVersionDirName(workspaceRoot);
  const versionRoot = versionDir === "." ? workspaceRoot : path.join(workspaceRoot, versionDir);
  const inspection = await inspectClientProject(input.workspaceRoot);
  const rewrites = bindings.map((binding) => resolveBoundImage(binding, parsed.data.workspaceId, inspection, byAssetId.get(binding.assetId)!));
  const beforePublish = input.hooks?.beforePublish;
  const afterStageBeforePublish = input.hooks?.afterStageBeforePublish;
  const published = await publishAssets({
    workspaceRoot,
    versionRoot,
    assets: input.assets,
    ...(beforePublish === undefined ? {} : { beforePublish }),
    ...(afterStageBeforePublish === undefined ? {} : { afterStageBeforePublish }),
  });
  const pages = new Map<string, PageRewriteFile>();
  try {
    await input.hooks?.afterPublishBeforeRewrite?.();
    for (const rewrite of rewrites) {
      let page = pages.get(rewrite.file);
      if (page === undefined) {
        page = await openPageRewriteFile(versionRoot, rewrite.file);
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
      await assertPageRewriteFileUnchanged(page);
      const bytes = Buffer.from(stableStringify(page.doc), "utf8");
      await page.handle.truncate(0);
      let offset = 0;
      while (offset < bytes.byteLength) {
        const result = await page.handle.write(bytes, offset, bytes.byteLength - offset, offset);
        if (result.bytesWritten < 1) throw new Error(`page rewrite made no progress: ${page.file}`);
        offset += result.bytesWritten;
      }
      await page.handle.sync();
      await assertPageRewriteFileUnchanged(page);
    }
  } catch (error) {
    await Promise.all(published.map((file) => unlink(file).catch(() => {})));
    throw error;
  } finally {
    await Promise.all([...pages.values()].map((page) => closePageRewriteFile(page)));
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

type DirectorySnapshot = { path: string; handle: FileHandle; dev: number | bigint; ino: number | bigint };
type PageRewriteFile = {
  file: string;
  handle: FileHandle;
  dev: number | bigint;
  ino: number | bigint;
  ancestors: DirectorySnapshot[];
  doc: Record<string, unknown>;
};

async function openPageRewriteFile(versionRoot: string, relativeFile: string): Promise<PageRewriteFile> {
  const segments = relativeFile.split("/");
  if (segments.length < 2 || segments.some((segment) => segment === "" || segment === "." || segment === ".." || segment.includes("\\"))) {
    throw new Error(`invalid page rewrite path: ${relativeFile}`);
  }
  const ancestors: DirectorySnapshot[] = [];
  let handle: FileHandle | undefined;
  try {
    let current = versionRoot;
    ancestors.push(await openCanonicalDirectory(current, "page version root"));
    for (const segment of segments.slice(0, -1)) {
      current = path.join(current, segment);
      ancestors.push(await openCanonicalDirectory(current, "page ancestor"));
    }
    const file = path.join(current, segments.at(-1)!);
    const entry = await lstat(file);
    if (entry.isSymbolicLink()) throw new Error(`page file must not be a symlink: ${relativeFile}`);
    if (!entry.isFile() || entry.nlink !== 1) throw new Error(`page file must be one regular file: ${relativeFile}`);
    await assertCanonicalPath(file, "page file");
    handle = await open(file, constants.O_RDWR | constants.O_NOFOLLOW);
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1 || stat.dev !== entry.dev || stat.ino !== entry.ino) {
      throw new Error(`page file identity changed while opening: ${relativeFile}`);
    }
    const doc = JSON.parse(await handle.readFile("utf8")) as Record<string, unknown>;
    return { file, handle, dev: stat.dev, ino: stat.ino, ancestors, doc };
  } catch (error) {
    await handle?.close().catch(() => {});
    await Promise.all(ancestors.map((ancestor) => ancestor.handle.close().catch(() => {})));
    throw error;
  }
}

async function assertPageRewriteFileUnchanged(page: PageRewriteFile): Promise<void> {
  for (const ancestor of page.ancestors) await assertDirectoryUnchanged(ancestor);
  const pathStat = await lstat(page.file);
  const handleStat = await page.handle.stat();
  if (pathStat.isSymbolicLink() || !pathStat.isFile() || pathStat.nlink !== 1
    || pathStat.dev !== page.dev || pathStat.ino !== page.ino
    || handleStat.dev !== page.dev || handleStat.ino !== page.ino) {
    throw new Error(`page file identity changed during rewrite: ${page.file}`);
  }
}

async function closePageRewriteFile(page: PageRewriteFile): Promise<void> {
  await page.handle.close().catch(() => {});
  await Promise.all(page.ancestors.map((ancestor) => ancestor.handle.close().catch(() => {})));
}

async function publishAssets(input: {
  workspaceRoot: string;
  versionRoot: string;
  assets: readonly DomainAssetInput[];
  beforePublish?: () => Promise<void>;
  afterStageBeforePublish?: () => Promise<void>;
}): Promise<string[]> {
  // Node does not expose openat(2)/renameat(2) with a retained directory fd.
  // The strongest portable boundary available here is therefore: canonical
  // no-follow directory handles + dev/ino snapshots before/after publication,
  // a private exclusive staging directory, fsync, and exclusive hard-link
  // publication followed by an O_NOFOLLOW identity/hash verification.
  const directories: DirectorySnapshot[] = [];
  const published: string[] = [];
  let stagingRoot: string | undefined;
  let persistentDirectoryCount = 0;
  try {
    directories.push(await openCanonicalDirectory(input.workspaceRoot, "workspace root"));
    directories.push(await openCanonicalDirectory(input.versionRoot, "workspace version root"));
    const staticRoot = path.join(input.versionRoot, "static");
    await mkdirExact(staticRoot);
    directories.push(await openCanonicalDirectory(staticRoot, "static asset root"));
    const assetRoot = path.join(staticRoot, "agent-assets");
    await mkdirExact(assetRoot);
    const assetDirectory = await openCanonicalDirectory(assetRoot, "agent asset root");
    directories.push(assetDirectory);
    const stagingParent = path.dirname(input.workspaceRoot);
    const stagingParentDirectory = await openCanonicalDirectory(stagingParent, "asset staging parent");
    directories.push(stagingParentDirectory);
    persistentDirectoryCount = directories.length;
    if (stagingParentDirectory.dev !== assetDirectory.dev) {
      throw new Error("asset staging and target must share a filesystem");
    }

    // The deterministic race boundary must run before approved bytes exist on
    // disk. If any retained ancestor moved, fail without creating a staging
    // directory whose original pathname could now refer to a replacement tree.
    await input.beforePublish?.();
    for (const directory of directories) await assertDirectoryUnchanged(directory);

    // Stage in an independently owned sibling of the disposable candidate.
    // A static/candidate subtree rename cannot move this cleanup pathname, and
    // the device check above preserves atomic hard-link publication semantics.
    stagingRoot = await mkdtemp(path.join(stagingParent, ".kf-agent-assets-stage-"));
    directories.push(await openCanonicalDirectory(stagingRoot, "asset staging root"));
    for (const asset of input.assets) {
      const name = path.basename(asset.targetPath);
      const staged = path.join(stagingRoot, name);
      const handle = await open(staged, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o644);
      try {
        await handle.writeFile(asset.bytes);
        await handle.sync();
        const stat = await handle.stat();
        if (!stat.isFile() || stat.nlink !== 1 || stat.size !== asset.bytes.byteLength) throw new Error(`unsafe staged asset file: ${name}`);
      } finally { await handle.close(); }
      await assertCanonicalPath(staged, `staged asset ${name}`);
    }

    await input.afterStageBeforePublish?.();
    for (const directory of directories) await assertDirectoryUnchanged(directory);
    for (const asset of input.assets) {
      const name = path.basename(asset.targetPath);
      const staged = path.join(stagingRoot, name);
      const target = path.join(assetRoot, name);
      try {
        await link(staged, target);
        await unlink(staged);
        published.push(target);
      } catch (error) {
        if (!hasCode(error, "EEXIST")) throw error;
      }
      await verifyPublishedFile(target, asset.bytes, asset.sha256);
    }
    for (const directory of directories.slice(0, persistentDirectoryCount)) await assertDirectoryUnchanged(directory);
    return published;
  } catch (error) {
    await Promise.all(published.map((file) => unlink(file).catch(() => {})));
    throw error;
  } finally {
    await Promise.all(directories.map((directory) => directory.handle.close().catch(() => {})));
    if (stagingRoot !== undefined) await rm(stagingRoot, { recursive: true, force: true }).catch(() => {});
  }
}

async function mkdirExact(target: string): Promise<void> {
  try { await mkdir(target, { mode: 0o755 }); }
  catch (error) { if (!hasCode(error, "EEXIST")) throw error; }
}

async function openCanonicalDirectory(target: string, label: string): Promise<DirectorySnapshot> {
  const entry = await lstat(target);
  if (entry.isSymbolicLink()) throw new Error(`${label} must not be a symlink`);
  if (!entry.isDirectory()) throw new Error(`${label} must be a real directory`);
  await assertCanonicalPath(target, label);
  const handle = await open(target, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  const stat = await handle.stat();
  if (!stat.isDirectory()) { await handle.close(); throw new Error(`${label} must be a directory`); }
  return { path: target, handle, dev: stat.dev, ino: stat.ino };
}

async function assertCanonicalPath(target: string, label: string): Promise<void> {
  const canonical = await realpath(target);
  if (canonical !== path.resolve(target)) throw new Error(`${label} has a non-canonical case alias or realpath`);
}

async function assertDirectoryUnchanged(snapshot: DirectorySnapshot): Promise<void> {
  await assertCanonicalPath(snapshot.path, "asset ancestor");
  const pathStat = await lstat(snapshot.path);
  const handleStat = await snapshot.handle.stat();
  if (pathStat.isSymbolicLink() || !pathStat.isDirectory()
    || pathStat.dev !== snapshot.dev || pathStat.ino !== snapshot.ino
    || handleStat.dev !== snapshot.dev || handleStat.ino !== snapshot.ino) {
    throw new Error(`asset ancestor identity changed during publish: ${snapshot.path}`);
  }
}

async function verifyPublishedFile(target: string, bytes: Uint8Array, sha256: string): Promise<void> {
  await assertCanonicalPath(target, "published asset");
  const handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1) throw new Error(`asset target hard-link or special-file collision: ${target}`);
    const existing = await handle.readFile();
    const actual = createHash("sha256").update(existing).digest("hex");
    if (actual !== sha256 || existing.byteLength !== bytes.byteLength) throw new Error(`asset target checksum collision: ${target}`);
    const pathStat = await lstat(target);
    if (pathStat.dev !== stat.dev || pathStat.ino !== stat.ino) throw new Error(`asset target identity changed: ${target}`);
  } finally { await handle.close(); }
}

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
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
  if (control.id !== binding.controlId) {
    throw new Error(`asset binding control identity mismatch: ${binding.entityId}`);
  }
  if (control.type !== "image" || control.capabilityId !== binding.capabilityId) {
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
