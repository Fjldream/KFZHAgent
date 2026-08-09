import { z } from "zod";
import type { ValidationReport } from "./validation.js";

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
  workRoot?: string;
}

export interface DomainValidateInput {
  baseWorkspace: DomainWorkspace;
  candidateWorkspace: DomainWorkspace;
  changePlan: unknown;
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
