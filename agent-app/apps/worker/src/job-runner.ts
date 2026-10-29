import type { ArtifactStorage } from "@kf/artifact-storage";
import {
  BuildExecutor,
  BuildJobService,
  type BuildExecutorHooks,
  type BuildOperatorLogger,
  type BuildJob,
  type ServerPlanAuthority,
} from "@kf/build-jobs";
import type { DomainRegistry } from "@kf/domain-registry";
import type { PrismaClient } from "@prisma/client";

/**
 * 独立构建 worker。它通过共享的 @kf/build-jobs 核心轮询持久化构建作业队列：使用带行锁的租约为每个工作空间申领一个作业，执行完整构建链（编译/修补 → 校验 → 打包 → 制品 → 修订提交），并在失败时留下可从崩溃中恢复的诊断信息。
 *
 * 可以将其作为独立进程运行（`runForever`），也可以单次运行（`runOnce`）；租约会过期，因此被终止的 worker 可由下一个轮询器恢复。
 */
export class JobRunner {
  readonly #buildJobs: BuildJobService;
  readonly #executor: BuildExecutor;
  readonly #pollIntervalMs: number;
  readonly #leaseMs: number;

  constructor(deps: {
    prisma: PrismaClient;
    storage: ArtifactStorage;
    registry: DomainRegistry;
    workRoot?: string;
    hooks?: BuildExecutorHooks;
    pollIntervalMs?: number;
    leaseMs?: number;
    maxArtifactBytes?: number;
    serverPlanVerifier?: Pick<ServerPlanAuthority, "verify">;
    operatorLogger?: BuildOperatorLogger;
  }) {
    this.#leaseMs = deps.leaseMs ?? DEFAULT_LEASE_MS;
    this.#pollIntervalMs = deps.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    this.#buildJobs = new BuildJobService(deps.prisma, this.#leaseMs);
    this.#executor = new BuildExecutor({
      prisma: deps.prisma,
      storage: deps.storage,
      registry: deps.registry,
      ...(deps.hooks !== undefined ? { hooks: deps.hooks } : {}),
      ...(deps.workRoot !== undefined ? { workRoot: deps.workRoot } : {}),
      leaseMs: this.#leaseMs,
      ...(deps.maxArtifactBytes !== undefined ? { maxArtifactBytes: deps.maxArtifactBytes } : {}),
      ...(deps.serverPlanVerifier !== undefined ? { serverPlanVerifier: deps.serverPlanVerifier } : {}),
      ...(deps.operatorLogger !== undefined ? { operatorLogger: deps.operatorLogger } : {}),
    });
  }

  /**
 * 最多执行一个任务。返回可执行的任务，或当无任务可执行时返回 null。`now` 可用于确定性测试。
 */
  async runOnce(owner: string, now: Date): Promise<BuildJob | null> {
    const job = await this.#buildJobs.leaseNext(owner, now, this.#leaseMs);
    if (job === null) return null;
    return this.#executor.execute(job);
  }

  /** 无限循环：轮询 → 执行 → 睡眠在空闲时。 */
  async runForever(owner: string): Promise<never> {
    for (;;) {
      const job = await this.runOnce(owner, new Date());
      if (job === null) {
        await sleep(this.#pollIntervalMs);
      }
    }
  }
}

const DEFAULT_LEASE_MS = 30_000;
const DEFAULT_POLL_INTERVAL_MS = 1_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
