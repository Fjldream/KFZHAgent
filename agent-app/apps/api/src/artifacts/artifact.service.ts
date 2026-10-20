import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Artifact, Prisma } from "@prisma/client";
import type { ArtifactStorage } from "@kf/artifact-storage";
import {
  normalizeArtifactFileExtension,
  normalizeArtifactMediaType,
} from "@kf/contracts";
import { PrismaService } from "../prisma/prisma.service.js";
import { ARTIFACT_STORAGE } from "./artifact-storage.js";

/**
 * 制品服务：记录与构建作业关联的制品记录，并代理租户范围的存储访问（打开/删除）。存储键是 ArtifactStorage.put 生成的不透明 ID；绝对路径绝不会越过该边界。
 */
@Injectable()
export class ArtifactService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ARTIFACT_STORAGE) private readonly storage: ArtifactStorage,
  ) {}

  async record(input: {
    tenantId: string;
    buildJobId: string;
    kind: string;
    mediaType?: string;
    fileExtension?: string;
    storageKey: string;
    sizeBytes?: number;
    sha256?: string;
  }): Promise<Artifact> {
    return this.prisma.artifact.create({
      data: {
        tenantId: input.tenantId,
        buildJobId: input.buildJobId,
        kind: input.kind,
        mediaType: normalizeArtifactMediaType(input.mediaType),
        fileExtension: normalizeArtifactFileExtension(input.fileExtension),
        storageKey: input.storageKey,
        ...(input.sizeBytes !== undefined ? { sizeBytes: input.sizeBytes } : {}),
        ...(input.sha256 !== undefined ? { sha256: input.sha256 } : {}),
      },
    });
  }

  async listForJob(tenantId: string, buildJobId: string): Promise<Artifact[]> {
    return this.prisma.artifact.findMany({
      where: { tenantId, buildJobId },
      orderBy: { createdAt: "asc" },
    });
  }

  async open(tenantId: string, artifactId: string): Promise<NodeJS.ReadableStream> {
    const row = await this.prisma.artifact.findFirst({
      where: { storageKey: artifactId, tenantId },
    });
    if (row === null) {
      throw new NotFoundException("artifact not found");
    }
    return this.storage.open(tenantId, artifactId);
  }

  async deleteArtifact(tenantId: string, artifactId: string): Promise<void> {
    const row = await this.prisma.artifact.findFirst({
      where: { storageKey: artifactId, tenantId },
    });
    if (row === null) {
      throw new NotFoundException("artifact not found");
    }
    await this.storage.delete(tenantId, artifactId);
    await this.prisma.artifact.delete({ where: { id: row.id } });
  }
}

export type ArtifactCreateInput = Prisma.ArtifactCreateInput;
