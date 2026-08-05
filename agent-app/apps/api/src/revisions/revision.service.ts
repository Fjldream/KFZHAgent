import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { DomainProjectRevision, SolutionRevision } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";

/**
 * Thrown whenever a caller tries to update or delete a solution revision
 * through the service. Revisions are append-only records of validated state;
 * history changes are expressed as new revisions (rollback creates one that
 * references the historical revision).
 */
export class RevisionImmutableError extends Error {
  override name = "RevisionImmutableError";
  constructor(revisionId: string) {
    super(`revision ${revisionId} is immutable`);
  }
}

/**
 * Revision service. Successful revisions cannot be updated or deleted;
 * rollback creates a new revision referencing the historical revision and only
 * then advances workspace.currentRevisionId.
 */
@Injectable()
export class RevisionService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, workspaceId: string): Promise<SolutionRevision[]> {
    return this.prisma.solutionRevision.findMany({
      where: { tenantId, workspaceId },
      orderBy: { revisionNumber: "asc" },
    });
  }

  async get(tenantId: string, revisionId: string): Promise<SolutionRevision> {
    const revision = await this.prisma.solutionRevision.findFirst({
      where: { id: revisionId, tenantId },
    });
    if (revision === null) {
      throw new NotFoundException("revision");
    }
    return revision;
  }

  async getDomainProject(tenantId: string, revisionId: string): Promise<DomainProjectRevision | null> {
    return this.prisma.domainProjectRevision.findFirst({
      where: { solutionRevisionId: revisionId, tenantId },
      orderBy: { createdAt: "desc" },
    });
  }

  /** Revisions are immutable: updating one through the service always fails. */
  async update(
    tenantId: string,
    revisionId: string,
    _data: Record<string, unknown>,
  ): Promise<never> {
    void _data;
    await this.get(tenantId, revisionId);
    throw new RevisionImmutableError(revisionId);
  }

  /** Revisions are immutable: deleting one through the service always fails. */
  async delete(tenantId: string, revisionId: string): Promise<never> {
    await this.get(tenantId, revisionId);
    throw new RevisionImmutableError(revisionId);
  }

  /**
   * Rolls the workspace back to a historical (successful) revision. The
   * historical revision itself is never mutated: a new rollback revision is
   * created that references it and carries the same package pointer.
   */
  async rollback(input: {
    tenantId: string;
    workspaceId: string;
    targetRevisionId: string;
    reason?: string;
  }): Promise<SolutionRevision> {
    const workspace = await this.prisma.solutionWorkspace.findFirst({
      where: { id: input.workspaceId, tenantId: input.tenantId },
    });
    if (workspace === null) {
      throw new NotFoundException("workspace");
    }
    const target = await this.prisma.solutionRevision.findFirst({
      where: {
        id: input.targetRevisionId,
        workspaceId: input.workspaceId,
        tenantId: input.tenantId,
      },
    });
    if (target === null) {
      throw new NotFoundException("target revision");
    }
    if (target.kind === "initial") {
      throw new BadRequestException("cannot roll back to an empty initial revision");
    }
    const targetDomain = await this.getDomainProject(input.tenantId, target.id);
    if (targetDomain === null || targetDomain.packageUrl === null) {
      throw new BadRequestException("target revision has no package");
    }

    return this.prisma.$transaction(async (tx) => {
      const latest = await tx.solutionRevision.findFirst({
        where: { workspaceId: input.workspaceId },
        orderBy: { revisionNumber: "desc" },
      });
      const revision = await tx.solutionRevision.create({
        data: {
          tenantId: input.tenantId,
          workspaceId: input.workspaceId,
          changePlanId: target.changePlanId,
          revisionNumber: (latest?.revisionNumber ?? 0) + 1,
          kind: "rollback",
          parentRevisionId: target.id,
          ...(target.state !== null ? { state: target.state as object } : {}),
        },
      });
      await tx.domainProjectRevision.create({
        data: {
          tenantId: input.tenantId,
          solutionRevisionId: revision.id,
          domainKind: targetDomain.domainKind,
          kind: targetDomain.kind,
          packageHash: targetDomain.packageHash,
          packageUrl: targetDomain.packageUrl,
        },
      });
      await tx.solutionWorkspace.update({
        where: { id: input.workspaceId },
        data: { currentRevisionId: revision.id },
      });
      return revision;
    });
  }
}
