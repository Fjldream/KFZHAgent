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

      const adopted = await this.adoptStoredAsset({
        tenantId: input.tenantId,
        workspaceId: input.workspaceId,
        stored,
        metadata,
        name,
        tags,
      });
      if (adopted.adopted === "duplicate") {
        await this.cleanupUnadoptedAsset(input.tenantId, input.workspaceId, stored.artifactId);
        return toCatalogItem(adopted.row);
      }
      return toCatalogItem(adopted.row);
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
   * Storage happens before this transaction, but adoption never does: all
   * writers and workspace deletion serialize through this exact row lock.
   * Consequently a delete that wins between storage and adoption leaves no
   * asset row, and the outer catch can conservatively reclaim its blob.
   */
  private async adoptStoredAsset(input: {
    tenantId: string;
    workspaceId: string;
    stored: StoredArtifact;
    metadata: { mediaType: "image/png" | "image/jpeg" | "image/webp"; width: number; height: number };
    name: string;
    tags: string[];
  }): Promise<{ adopted: "created" | "duplicate"; row: {
    id: string; type: string; name: string; mediaType: string; sizeBytes: number;
    width: number | null; height: number | null; tags: unknown; createdAt: Date;
  } }> {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`
        SELECT "id" /* kf_workspace_asset_lock */
        FROM "SolutionWorkspace"
        WHERE "id" = ${input.workspaceId}
          AND "tenantId" = ${input.tenantId}
        FOR UPDATE
      `;
      if (locked[0] === undefined) throw new NotFoundException("workspace");

      const duplicate = await tx.workspaceAsset.findFirst({
        where: { tenantId: input.tenantId, workspaceId: input.workspaceId, sha256: input.stored.sha256 },
      });
      if (duplicate !== null) return { adopted: "duplicate" as const, row: duplicate };
      try {
        const created = await tx.workspaceAsset.create({
          data: {
            tenantId: input.tenantId,
            workspaceId: input.workspaceId,
            type: "image",
            name: input.name,
            mediaType: input.metadata.mediaType,
            storageKey: input.stored.artifactId,
            sha256: input.stored.sha256,
            sizeBytes: input.stored.size,
            width: input.metadata.width,
            height: input.metadata.height,
            tags: input.tags,
          },
        });
        return { adopted: "created" as const, row: created };
      } catch (error) {
        // This fallback only handles a transaction that lost a unique race
        // outside a serializable local lock (for example after deployment to
        // a non-PostgreSQL test double). It still never selects "latest".
        if (!isUniqueViolation(error)) throw error;
        const concurrent = await tx.workspaceAsset.findFirst({
          where: { tenantId: input.tenantId, workspaceId: input.workspaceId, sha256: input.stored.sha256 },
        });
        if (concurrent !== null) return { adopted: "duplicate" as const, row: concurrent };
        throw error;
      }
    });
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
  if (!hasCompleteImageContainer(mediaType, bytes)) {
    throw new UnprocessableEntityException("ASSET_INVALID_CONTAINER");
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

/**
 * `image-size` deliberately reads only enough metadata to report dimensions.
 * That is useful after, but never instead of, container validation: every
 * accepted image must terminate at EOF with its format's declared boundaries.
 */
function hasCompleteImageContainer(
  mediaType: "image/png" | "image/jpeg" | "image/webp",
  bytes: Buffer,
): boolean {
  switch (mediaType) {
    case "image/png":
      return isCompletePng(bytes);
    case "image/jpeg":
      return isCompleteJpeg(bytes);
    case "image/webp":
      return isCompleteWebp(bytes);
  }
}

function isCompletePng(bytes: Buffer): boolean {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (bytes.length < signature.length + 12 || !bytes.subarray(0, 8).equals(signature)) return false;
  let offset = signature.length;
  let sawIhdr = false;
  let sawIdat = false;
  while (offset < bytes.length) {
    if (offset + 12 > bytes.length) return false;
    const length = bytes.readUInt32BE(offset);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const crcEnd = dataEnd + 4;
    if (dataEnd < dataStart || crcEnd > bytes.length) return false;
    const type = bytes.subarray(offset + 4, offset + 8);
    if (!isPngChunkType(type) || crc32(bytes.subarray(offset + 4, dataEnd)) !== bytes.readUInt32BE(dataEnd)) {
      return false;
    }
    const typeName = type.toString("ascii");
    if (!sawIhdr) {
      if (typeName !== "IHDR" || length !== 13) return false;
      if (bytes.readUInt32BE(dataStart) === 0 || bytes.readUInt32BE(dataStart + 4) === 0) return false;
      sawIhdr = true;
    } else if (typeName === "IHDR") {
      return false;
    }
    if (typeName === "IDAT") sawIdat = true;
    if (typeName === "IEND") return length === 0 && sawIdat && crcEnd === bytes.length;
    offset = crcEnd;
  }
  return false;
}

function isPngChunkType(type: Buffer): boolean {
  return type.length === 4 && [...type].every((byte) =>
    (byte >= 0x41 && byte <= 0x5a) || (byte >= 0x61 && byte <= 0x7a),
  );
}

function isCompleteJpeg(bytes: Buffer): boolean {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return false;
  let offset = 2;
  let frameComponents: Set<number> | undefined;
  let sawSos = false;
  let sawEntropyScan = false;
  while (offset < bytes.length) {
    const markerStart = consumeJpegMarker(bytes, offset);
    if (markerStart === undefined) return false;
    const marker = bytes[markerStart + 1]!;
    offset = markerStart + 2;
    if (marker === 0xd9) return frameComponents !== undefined && sawSos && sawEntropyScan && offset === bytes.length;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) return false;
    const segmentLength = bytes.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return false;
    const dataStart = offset + 2;
    const dataEnd = offset + segmentLength;
    if (isJpegStartOfFrame(marker)) {
      if (frameComponents !== undefined) return false;
      frameComponents = validateJpegFrame(bytes.subarray(dataStart, dataEnd));
      if (frameComponents === undefined) return false;
    }
    if (marker === 0xda && (frameComponents === undefined || !isValidJpegSos(bytes.subarray(dataStart, dataEnd), frameComponents))) {
      return false;
    }
    offset = dataEnd;
    if (marker === 0xda) {
      sawSos = true;
      const scanEnd = consumeJpegScan(bytes, offset);
      if (scanEnd === undefined) return false;
      if (scanEnd.hasEntropy) sawEntropyScan = true;
      if (bytes[scanEnd.offset] === 0xff && bytes[scanEnd.offset + 1] === 0xd9) {
        return frameComponents !== undefined && sawSos && sawEntropyScan && scanEnd.offset + 2 === bytes.length;
      }
      offset = scanEnd.offset;
    }
  }
  return false;
}

function consumeJpegMarker(bytes: Buffer, offset: number): number | undefined {
  if (bytes[offset] !== 0xff) return undefined;
  let cursor = offset;
  while (bytes[cursor] === 0xff) cursor += 1;
  if (cursor >= bytes.length || bytes[cursor] === 0x00) return undefined;
  return cursor - 1;
}

function validateJpegFrame(segment: Buffer): Set<number> | undefined {
  // precision(1), height(2), width(2), component-count(1), component specs.
  if (segment.length < 9 || segment.readUInt16BE(1) === 0 || segment.readUInt16BE(3) === 0) return undefined;
  const count = segment[5]!;
  if (count === 0 || count > 4 || segment.length !== 6 + count * 3) return undefined;
  const components = new Set<number>();
  for (let index = 0; index < count; index += 1) {
    const offset = 6 + index * 3;
    const id = segment[offset]!;
    const sampling = segment[offset + 1]!;
    const quantizationTable = segment[offset + 2]!;
    if (id === 0 || components.has(id) || sampling === 0 || quantizationTable > 3) return undefined;
    components.add(id);
  }
  return components;
}

function isValidJpegSos(segment: Buffer, frameComponents: ReadonlySet<number>): boolean {
  // component-count(1), selector pairs, spectral start/end, approximation.
  if (segment.length < 6) return false;
  const count = segment[0]!;
  if (count === 0 || count > frameComponents.size || segment.length !== 4 + count * 2) return false;
  const selected = new Set<number>();
  for (let index = 0; index < count; index += 1) {
    const offset = 1 + index * 2;
    const componentId = segment[offset]!;
    const tableSelector = segment[offset + 1]!;
    if (!frameComponents.has(componentId) || selected.has(componentId) || (tableSelector >> 4) > 3 || (tableSelector & 0x0f) > 3) {
      return false;
    }
    selected.add(componentId);
  }
  // The remaining three bytes are spectral/approximation controls. Their
  // presence is guaranteed by exact segment length; permissive values retain
  // compatibility with existing progressive fixtures while component selector
  // structure and actual entropy data remain mandatory.
  return true;
}

function consumeJpegScan(bytes: Buffer, offset: number): { offset: number; hasEntropy: boolean } | undefined {
  let cursor = offset;
  let hasEntropy = false;
  while (cursor < bytes.length) {
    if (bytes[cursor] !== 0xff) {
      hasEntropy = true;
      cursor += 1;
      continue;
    }
    let marker = cursor + 1;
    while (bytes[marker] === 0xff) marker += 1;
    if (marker >= bytes.length) return undefined;
    const value = bytes[marker]!;
    if (value === 0x00) {
      hasEntropy = true;
      cursor = marker + 1;
      continue;
    }
    if (value >= 0xd0 && value <= 0xd7) {
      cursor = marker + 1;
      continue;
    }
    return { offset: marker - 1, hasEntropy };
  }
  return undefined;
}

function isJpegStartOfFrame(marker: number): boolean {
  return marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
}

function isCompleteWebp(bytes: Buffer): boolean {
  if (bytes.length < 20 || !bytes.subarray(0, 4).equals(Buffer.from("RIFF")) || !bytes.subarray(8, 12).equals(Buffer.from("WEBP"))) {
    return false;
  }
  if (bytes.readUInt32LE(4) + 8 !== bytes.length) return false;
  let offset = 12;
  let imageChunks = 0;
  while (offset < bytes.length) {
    if (offset + 8 > bytes.length) return false;
    const type = bytes.subarray(offset, offset + 4).toString("ascii");
    const length = bytes.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd < dataStart || dataEnd > bytes.length) return false;
    if (type === "VP8 " || type === "VP8L") {
      imageChunks += 1;
      if (!hasValidWebpBitstream(type, bytes.subarray(dataStart, dataEnd))) return false;
    }
    offset = dataEnd + (length % 2);
    if (offset > bytes.length) return false;
  }
  return offset === bytes.length && imageChunks === 1;
}

function hasValidWebpBitstream(type: string, bytes: Buffer): boolean {
  if (type === "VP8 ") {
    return bytes.length >= 10 && bytes.subarray(3, 6).equals(Buffer.from([0x9d, 0x01, 0x2a]));
  }
  return bytes.length >= 5 && bytes[0] === 0x2f;
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Buffer): number {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC32_TABLE[(value ^ byte) & 0xff]! ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
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
