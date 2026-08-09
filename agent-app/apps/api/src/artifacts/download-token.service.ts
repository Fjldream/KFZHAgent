import { Inject, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import type { ArtifactStorage } from "@kf/artifact-storage";
import {
  normalizeArtifactFileExtension,
  normalizeArtifactMediaType,
} from "@kf/contracts";
import { createHash, randomBytes } from "node:crypto";
import { PrismaService } from "../prisma/prisma.service.js";
import { ARTIFACT_STORAGE } from "./artifact-storage.js";

const DOWNLOAD_TOKEN_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Short-lived single-use artifact download tokens (brief Step 6). The token
 * is a random 256-bit secret; only its SHA-256 hash is stored. Each token is
 * bound to userId + tenantId + artifactId + expiration, and the file route
 * revalidates every binding (plus the active session) before streaming.
 */
@Injectable()
export class DownloadTokenService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ARTIFACT_STORAGE) private readonly storage: ArtifactStorage,
  ) {}

  async createToken(input: {
    tenantId: string;
    userId: string;
    artifactId: string;
  }): Promise<{
    token: string;
    expiresAt: Date;
    artifactId: string;
    mediaType: string;
    fileExtension: string;
    fileName: string;
  }> {
    const artifact = await this.resolveArtifact(input.tenantId, input.artifactId);
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + DOWNLOAD_TOKEN_TTL_MS);
    await this.prisma.downloadToken.create({
      data: {
        tenantId: input.tenantId,
        userId: input.userId,
        artifactId: input.artifactId,
        tokenHash: hashToken(token),
        expiresAt,
      },
    });
    return {
      token,
      expiresAt,
      artifactId: input.artifactId,
      mediaType: artifact.mediaType,
      fileExtension: artifact.fileExtension,
      fileName: artifactFileName(input.artifactId, artifact.fileExtension),
    };
  }

  /**
   * Revalidates every token binding and the artifact's tenant scope, then
   * atomically marks the token used (single-use) and opens the artifact
   * stream. Any mismatch or a reused/expired token is a 401.
   */
  async consume(input: {
    token: string;
    tenantId: string;
    userId: string;
  }): Promise<{
    stream: NodeJS.ReadableStream;
    fileName: string;
    artifactId: string;
    sizeBytes: number | null;
    mediaType: string;
    fileExtension: string;
  }> {
    const row = await this.prisma.downloadToken.findUnique({
      where: { tokenHash: hashToken(input.token) },
    });
    if (row === null || row.usedAt !== null || row.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException("download token is invalid, expired, or already used");
    }
    if (row.tenantId !== input.tenantId || row.userId !== input.userId) {
      throw new UnauthorizedException("download token does not match the active session");
    }
    const artifact = await this.resolveArtifact(input.tenantId, row.artifactId);

    // Atomic single-use claim: only one consumer can flip usedAt.
    const claimed = await this.prisma.downloadToken.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count === 0) {
      throw new UnauthorizedException("download token already used");
    }

    const stream = await this.storage.open(input.tenantId, artifact.storageKey);
    return {
      stream,
      fileName: artifactFileName(row.artifactId, artifact.fileExtension),
      artifactId: row.artifactId,
      sizeBytes: artifact.sizeBytes,
      mediaType: artifact.mediaType,
      fileExtension: artifact.fileExtension,
    };
  }

  /** The artifact must exist under the tenant via Artifact or DomainProjectRevision. */
  private async resolveArtifact(tenantId: string, artifactId: string): Promise<{
    storageKey: string;
    sizeBytes: number | null;
    mediaType: string;
    fileExtension: string;
  }> {
    const [artifact, domainProject] = await Promise.all([
      this.prisma.artifact.findFirst({
        where: { OR: [{ id: artifactId }, { storageKey: artifactId }], tenantId },
      }),
      this.prisma.domainProjectRevision.findFirst({ where: { packageUrl: artifactId, tenantId } }),
    ]);
    if (artifact === null && domainProject === null) {
      throw new NotFoundException("artifact");
    }
    return {
      storageKey: artifact?.storageKey ?? artifactId,
      sizeBytes: artifact?.sizeBytes ?? null,
      mediaType: normalizeArtifactMediaType(artifact?.mediaType ?? domainProject?.mediaType),
      fileExtension: normalizeArtifactFileExtension(
        artifact?.fileExtension ?? domainProject?.fileExtension,
      ),
    };
  }
}

function artifactFileName(artifactId: string, fileExtension: string): string {
  const safeBase = artifactId.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${safeBase}${normalizeArtifactFileExtension(fileExtension)}`;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
