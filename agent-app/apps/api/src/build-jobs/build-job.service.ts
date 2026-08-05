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
 * NestJS-facing build job service. All durable behavior (idempotent enqueue,
 * row-locked leasing, single-transaction completion) lives in the shared
 * @kf/build-jobs core so the worker process and the API cannot drift.
 */
@Injectable()
export class BuildJobService {
  readonly #inner: BuildJobsCore;

  constructor(prisma: PrismaService) {
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
}

export { BuildJobConflictError, BuildJobNotFoundError };
