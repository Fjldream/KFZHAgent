import type { BuildJob, JobStatus } from "@prisma/client";

export type BuildJobStatus = JobStatus;

/** Input for a durable build job enqueue (idempotent on idempotencyKey). */
export interface EnqueueBuildInput {
  tenantId: string;
  workspaceId: string;
  baseRevisionId: string;
  changePlanId: string;
  planHash: string;
  /** Stable project identity. Omitted legacy calls default to domainKind. */
  projectKey?: string;
  domainKind: string;
  idempotencyKey: string;
}

/** Validation report persisted with a completed build job. */
export interface JobValidationReport {
  outcome: string;
  summary: string;
  details: unknown;
}

/** The new revision payload for a successful build commit. */
export interface SuccessfulBuildResult {
  kind: string;
  state: unknown;
  domainKind: string;
  domainProjectKind: string;
  mediaType: string;
  fileExtension: string;
  packageHash: string;
  packageUrl: string;
  artifact: {
    kind: string;
    mediaType: string;
    fileExtension: string;
    storageKey: string;
    sizeBytes: number;
    sha256: string;
  };
}

/** Completion input; owner + attempt must match a live lease or the commit is rejected. */
export interface CompleteBuildInput {
  jobId: string;
  tenantId: string;
  leaseOwner: string;
  leaseAttempt: number;
  status: "SUCCEEDED" | "FAILED";
  validationReport: JobValidationReport;
  result?: SuccessfulBuildResult;
}

/** A build job that has been claimed by a worker lease. */
export type LeasedBuildJob = BuildJob;

export type { BuildJob };
