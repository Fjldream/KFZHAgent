// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import { BadRequestException, HttpException, Inject, Injectable, NotFoundException, PayloadTooLargeException, ServiceUnavailableException, UnprocessableEntityException } from "@nestjs/common";
import type { ArtifactStorage, StoredArtifact } from "@kf/artifact-storage";
import type { ReferenceAsset, ReferenceAssetDerivative } from "@prisma/client";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { ARTIFACT_STORAGE } from "../artifacts/artifact-storage.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { MAX_REFERENCE_BYTES } from "./image-policy.js";
import { prepareReferenceImage, type PreparedReferenceImage } from "./reference-image.js";

type ReferenceRow = ReferenceAsset & { derivative: ReferenceAssetDerivative | null };
export type ReferenceAssetItem = {
  id: string; purpose: "reference"; name: string; sourceHash: string; derivativeHash: string;
  mimeType: "image/webp"; width: number; height: number; byteSize: number; createdAt: Date;
};
export type TrustedReferenceImage = {
  tenantId: string; workspaceId: string; assetId: string; sourceHash: string; derivativeHash: string;
  mimeType: "image/webp"; width: number; height: number; bytes: Uint8Array; scale: number;
};

@Injectable()
export class ReferenceAssetService {
  private activeUploads = 0;
  constructor(private readonly prisma: PrismaService, @Inject(ARTIFACT_STORAGE) private readonly storage: ArtifactStorage) {}

  async upload(input: { tenantId: string; workspaceId: string; stream: NodeJS.ReadableStream;
    name?: string; declaredMimeType?: string; signal?: AbortSignal }): Promise<ReferenceAssetItem> {
    await this.requireWorkspace(input.tenantId, input.workspaceId);
    const name = safeName(input.name);
    const quota = quotaBytes(); // Invalid deployment configuration fails before reading any pixels.
    if (this.activeUploads >= 2) throw new HttpException("REFERENCE_UPLOAD_BUSY", 429);
    this.activeUploads++;
    const stored: StoredArtifact[] = [];
    try {
      abortIfNeeded(input.signal);
      const source = await readBounded(input.stream, MAX_REFERENCE_BYTES, input.signal);
      let image: PreparedReferenceImage;
      try { image = await prepareReferenceImage(source, input.declaredMimeType); } catch (error) {
        if (error instanceof Error && error.message === "IMAGE_BYTES_EXCEEDED") throw new PayloadTooLargeException(error.message);
        throw new UnprocessableEntityException(error instanceof Error ? error.message : "IMAGE_INVALID");
      }
      abortIfNeeded(input.signal);
      for (const [kind, bytes] of [["reference-source", source], ["reference-derivative", image.bytes]] as const) {
        stored.push(await this.storage.put({ tenantId: input.tenantId, kind, stream: Readable.from([bytes]), maxBytes: MAX_REFERENCE_BYTES }));
        abortIfNeeded(input.signal);
      }
      const [original, derivative] = stored as [StoredArtifact, StoredArtifact];
      if (original.sha256 !== image.sourceHash || derivative.sha256 !== image.derivativeHash) throw new ServiceUnavailableException("REFERENCE_INTEGRITY_FAILED");
      const row = await this.prisma.$transaction(async tx => {
        // Quota is tenant-wide, including other workspaces. All reference writers take this lock first.
        await tx.$queryRaw`SELECT "id" FROM "Tenant" WHERE "id" = ${input.tenantId} FOR UPDATE`;
        const locked = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "SolutionWorkspace"
          WHERE "tenantId" = ${input.tenantId} AND "id" = ${input.workspaceId} FOR UPDATE`;
        if (!locked[0]) throw new NotFoundException("workspace");
        abortIfNeeded(input.signal);
        const duplicate = await tx.referenceAsset.findUnique({ where: { tenantId_workspaceId_sourceHash: {
          tenantId: input.tenantId, workspaceId: input.workspaceId, sourceHash: image.sourceHash } }, include: { derivative: true } });
        if (duplicate) return duplicate;
        const used = await tx.referenceAsset.aggregate({ where: { tenantId: input.tenantId }, _sum: { totalBytes: true } });
        const totalBytes = original.size + derivative.size;
        if ((used._sum.totalBytes ?? 0) + totalBytes > quota) throw new PayloadTooLargeException("REFERENCE_QUOTA_EXCEEDED");
        return tx.referenceAsset.create({ data: {
          tenantId: input.tenantId, workspaceId: input.workspaceId, name, mimeType: image.sourceMimeType,
          sourceHash: image.sourceHash, storageKey: original.artifactId, byteSize: original.size,
          width: image.transform.sourceWidth, height: image.transform.sourceHeight, totalBytes,
          derivative: { create: { derivativeHash: image.derivativeHash, mimeType: image.mimeType, storageKey: derivative.artifactId,
            byteSize: derivative.size, width: image.width, height: image.height, transform: image.transform } },
        }, include: { derivative: true } });
      });
      return catalogItem(row);
    } finally {
      // Handles duplicate writes and ambiguous commit acknowledgements conservatively: never delete an adopted blob.
      for (const blob of stored) await this.cleanupUnadopted(input.tenantId, blob.artifactId);
      this.activeUploads--;
    }
  }

  async resolve(tenantId: string, workspaceId: string, assetId: string): Promise<TrustedReferenceImage> {
    await this.requireWorkspace(tenantId, workspaceId);
    // Opaque server-issued ID only. No user URL, data URL, or filesystem path is ever opened.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(assetId)) throw new NotFoundException("reference asset");
    const row = await this.prisma.referenceAsset.findFirst({ where: { id: assetId, tenantId, workspaceId }, include: { derivative: true } });
    if (!row) throw new NotFoundException("reference asset");
    const item = catalogItem(row);
    const derivative = row.derivative!;
    let bytes: Buffer;
    try { bytes = await readBounded(await this.storage.open(tenantId, derivative.storageKey), MAX_REFERENCE_BYTES); }
    catch { throw new ServiceUnavailableException("REFERENCE_STORAGE_UNAVAILABLE"); }
    const transform = derivative.transform as Record<string, unknown> | null;
    if (bytes.length !== derivative.byteSize || createHash("sha256").update(bytes).digest("hex") !== item.derivativeHash ||
      transform?.version !== 1 || typeof transform.scale !== "number" || !Number.isFinite(transform.scale) || transform.scale <= 0 || transform.scale > 1) {
      throw new ServiceUnavailableException("REFERENCE_INTEGRITY_FAILED");
    }
    return { tenantId, workspaceId, assetId, sourceHash: item.sourceHash, derivativeHash: item.derivativeHash,
      mimeType: item.mimeType, width: item.width, height: item.height, bytes, scale: transform.scale };
  }

  private async requireWorkspace(tenantId: string, workspaceId: string): Promise<void> {
    if (!await this.prisma.solutionWorkspace.findFirst({ where: { tenantId, id: workspaceId }, select: { id: true } })) throw new NotFoundException("workspace");
  }
  private async cleanupUnadopted(tenantId: string, storageKey: string): Promise<void> {
    try {
      if (await this.prisma.referenceAsset.findFirst({ where: { tenantId, storageKey }, select: { id: true } }) ||
        await this.prisma.referenceAssetDerivative.findFirst({ where: { tenantId, storageKey }, select: { id: true } })) return;
      await this.storage.delete(tenantId, storageKey);
    } catch { /* DB unavailable or commit uncertain: retain the blob, never delete potentially referenced bytes. */ }
  }
}

function catalogItem(row: ReferenceRow): ReferenceAssetItem {
  const derivative = row.derivative;
  if (!derivative || derivative.mimeType !== "image/webp" || derivative.sourceHash !== row.sourceHash) throw new ServiceUnavailableException("REFERENCE_INTEGRITY_FAILED");
  return { id: row.id, purpose: "reference", name: row.name, sourceHash: row.sourceHash, derivativeHash: derivative.derivativeHash,
    mimeType: "image/webp", width: derivative.width, height: derivative.height, byteSize: derivative.byteSize, createdAt: row.createdAt };
}
function safeName(value?: string): string {
  const name = value?.trim() || "reference-image";
  if (name.length > 128 || name === "." || name === ".." || /[/\\]/.test(name) || [...name].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) {
    throw new BadRequestException("REFERENCE_NAME_INVALID");
  }
  return name;
}
function quotaBytes(): number {
  const value = process.env.AGENT_REFERENCE_QUOTA_BYTES;
  if (value === undefined || value === "") return 1024 * 1024 * 1024;
  const quota = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(quota) || quota < 1) throw new ServiceUnavailableException("REFERENCE_QUOTA_INVALID");
  return quota;
}
function abortIfNeeded(signal?: AbortSignal): void {
  if (signal?.aborted) throw new BadRequestException("IMAGE_UPLOAD_ABORTED");
}
/** Bounded buffering before decoding; never pipe an unbounded HTTP body into sharp. */
async function readBounded(stream: NodeJS.ReadableStream, limit: number, signal?: AbortSignal): Promise<Buffer> {
  abortIfNeeded(signal);
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    // Not destroying an HTTP IncomingMessage on early rejection allows a proper 413 response.
    const iterator = stream instanceof Readable ? stream.iterator({ destroyOnReturn: false }) : stream[Symbol.asyncIterator]();
    for await (const chunk of iterator) {
      abortIfNeeded(signal);
      const bytes: Buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
      size += bytes.length;
      if (size > limit) { stream.resume(); throw new PayloadTooLargeException("IMAGE_BYTES_EXCEEDED"); }
      chunks.push(bytes);
    }
  } catch (error) {
    if (error instanceof HttpException) throw error;
    throw new BadRequestException("IMAGE_UPLOAD_ABORTED");
  }
  abortIfNeeded(signal);
  return Buffer.concat(chunks, size);
}
// end
