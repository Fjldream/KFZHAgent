import type { BuildJob, JobStatus } from "@prisma/client";

export type BuildJobStatus = JobStatus;

/** 持久化构建作业入队的输入（以 idempotencyKey 保证幂等）。 */
export interface EnqueueBuildInput {
  tenantId: string;
  workspaceId: string;
  baseRevisionId: string;
  changePlanId: string;
  planHash: string;
  /** 稳定的项目标识。省略该值的旧版调用默认使用 domainKind。 */
  projectKey?: string;
  domainKind: string;
  idempotencyKey: string;
}

/** 验证报告，已完成构建作业。 */
export interface JobValidationReport {
  outcome: string;
  summary: string;
  details: unknown;
}

/** 成功构建提交的新修订版本。 */
export interface SuccessfulBuildResult {
  kind: string;
  state: unknown;
  domainKind: string;
  domainProjectKind: string;
  mediaType: string;
  fileExtension: string;
  packageHash: string;
  packageUrl: string;
  creativeBinding?: {
    creativeArtifactHash: string;
    nativeMaterializationHash: string;
  };
  artifact: {
    kind: string;
    mediaType: string;
    fileExtension: string;
    storageKey: string;
    sizeBytes: number;
    sha256: string;
  };
}

/** 完成输入；所有者尝试必须匹配一个活的租约，否则提交将被拒绝。 */
export interface CompleteBuildInput {
  jobId: string;
  tenantId: string;
  leaseOwner: string;
  leaseAttempt: number;
  status: "SUCCEEDED" | "FAILED";
  validationReport: JobValidationReport;
  result?: SuccessfulBuildResult;
}

/** 已被工蜂租约占有的构建作业。 */
export type LeasedBuildJob = BuildJob;

export type { BuildJob };
