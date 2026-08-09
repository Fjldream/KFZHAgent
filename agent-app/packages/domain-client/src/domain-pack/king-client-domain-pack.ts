import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { DomainPack } from "@kf/contracts";
import { compileClientProject } from "../compile/client-compiler.js";
import { inspectClientProject } from "../inspect/client-inspector.js";
import { ClientProjectIRSchema } from "../ir/client-project-ir.schema.js";
import {
  importNativeClientPackage,
  packageNativeClientProject,
} from "../package/native-client-package.js";
import { applyClientPatch } from "../patch/client-patcher.js";
import { validateClientProject } from "../validate/client-validator.js";

export function createKingClientDomainPack(options: {
  nativeAccepted: boolean;
}): DomainPack {
  return {
    metadata: {
      kind: "kingclient",
      displayName: "KingFusion Client",
      supported: options.nativeAccepted,
      capabilities: {
        create: true,
        import: true,
        modify: true,
        validate: true,
        package: true,
      },
    },

    async importPackage({ bytes, workRoot }) {
      const destination = await mkdtemp(path.join(workRoot ?? tmpdir(), "kf-client-base-"));
      const rootDir = await importNativeClientPackage(Buffer.from(bytes), destination);
      return { id: "imported-client", rootDir, mode: "base" };
    },

    async inspect({ workspace }) {
      return inspectClientProject(workspace.rootDir);
    },

    async compile({ projectIr, buildSeed, workRoot }) {
      const parsed = ClientProjectIRSchema.parse(projectIr);
      const workspace = await compileClientProject(
        parsed,
        { seed: buildSeed },
        workRoot === undefined ? undefined : { workRoot },
      );
      return { id: workspace.id, rootDir: workspace.rootDir, mode: "candidate" };
    },

    async patch({ baseWorkspace, changePlan, expectedPlanHash, workRoot }) {
      const workspace = await applyClientPatch(baseWorkspace.rootDir, changePlan, {
        planHash: expectedPlanHash,
        ...(workRoot === undefined ? {} : { workRoot }),
      });
      return { id: workspace.id, rootDir: workspace.rootDir, mode: "candidate" };
    },

    async validate({ baseWorkspace, candidateWorkspace, changePlan }) {
      return validateClientProject(
        baseWorkspace.rootDir,
        candidateWorkspace.rootDir,
        changePlan,
        { skipRoundTrip: false },
      );
    },

    async package({ workspace }) {
      const bytes = await packageNativeClientProject(workspace.rootDir);
      return {
        artifactKind: "client-package",
        domainProjectKind: "client-package",
        mediaType: "application/gzip",
        fileExtension: ".gz",
        bytes,
      };
    },
  };
}
