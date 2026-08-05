import type { ChangePlan } from "./change-plan.js";
import type { ValidationReport } from "./validation.js";

export type DomainKind = string;

export type DomainCapabilities = {
  create: boolean;
  import: boolean;
  modify: boolean;
  validate: boolean;
  package: boolean;
};

export type DomainMetadata = {
  kind: DomainKind;
  displayName: string;
  supported: boolean;
  capabilities: DomainCapabilities;
};

export type DomainPack = DomainMetadata & {
  graph?: DomainSubgraphPort;
  inspect: (artifactId: string) => Promise<unknown>;
  compile: (projectIr: unknown) => Promise<unknown>;
  patch: (workspaceId: string, plan: ChangePlan) => Promise<unknown>;
  validate: (workspaceId: string) => Promise<ValidationReport>;
  package: (workspaceId: string) => Promise<string>;
};

export type DomainSubgraphPort = {
  invoke: (input: unknown, config?: Record<string, unknown>) => Promise<unknown>;
};
