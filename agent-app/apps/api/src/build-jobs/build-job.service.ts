import { Injectable } from "@nestjs/common";
import {
  BuildJobConflictError,
  BuildJobNotFoundError,
  BuildJobService as BuildJobsCore,
} from "@kf/build-jobs";
import type {
  BuildJob,
  CompleteBuildInput,
  EnqueueBuildInput,
} from "@kf/build-jobs";
import { PrismaService } from "../prisma/prisma.service.js";

/**
 * 面向NestJS的构建作业服务。所有持久行为（幂等的队列入队、行锁租赁、单事务完成）都存在于共享的@kf/build-jobs核心，因此工作进程和API不能漂移。
 */
@Injectable()
export class BuildJobService {
  readonly #inner: BuildJobsCore;

  constructor(private readonly prisma: PrismaService) {
    this.#inner = new BuildJobsCore(prisma);
  }

  enqueue(input: EnqueueBuildInput): Promise<BuildJob> {
    return this.#inner.enqueue(input);
  }

  leaseNext(owner: string, now: Date, leaseMs?: number): Promise<BuildJob | null> {
    return this.#inner.leaseNext(owner, now, leaseMs);
  }

  completeBuild(input: CompleteBuildInput): Promise<BuildJob> {
    return this.#inner.completeBuild(input);
  }

  get(jobId: string, tenantId: string): Promise<BuildJob | null> {
    return this.#inner.get(jobId, tenantId);
  }

  getByKey(idempotencyKey: string, tenantId: string): Promise<BuildJob | null> {
    return this.#inner.getByKey(idempotencyKey, tenantId);
  }

  /** 重新打开工作区的最新持久作业；租户条件防止枚举。 */
  getLatestForWorkspace(workspaceId: string, tenantId: string): Promise<BuildJob | null> {
    return this.prisma.buildJob.findFirst({
      where: { workspaceId, tenantId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
  }
}

export { BuildJobConflictError, BuildJobNotFoundError };
