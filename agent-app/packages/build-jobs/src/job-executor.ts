import type {
  ArtifactStorage,
  StoredArtifact,
} from "@kf/artifact-storage";
import type { ValidationReport } from "@kf/contracts";
import type { ClientProjectIR } from "@kf/domain-client";
import {
  applyClientPatch,
  compileClientProject,
  importNativeClientPackage,
  packageNativeClientProject,
  validateClientProject,
} from "@kf/domain-client";
import type { DomainRegistry } from "@kf/domain-registry";
import { Prisma, type BuildJob, type PrismaClient } from "@prisma/client";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { BuildJobService } from "./build-job.service.js";

/**
 * Thrown by the crash-injection hook to simulate a worker terminating after
 * the artifact write but before the database commit. The executor re-throws it
 * without recording a FAILED outcome, leaving the job RUNNING so a later lease
 * can recover it.
 */
export class BuildWorkerCrash extends Error {
  override name = "BuildWorkerCrash";
}

export interface BuildExecutorHooks {
  /** Invoked after the artifact is durably stored and before the DB commit. */
  beforeCommit?: (artifact: StoredArtifact) => Promise<void>;
}

export interface BuildExecutorDeps {
  prisma: PrismaClient;
  storage: ArtifactStorage;
  registry: DomainRegistry;
  hooks?: BuildExecutorHooks;
  workRoot?: string;
  maxArtifactBytes?: number;
  leaseMs?: number;
}

/**
 * Executes a leased build job end to end:
 *
 *   resolve DomainPack → prepare candidate (compile from IR for a new flow,
 *   copy + patch the base package for an upload/modify flow) → validate →
 *   deterministically package → write the artifact to storage → commit the
 *   revision + job SUCCEEDED in one transaction (advancing currentRevisionId).
 *
 * Failures record diagnostic metadata (validation report + error detail) and
 * mark the job FAILED without creating a revision and without touching
 * currentRevisionId or the previous artifact.
 */
export class BuildExecutor {
  readonly #buildJobs: BuildJobService;
  readonly #deps: BuildExecutorDeps;

  constructor(deps: BuildExecutorDeps) {
    this.#deps = deps;
    this.#buildJobs = new BuildJobService(deps.prisma, deps.leaseMs);
  }

  /** Executes one job. The job must currently hold a lease. */
  async execute(job: BuildJob): Promise<BuildJob> {
    if (job.status === "SUCCEEDED" || job.status === "FAILED") return job;

    try {
      // Resolve the domain capabilities (throws for unknown/unsupported kinds).
      const pack = this.#deps.registry.require(job.domainKind);
      void pack;

      const baseRevision = await this.#deps.prisma.solutionRevision.findUnique({
        where: { id: job.baseRevisionId },
      });
      if (
        baseRevision === null ||
        baseRevision.tenantId !== job.tenantId ||
        baseRevision.workspaceId !== job.workspaceId
      ) {
        return this.complete(job, {
          status: "FAILED",
          error: new Error(`base revision not found: ${job.baseRevisionId}`),
        });
      }
      const plan = await this.#deps.prisma.changePlan.findUnique({
        where: { id: job.changePlanId },
      });
      if (plan === null || plan.workspaceId !== job.workspaceId) {
        return this.complete(job, {
          status: "FAILED",
          error: new Error(`change plan not found: ${job.changePlanId}`),
        });
      }

      const candidate = await this.buildCandidate(job, baseRevision, plan);
      await this.markValidating(job);

      const report = await validateClientProject(
        candidate.baseDir,
        candidate.candidateDir,
        candidate.planInput,
        { skipRoundTrip: false },
      );
      if (report.status === "fail") {
        return this.complete(job, { status: "FAILED", report });
      }

      const pkg = await packageNativeClientProject(candidate.candidateDir);
      const stored = await this.#deps.storage.put({
        tenantId: job.tenantId,
        kind: "client-package",
        stream: Readable.from(pkg),
        maxBytes: this.#deps.maxArtifactBytes ?? DEFAULT_MAX_ARTIFACT_BYTES,
      });

      // Crash injection point: after the artifact write, before the DB commit.
      await this.#deps.hooks?.beforeCommit?.(stored);

      return this.complete(job, {
        status: "SUCCEEDED",
        report,
        stored,
        plan,
        mode: candidate.mode,
      });
    } catch (error) {
      if (error instanceof BuildWorkerCrash) throw error;
      return this.complete(job, { status: "FAILED", error });
    }
  }

  private async buildCandidate(
    job: BuildJob,
    baseRevision: { id: string; kind: string; state: Prisma.JsonValue | null },
    plan: { plan: Prisma.JsonValue | null },
  ): Promise<{ baseDir: string; candidateDir: string; planInput: unknown; mode: string }> {
    const planInput = plan.plan ?? {};
    if (baseRevision.kind === "initial") {
      // New flow: compile the solution IR into a fresh client project. The
      // seed is the workspace id so derived GUIDs are deterministic per
      // workspace (a retried job rebuilds identical bytes).
      const ir = (baseRevision.state ?? {}) as unknown as ClientProjectIR;
      const built = await compileClientProject(ir, { seed: job.workspaceId });
      // C1: the confirmed change plan must really land in the build artifact.
      // Apply it to the compiled tree with the same patch path as the
      // upload/modify flow (planHash-verified); the compiled tree becomes the
      // verification base and the patched tree the candidate, so
      // verifyChangeScope can prove nothing outside the approved plan moved.
      const patched = await applyClientPatch(built.rootDir, planInput, {
        planHash: job.planHash,
      });
      return {
        baseDir: built.rootDir,
        candidateDir: patched.rootDir,
        planInput,
        mode: "compile",
      };
    }

    // Upload/modify flow: fetch the base package, unpack it, and apply the
    // confirmed change plan to a fresh candidate copy.
    const domainProject = await this.#deps.prisma.domainProjectRevision.findFirst({
      where: { solutionRevisionId: baseRevision.id, tenantId: job.tenantId },
      orderBy: { createdAt: "desc" },
    });
    if (domainProject === null || domainProject.packageUrl === null) {
      throw new Error(`base revision ${baseRevision.id} has no package`);
    }
    const sourceDir = await this.unpackBase(job.tenantId, domainProject.packageUrl);
    const patched = await applyClientPatch(sourceDir, planInput, {
      planHash: job.planHash,
    });
    return {
      baseDir: sourceDir,
      candidateDir: patched.rootDir,
      planInput,
      mode: "patch",
    };
  }

  private async unpackBase(tenantId: string, artifactId: string): Promise<string> {
    const stream = await this.#deps.storage.open(tenantId, artifactId);
    const chunks: Buffer[] = [];
    for await (const chunk of stream as AsyncIterable<Buffer | string>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const bytes = Buffer.concat(chunks);
    const workRoot = this.#deps.workRoot ?? tmpdir();
    const destDir = await mkdtemp(path.join(workRoot, "kf-job-base-"));
    return importNativeClientPackage(bytes, destDir);
  }

  private async markValidating(job: BuildJob): Promise<void> {
    await this.#deps.prisma.buildJob
      .update({
        where: { id: job.id },
        data: { status: "VALIDATING" },
      })
      .catch(() => {
        // Lease may already be lost; the eventual commit still validates it.
      });
  }

  private async complete(
    job: BuildJob,
    opts: {
      status: "SUCCEEDED" | "FAILED";
      report?: ValidationReport;
      error?: unknown;
      stored?: StoredArtifact;
      plan?: { plan: Prisma.JsonValue | null };
      mode?: string;
    },
  ): Promise<BuildJob> {
    const details: Record<string, unknown> = {};
    if (opts.report !== undefined) details.report = opts.report;
    if (opts.error !== undefined) details.error = describeError(opts.error);

    if (opts.status === "SUCCEEDED") {
      if (opts.stored === undefined) {
        throw new Error("SUCCEEDED completion requires a stored artifact");
      }
      const { stored } = opts;
      return this.#buildJobs.completeBuild({
        jobId: job.id,
        tenantId: job.tenantId,
        leaseOwner: job.leaseOwner ?? "",
        status: "SUCCEEDED",
        validationReport: {
          outcome: "pass",
          summary: "validation passed",
          details,
        },
        result: {
          kind: "built",
          state: {
            plan: opts.plan?.plan ?? null,
            mode: opts.mode ?? "patch",
          },
          domainKind: job.domainKind,
          domainProjectKind: "client-package",
          packageHash: stored.sha256,
          packageUrl: stored.artifactId,
          artifact: {
            kind: "client-package",
            storageKey: stored.artifactId,
            sizeBytes: stored.size,
            sha256: stored.sha256,
          },
        },
      });
    }

    const summary =
      opts.error !== undefined
        ? `build failed: ${errorMessage(opts.error)}`
        : "validation failed";
    return this.#buildJobs.completeBuild({
      jobId: job.id,
      tenantId: job.tenantId,
      leaseOwner: job.leaseOwner ?? "",
      status: "FAILED",
      validationReport: { outcome: "fail", summary, details },
    });
  }
}

const DEFAULT_MAX_ARTIFACT_BYTES = 256 * 1024 * 1024;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function describeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack };
  }
  return { value: String(error) };
}
