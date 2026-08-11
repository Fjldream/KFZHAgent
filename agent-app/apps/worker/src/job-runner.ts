import type { ArtifactStorage } from "@kf/artifact-storage";
import {
  BuildExecutor,
  BuildJobService,
  type BuildExecutorHooks,
  type BuildJob,
  type ServerPlanAuthority,
} from "@kf/build-jobs";
import type { DomainRegistry } from "@kf/domain-registry";
import type { PrismaClient } from "@prisma/client";

/**
 * The independent build worker. Polls the durable build-job queue through the
 * shared @kf/build-jobs core: claims one job per workspace with a row-locked
 * lease, executes the full build chain (compile/patch → validate → package →
 * artifact → revision commit), and leaves crash-recoverable diagnostics on
 * failure.
 *
 * Run it as its own process (`runForever`) or one shot (`runOnce`); leases
 * expire so a killed worker is recovered by the next poller.
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
    });
  }

  /**
   * Claims and executes at most one job. Returns the terminal job, or null
   * when nothing is claimable. `now` is injectable for deterministic tests.
   */
  async runOnce(owner: string, now: Date): Promise<BuildJob | null> {
    const job = await this.#buildJobs.leaseNext(owner, now, this.#leaseMs);
    if (job === null) return null;
    return this.#executor.execute(job);
  }

  /** Runs forever: poll → execute → sleep when idle. */
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
