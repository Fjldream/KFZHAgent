import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { link, mkdir, mkdtemp, open, lstat, realpath, rmdir, unlink, type FileHandle } from "node:fs/promises";
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
    unlinkStage?: (stagedPath: string) => Promise<void>;
    afterTargetPublished?: (targetPath: string, index: number) => Promise<void>;
    unlinkPublished?: (targetPath: string, dev: number | bigint, ino: number | bigint) => Promise<void>;
    writeStage?: (handle: FileHandle, bytes: Uint8Array) => Promise<void>;
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
  const publication = await publishAssets({
    workspaceRoot,
    versionRoot,
    assets: input.assets,
    ...(beforePublish === undefined ? {} : { beforePublish }),
    ...(afterStageBeforePublish === undefined ? {} : { afterStageBeforePublish }),
    ...(input.hooks?.unlinkStage === undefined ? {} : { unlinkStage: input.hooks.unlinkStage }),
    ...(input.hooks?.afterTargetPublished === undefined ? {} : { afterTargetPublished: input.hooks.afterTargetPublished }),
    ...(input.hooks?.unlinkPublished === undefined ? {} : { unlinkPublished: input.hooks.unlinkPublished }),
    ...(input.hooks?.writeStage === undefined ? {} : { writeStage: input.hooks.writeStage }),
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
      page.modified = true;
      await writePinnedFile(page.handle, bytes, `page rewrite ${page.file}`);
      await assertPageRewriteFileUnchanged(page);
    }
    await publication.commit();
  } catch (error) {
    await Promise.all([...pages.values()].map(async (page) => {
      if (!page.modified) return;
      await writePinnedFile(page.handle, page.originalBytes, `page rollback ${page.file}`).catch(() => {});
    }));
    await publication.rollback();
    throw error;
  } finally {
    await publication.close();
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
  originalBytes: Buffer;
  modified: boolean;
  doc: Record<string, unknown>;
};
type PublishedAsset = {
  bytes: Uint8Array;
  sha256: string;
  target: string;
  staged: string;
  stageHandle: FileHandle;
  targetHandle?: FileHandle;
  stageDev: number | bigint;
  stageIno: number | bigint;
  targetDev?: number | bigint;
  targetIno?: number | bigint;
  created: boolean;
};
type AssetPublication = {
  commit(): Promise<void>;
  rollback(): Promise<void>;
  close(): Promise<void>;
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
    const originalBytes = await handle.readFile();
    const doc = JSON.parse(originalBytes.toString("utf8")) as Record<string, unknown>;
    return { file, handle, dev: stat.dev, ino: stat.ino, ancestors, originalBytes, modified: false, doc };
  } catch (error) {
    await handle?.close().catch(() => {});
    await Promise.all(ancestors.map((ancestor) => ancestor.handle.close().catch(() => {})));
    throw error;
  }
}

async function writePinnedFile(handle: FileHandle, bytes: Uint8Array, label: string): Promise<void> {
  await handle.truncate(0);
  let offset = 0;
  while (offset < bytes.byteLength) {
    const result = await handle.write(bytes, offset, bytes.byteLength - offset, offset);
    if (result.bytesWritten < 1) throw new Error(`${label} made no progress`);
    offset += result.bytesWritten;
  }
  await handle.sync();
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
  unlinkStage?: (stagedPath: string) => Promise<void>;
  afterTargetPublished?: (targetPath: string, index: number) => Promise<void>;
  unlinkPublished?: (targetPath: string, dev: number | bigint, ino: number | bigint) => Promise<void>;
  writeStage?: (handle: FileHandle, bytes: Uint8Array) => Promise<void>;
}): Promise<AssetPublication> {
  // Node does not expose openat(2)/renameat(2) with a retained directory fd.
  // The strongest portable boundary available here is therefore: canonical
  // no-follow directory handles + dev/ino snapshots before/after publication,
  // a private exclusive staging directory, fsync, and exclusive hard-link
  // publication followed by an O_NOFOLLOW identity/hash verification.
  const directories: DirectorySnapshot[] = [];
  const targets: PublishedAsset[] = [];
  let stagingRoot: string | undefined;
  let stagingDirectory: DirectorySnapshot | undefined;
  let persistentDirectoryCount = 0;
  let ownershipTransferred = false;
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
    stagingDirectory = await openCanonicalDirectory(stagingRoot, "asset staging root");
    directories.push(stagingDirectory);
    for (const asset of input.assets) {
      const name = path.basename(asset.targetPath);
      const staged = path.join(stagingRoot, name);
      const handle = await open(staged, constants.O_CREAT | constants.O_EXCL | constants.O_RDWR | constants.O_NOFOLLOW, 0o644);
      const stat = await handle.stat();
      if (!stat.isFile() || stat.nlink !== 1 || stat.size !== 0) throw new Error(`unsafe new staged asset file: ${name}`);
      const tracked: PublishedAsset = {
        bytes: asset.bytes,
        sha256: asset.sha256,
        target: path.join(assetRoot, name),
        staged,
        stageHandle: handle,
        stageDev: stat.dev,
        stageIno: stat.ino,
        created: false,
      };
      // Register ownership immediately after O_EXCL open/fstat. Any partial
      // write, fsync, or canonical-check failure is then covered by the common
      // two-phase setup rollback and inode-owned staging cleanup.
      targets.push(tracked);
      await (input.writeStage ?? writeStageBytes)(handle, asset.bytes);
      await handle.sync();
      const writtenStat = await handle.stat();
      if (!writtenStat.isFile() || writtenStat.dev !== tracked.stageDev || writtenStat.ino !== tracked.stageIno
        || writtenStat.nlink !== 1 || writtenStat.size !== asset.bytes.byteLength) {
        throw new Error(`unsafe staged asset file: ${name}`);
      }
      await assertCanonicalPath(staged, `staged asset ${name}`);
    }

    await input.afterStageBeforePublish?.();
    for (const directory of directories) await assertDirectoryUnchanged(directory);
    for (const [index, target] of targets.entries()) {
      try {
        await link(target.staged, target.target);
        // Rollback ownership begins immediately after the successful link.
        // Keep the stable staged link until the page rewrite transaction commits.
        target.created = true;
      } catch (error) {
        if (!hasCode(error, "EEXIST")) throw error;
      }
      target.targetHandle = await openPublishedFile(target);
      await input.afterTargetPublished?.(target.target, index);
    }
    for (const directory of directories.slice(0, persistentDirectoryCount)) await assertDirectoryUnchanged(directory);
    let finalized = false;
    const publication: AssetPublication = {
      async commit() {
        if (finalized) return;
        for (const directory of directories.slice(0, persistentDirectoryCount)) await assertDirectoryUnchanged(directory);
        for (const target of targets) await assertPublishedFileUnchanged(target, "before-stage-unlink");
        for (const directory of directories.slice(0, persistentDirectoryCount)) await assertDirectoryUnchanged(directory);
        for (const target of targets) await assertPublishedFileUnchanged(target, "before-stage-unlink");
        for (const target of targets) await (input.unlinkStage ?? unlink)(target.staged);
        for (const directory of directories.slice(0, persistentDirectoryCount)) await assertDirectoryUnchanged(directory);
        for (const target of targets) await assertPublishedFileUnchanged(target, "committed");
        finalized = true;
      },
      async rollback() {
        if (finalized) return;
        const errors = await scrubAndUnlinkPublishedTargets(targets, input.unlinkPublished ?? unlinkIfOwned);
        finalized = true;
        if (errors.length > 0) throw new AggregateError(errors, "approved asset rollback was incomplete");
      },
      async close() {
        await Promise.all(targets.flatMap((target) => [
          target.stageHandle.close().catch(() => {}),
          target.targetHandle?.close().catch(() => {}) ?? Promise.resolve(),
        ]));
        await Promise.all(directories.map((directory) => directory.handle.close().catch(() => {})));
        if (stagingRoot !== undefined && stagingDirectory !== undefined) {
          await cleanupOwnedStagingRoot(stagingRoot, stagingDirectory, targets).catch(() => {});
        }
      },
    };
    ownershipTransferred = true;
    return publication;
  } catch (error) {
    const rollbackErrors = await scrubAndUnlinkPublishedTargets(targets, input.unlinkPublished ?? unlinkIfOwned);
    if (rollbackErrors.length > 0) {
      throw new AggregateError([error, ...rollbackErrors], "asset publication setup and rollback failed");
    }
    throw error;
  } finally {
    // On success ownership transfers to AssetPublication and remains live
    // through page rewrite. On setup failure close and clean locally.
    if (!ownershipTransferred) {
      await Promise.all(targets.flatMap((target) => [
        target.stageHandle.close().catch(() => {}),
        target.targetHandle?.close().catch(() => {}) ?? Promise.resolve(),
      ]));
      await Promise.all(directories.map((directory) => directory.handle.close().catch(() => {})));
      if (stagingRoot !== undefined && stagingDirectory !== undefined) {
        await cleanupOwnedStagingRoot(stagingRoot, stagingDirectory, targets).catch(() => {});
      }
    }
  }
}

async function writeStageBytes(handle: FileHandle, bytes: Uint8Array): Promise<void> {
  await handle.writeFile(bytes);
}

async function scrubAndUnlinkPublishedTargets(
  targets: readonly PublishedAsset[],
  unlinkOwned: (targetPath: string, dev: number | bigint, ino: number | bigint) => Promise<void>,
): Promise<unknown[]> {
  const errors: unknown[] = [];
  // Scrub every retained staged inode before attempting any pathname cleanup.
  // A failure unlinking one target must never leave approved bytes in another.
  for (const target of targets) {
    try {
      const stageStat = await target.stageHandle.stat();
      if (!stageStat.isFile() || stageStat.dev !== target.stageDev || stageStat.ino !== target.stageIno
        || (target.created && (target.targetDev !== target.stageDev || target.targetIno !== target.stageIno))) {
        throw new Error(`lost rollback ownership of published asset: ${target.target}`);
      }
      await target.stageHandle.truncate(0);
      await target.stageHandle.sync();
    } catch (error) {
      errors.push(error);
    }
  }
  for (const target of targets) {
    if (!target.created) continue;
    try {
      await unlinkOwned(target.target, target.targetDev ?? target.stageDev, target.targetIno ?? target.stageIno);
    } catch (error) {
      errors.push(error);
    }
  }
  return errors;
}

async function cleanupOwnedStagingRoot(
  stagingRoot: string,
  stagingDirectory: DirectorySnapshot,
  targets: readonly PublishedAsset[],
): Promise<void> {
  // Only remove the known files when their inode still matches our retained
  // stage. Never recursively remove a pathname that another process may have
  // replaced while the transaction was running.
  const errors: unknown[] = [];
  for (const target of targets) {
    try { await unlinkIfOwned(target.staged, target.stageDev, target.stageIno); }
    catch (error) { errors.push(error); }
  }
  try {
    const stat = await lstat(stagingRoot);
    if (!stat.isSymbolicLink() && stat.isDirectory()
      && stat.dev === stagingDirectory.dev && stat.ino === stagingDirectory.ino) {
      await rmdir(stagingRoot);
    }
  } catch (error) {
    if (!hasCode(error, "ENOENT")) errors.push(error);
  }
  if (errors.length > 0) throw new AggregateError(errors, "owned asset staging cleanup was incomplete");
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

async function openPublishedFile(target: PublishedAsset): Promise<FileHandle> {
  await assertCanonicalPath(target.target, "published asset");
  const handle = await open(target.target, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    const expectedLinks = target.created ? 2 : 1;
    if (!stat.isFile() || stat.nlink !== expectedLinks) {
      throw new Error(`asset target hard-link or special-file collision: ${target.target}`);
    }
    const existing = await handle.readFile();
    const actual = createHash("sha256").update(existing).digest("hex");
    if (actual !== target.sha256 || existing.byteLength !== target.bytes.byteLength) {
      throw new Error(`asset target checksum collision: ${target.target}`);
    }
    const pathStat = await lstat(target.target);
    if (pathStat.dev !== stat.dev || pathStat.ino !== stat.ino) {
      throw new Error(`asset target identity changed: ${target.target}`);
    }
    if (target.created && (stat.dev !== target.stageDev || stat.ino !== target.stageIno)) {
      throw new Error(`published asset lost its staging identity: ${target.target}`);
    }
    target.targetDev = stat.dev;
    target.targetIno = stat.ino;
    return handle;
  } catch (error) {
    await handle.close();
    throw error;
  }
}

async function assertPublishedFileUnchanged(
  target: PublishedAsset,
  phase: "before-stage-unlink" | "committed",
): Promise<void> {
  if (target.targetHandle === undefined || target.targetDev === undefined || target.targetIno === undefined) {
    throw new Error(`published asset has no retained identity: ${target.target}`);
  }
  const expectedTargetLinks = target.created && phase === "before-stage-unlink" ? 2 : 1;
  const stat = await target.targetHandle.stat();
  if (!stat.isFile() || stat.dev !== target.targetDev || stat.ino !== target.targetIno || stat.nlink !== expectedTargetLinks) {
    throw new Error(`published asset identity changed during transaction: ${target.target}`);
  }
  const pathStat = await lstat(target.target);
  if (pathStat.isSymbolicLink() || !pathStat.isFile()
    || pathStat.dev !== target.targetDev || pathStat.ino !== target.targetIno) {
    throw new Error(`published asset path changed during transaction: ${target.target}`);
  }
  const stageStat = await target.stageHandle.stat();
  const expectedStageLinks = phase === "before-stage-unlink" ? (target.created ? 2 : 1) : (target.created ? 1 : 0);
  if (!stageStat.isFile() || stageStat.dev !== target.stageDev || stageStat.ino !== target.stageIno
    || stageStat.nlink !== expectedStageLinks) {
    throw new Error(`staged asset handle changed during transaction: ${target.staged}`);
  }
  if (phase === "before-stage-unlink") {
    const stagedStat = await lstat(target.staged);
    if (!stagedStat.isFile() || stagedStat.dev !== target.stageDev || stagedStat.ino !== target.stageIno) {
      throw new Error(`staged asset identity changed during transaction: ${target.staged}`);
    }
  } else {
    try {
      await lstat(target.staged);
      throw new Error(`staged asset link remained after commit: ${target.staged}`);
    } catch (error) {
      if (!hasCode(error, "ENOENT")) throw error;
    }
  }
}

async function unlinkIfOwned(target: string, dev: number | bigint, ino: number | bigint): Promise<void> {
  try {
    const stat = await lstat(target);
    if (!stat.isSymbolicLink() && stat.dev === dev && stat.ino === ino) await unlink(target);
  } catch (error) {
    if (!hasCode(error, "ENOENT")) throw error;
  }
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
