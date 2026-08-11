import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnprocessableEntityException,
} from "@nestjs/common";
import type { ArtifactStorage, StoredArtifact } from "@kf/artifact-storage";
import type { AssetRecord } from "@kf/contracts";
import { imageSize } from "image-size";
import { Transform } from "node:stream";
import { ARTIFACT_STORAGE } from "../artifacts/artifact-storage.js";
import { PrismaService } from "../prisma/prisma.service.js";

const DEFAULT_MAX_ASSET_BYTES = 20 * 1024 * 1024;
const ABSOLUTE_MAX_ASSET_BYTES = 50 * 1024 * 1024;

export type WorkspaceAssetCatalogItem = {
  id: string;
  type: string;
  name: string;
  mediaType: "image/png" | "image/jpeg" | "image/webp";
  sizeBytes: number;
  width: number;
  height: number;
  tags: string[];
  createdAt: Date;
};

export class MissingWorkspaceAssetsError extends NotFoundException {
  readonly missingAssetIds: string[];

  constructor(missingAssetIds: string[]) {
    super("workspace assets not found");
    this.missingAssetIds = missingAssetIds;
  }
}

class AssetTooLargeError extends Error {
  override name = "AssetTooLargeError";
  constructor() {
    super("ASSET_TOO_LARGE");
  }
}

/**
 * Tenant/workspace-scoped image registry. Upload bytes remain private in
 * ArtifactStorage: model- and web-facing records deliberately omit
 * `storageKey`, so an uploaded filename cannot become a filesystem path.
 */
@Injectable()
export class AssetService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ARTIFACT_STORAGE) private readonly storage: ArtifactStorage,
  ) {}

  async upload(input: {
    tenantId: string;
    workspaceId: string;
    stream: NodeJS.ReadableStream;
    name?: string;
    declaredMediaType?: string;
    tags?: string[];
    maxBytes?: number;
  }): Promise<WorkspaceAssetCatalogItem> {
    await this.requireWorkspace(input.tenantId, input.workspaceId);
    // Explicitly ignore the client-declared header: byte sniffing below is
    // authoritative for all accepted image types.
    void input.declaredMediaType;
    const inspection = new BoundedImageInspectionStream(sanitizeMaxBytes(input.maxBytes));
    const name = sanitizeAssetName(input.name);
    const tags = sanitizeTags(input.tags);
    let stored: StoredArtifact | undefined;

    try {
      stored = await this.storage.put({
        tenantId: input.tenantId,
        kind: "workspace-asset",
        stream: input.stream.pipe(inspection),
        maxBytes: inspection.maxBytes,
      });
      const metadata = inspectImage(inspection.bytes(), stored.size);

      // Content-addressed per workspace: an identical body returns its
      // existing logical asset, while the just-written unadopted blob is
      // removed conservatively below.
      const duplicate = await this.prisma.workspaceAsset.findFirst({
        where: {
          tenantId: input.tenantId,
          workspaceId: input.workspaceId,
          sha256: stored.sha256,
        },
      });
      if (duplicate !== null) {
        await this.cleanupUnadoptedAsset(input.tenantId, input.workspaceId, stored.artifactId);
        return toCatalogItem(duplicate);
      }

      try {
        const created = await this.prisma.workspaceAsset.create({
          data: {
            tenantId: input.tenantId,
            workspaceId: input.workspaceId,
            type: "image",
            name,
            mediaType: metadata.mediaType,
            storageKey: stored.artifactId,
            sha256: stored.sha256,
            sizeBytes: stored.size,
            width: metadata.width,
            height: metadata.height,
            tags,
          },
        });
        return toCatalogItem(created);
      } catch (error) {
        // A concurrent identical upload can win after our first lookup. The
        // unique index is the authority; return its adopted row if visible.
        if (isUniqueViolation(error)) {
          const concurrent = await this.prisma.workspaceAsset.findFirst({
            where: {
              tenantId: input.tenantId,
              workspaceId: input.workspaceId,
              sha256: stored.sha256,
            },
          });
          if (concurrent !== null) {
            await this.cleanupUnadoptedAsset(input.tenantId, input.workspaceId, stored.artifactId);
            return toCatalogItem(concurrent);
          }
        }
        throw error;
      }
    } catch (error) {
      if (stored !== undefined) {
        await this.cleanupUnadoptedAsset(input.tenantId, input.workspaceId, stored.artifactId);
      }
      if (error instanceof AssetTooLargeError || hasTooLargeCode(error)) {
        throw new PayloadTooLargeException("ASSET_TOO_LARGE");
      }
      throw error;
    }
  }

  async list(input: {
    tenantId: string;
    workspaceId: string;
  }): Promise<WorkspaceAssetCatalogItem[]> {
    await this.requireWorkspace(input.tenantId, input.workspaceId);
    const rows = await this.prisma.workspaceAsset.findMany({
      where: { tenantId: input.tenantId, workspaceId: input.workspaceId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return rows.map(toCatalogItem);
  }

  /**
   * Returns catalog-safe metadata in caller request order. The database read
   * is exactly one tenant/workspace-scoped query; unknown IDs are reported
   * precisely rather than silently treated as absent assets.
   */
  async resolveMany(input: {
    tenantId: string;
    workspaceId: string;
    assetIds: readonly string[];
  }): Promise<AssetRecord[]> {
    await this.requireWorkspace(input.tenantId, input.workspaceId);
    const orderedIds = uniqueStable(input.assetIds);
    if (orderedIds.length === 0) return [];
    const rows = await this.prisma.workspaceAsset.findMany({
      where: {
        tenantId: input.tenantId,
        workspaceId: input.workspaceId,
        id: { in: orderedIds },
      },
    });
    const byId = new Map(rows.map((row) => [row.id, toAssetRecord(row)]));
    const missingAssetIds = orderedIds.filter((id) => !byId.has(id));
    if (missingAssetIds.length > 0) throw new MissingWorkspaceAssetsError(missingAssetIds);
    return orderedIds.map((id) => byId.get(id)!);
  }

  private async requireWorkspace(tenantId: string, workspaceId: string): Promise<void> {
    const workspace = await this.prisma.solutionWorkspace.findFirst({
      where: { id: workspaceId, tenantId },
      select: { id: true },
    });
    if (workspace === null) throw new NotFoundException("workspace");
  }

  /**
   * A DB error after storage may mean a concurrent transaction actually
   * adopted this exact key. Only delete after a successful scoped lookup has
   * proved it unreferenced; lookup errors are deliberately retained blobs.
   */
  private async cleanupUnadoptedAsset(
    tenantId: string,
    workspaceId: string,
    storageKey: string,
  ): Promise<void> {
    let adopted: { id: string } | null;
    try {
      adopted = await this.prisma.workspaceAsset.findFirst({
        where: { tenantId, workspaceId, storageKey },
        select: { id: true },
      });
    } catch {
      return;
    }
    if (adopted !== null) return;
    await this.storage.delete(tenantId, storageKey).catch(() => {});
  }
}

class BoundedImageInspectionStream extends Transform {
  readonly maxBytes: number;
  #chunks: Buffer[] = [];
  #size = 0;

  constructor(maxBytes: number) {
    super();
    this.maxBytes = maxBytes;
  }

  override _transform(
    chunk: Buffer | string,
    _encoding: BufferEncoding,
    callback: (error?: Error | null, data?: Buffer) => void,
  ): void {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    this.#size += bytes.length;
    if (this.#size > this.maxBytes) {
      callback(new AssetTooLargeError());
      return;
    }
    this.#chunks.push(bytes);
    callback(null, bytes);
  }

  bytes(): Buffer {
    return Buffer.concat(this.#chunks, this.#size);
  }
}

function inspectImage(bytes: Buffer, storageSize: number): {
  mediaType: "image/png" | "image/jpeg" | "image/webp";
  width: number;
  height: number;
} {
  if (bytes.length === 0 || storageSize === 0) {
    throw new UnprocessableEntityException("ASSET_EMPTY");
  }
  const mediaType = sniffMediaType(bytes);
  if (mediaType === undefined) {
    throw new UnprocessableEntityException("ASSET_UNSUPPORTED_MEDIA");
  }
  let dimensions: { width?: number; height?: number; type?: string };
  try {
    dimensions = imageSize(bytes);
  } catch {
    throw new UnprocessableEntityException("ASSET_INVALID_DIMENSIONS");
  }
  const expectedImageType = mediaType === "image/jpeg" ? "jpg" : mediaType.slice("image/".length);
  const { width, height } = dimensions;
  if (
    dimensions.type !== expectedImageType ||
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width === undefined ||
    height === undefined ||
    width <= 0 ||
    height <= 0
  ) {
    throw new UnprocessableEntityException("ASSET_INVALID_DIMENSIONS");
  }
  return { mediaType, width, height };
}

function sniffMediaType(bytes: Buffer): "image/png" | "image/jpeg" | "image/webp" | undefined {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (bytes.length >= 12 && bytes.subarray(0, 4).equals(Buffer.from("RIFF")) && bytes.subarray(8, 12).equals(Buffer.from("WEBP"))) {
    return "image/webp";
  }
  return undefined;
}

function sanitizeMaxBytes(value: number | undefined): number {
  if (!Number.isFinite(value) || value === undefined || value <= 0) return DEFAULT_MAX_ASSET_BYTES;
  return Math.min(Math.floor(value), ABSOLUTE_MAX_ASSET_BYTES);
}

function sanitizeAssetName(value: string | undefined): string {
  const normalized = (value ?? "image").trim();
  if (normalized.length === 0 || normalized.length > 200 || /[\\/]/.test(normalized) || hasControlCharacter(normalized) || normalized === "." || normalized === "..") {
    throw new BadRequestException("ASSET_NAME_INVALID");
  }
  return normalized;
}

function sanitizeTags(tags: string[] | undefined): string[] {
  if (tags === undefined) return [];
  if (tags.length > 20) throw new BadRequestException("ASSET_TAGS_INVALID");
  return tags.map((tag) => {
    const normalized = typeof tag === "string" ? tag.trim() : "";
    if (normalized.length === 0 || normalized.length > 80 || hasControlCharacter(normalized)) {
      throw new BadRequestException("ASSET_TAGS_INVALID");
    }
    return normalized;
  });
}

function uniqueStable(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

function hasTooLargeCode(error: unknown): boolean {
  return error instanceof Error && error.message.includes("ARTIFACT_TOO_LARGE");
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error &&
    (error as { code?: string }).code === "P2002";
}

function hasControlCharacter(value: string): boolean {
  for (const char of value) {
    if (char.charCodeAt(0) < 0x20) return true;
  }
  return false;
}

function toCatalogItem(row: {
  id: string;
  type: string;
  name: string;
  mediaType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  tags: unknown;
  createdAt: Date;
}): WorkspaceAssetCatalogItem {
  if (row.width === null || row.height === null || !isAllowedMediaType(row.mediaType)) {
    throw new Error("invalid persisted workspace asset metadata");
  }
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    mediaType: row.mediaType,
    sizeBytes: row.sizeBytes,
    width: row.width,
    height: row.height,
    tags: Array.isArray(row.tags) && row.tags.every((tag) => typeof tag === "string") ? [...row.tags] : [],
    createdAt: row.createdAt,
  };
}

function toAssetRecord(row: {
  id: string;
  type: string;
  name: string;
  mediaType: string;
}): AssetRecord {
  if (row.type !== "image" || !isAllowedMediaType(row.mediaType)) {
    throw new Error("invalid persisted workspace asset metadata");
  }
  return {
    id: row.id,
    kind: "image",
    name: row.name,
    mimeType: row.mediaType,
    description: "Uploaded workspace image",
  };
}

function isAllowedMediaType(value: string): value is WorkspaceAssetCatalogItem["mediaType"] {
  return value === "image/png" || value === "image/jpeg" || value === "image/webp";
}
