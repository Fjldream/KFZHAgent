import { z } from "zod";
import type { ValidationReport } from "./validation.js";
import type { TrustedSemanticOperation } from "./server-plan-envelope.js";

export type DomainKind = string;

export const domainCapabilitiesSchema = z.object({
  create: z.boolean(),
  import: z.boolean(),
  modify: z.boolean(),
  validate: z.boolean(),
  package: z.boolean(),
});
export type DomainCapabilities = z.infer<typeof domainCapabilitiesSchema>;

export const domainMetadataSchema = z.object({
  kind: z.string().min(1),
  displayName: z.string().min(1),
  supported: z.boolean(),
  capabilities: domainCapabilitiesSchema,
});
export type DomainMetadata = z.infer<typeof domainMetadataSchema>;

export interface DomainWorkspace {
  id: string;
  rootDir: string;
  mode: "base" | "candidate";
  /** rootDir 嵌套时，由 DomainPack 持有的确切一次性根目录。 */
  cleanupRoot?: string;
}

export interface DomainImportInput {
  bytes: Uint8Array;
  workRoot?: string;
}

export interface DomainInspectInput {
  workspace: DomainWorkspace;
}

export interface DomainCompileInput {
  projectIr: unknown;
  buildSeed: string;
  workRoot?: string;
}

export interface DomainPatchInput {
  baseWorkspace: DomainWorkspace;
  changePlan: unknown;
  expectedPlanHash: string;
  /** 经服务器校验的原生适配器授权；绝不由模型编写。 */
  semanticOperations?: readonly TrustedSemanticOperation[];
  /** 由工作程序解决的私有字节。存储键和内部 UUID 从未跨越此边界。 */
  assets?: readonly DomainAssetInput[];
  /** 服务器签发的不透明值；领域包必须拒绝伪造或原始的创意载荷。 */
  creativeMaterialization?: unknown;
  workRoot?: string;
}

export interface DomainValidateInput {
  baseWorkspace: DomainWorkspace;
  candidateWorkspace: DomainWorkspace;
  changePlan: unknown;
  /** 服务器验证的原生适配器授权，用于精确重播验证。 */
  semanticOperations?: readonly TrustedSemanticOperation[];
  assets?: readonly DomainAssetInput[];
  /** patch 使用同一个已校验的不透明句柄；绝不将其作为计划 JSON 持久化。 */
  creativeMaterialization?: unknown;
}

export interface DomainAssetInput {
  assetId: string;
  targetPath: string;
  mediaType: string;
  sha256: string;
  bytes: Uint8Array;
}

export interface DomainPackageInput {
  workspace: DomainWorkspace;
}

export interface PackagedDomainArtifact {
  artifactKind: string;
  domainProjectKind: string;
  mediaType: string;
  fileExtension: string;
  bytes: Uint8Array;
}

export const DEFAULT_ARTIFACT_MEDIA_TYPE = "application/octet-stream";
export const DEFAULT_ARTIFACT_FILE_EXTENSION = ".gz";

const MEDIA_TYPE_PATTERN =
  /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i;
const FILE_EXTENSION_PATTERN = /^\.[a-z0-9]{1,10}$/i;

/** 兼容性降级的 MIME 头安全，适用于在元数据持久化之前创建的行。 */
export function normalizeArtifactMediaType(value: string | null | undefined): string {
  return typeof value === "string" && MEDIA_TYPE_PATTERN.test(value)
    ? value.toLowerCase()
    : DEFAULT_ARTIFACT_MEDIA_TYPE;
}

/** 仅包含一个短后缀；路径分隔符和头部字符退回到旧的 `.gz`。 */
export function normalizeArtifactFileExtension(value: string | null | undefined): string {
  return typeof value === "string" && FILE_EXTENSION_PATTERN.test(value)
    ? value.toLowerCase()
    : DEFAULT_ARTIFACT_FILE_EXTENSION;
}

export interface DomainPack {
  readonly metadata: DomainMetadata;
  importPackage(input: DomainImportInput): Promise<DomainWorkspace>;
  inspect(input: DomainInspectInput): Promise<unknown>;
  compile(input: DomainCompileInput): Promise<DomainWorkspace>;
  patch(input: DomainPatchInput): Promise<DomainWorkspace>;
  validate(input: DomainValidateInput): Promise<ValidationReport>;
  package(input: DomainPackageInput): Promise<PackagedDomainArtifact>;
}

export type DomainSubgraphPort = {
  invoke: (input: unknown, config?: Record<string, unknown>) => Promise<unknown>;
};
