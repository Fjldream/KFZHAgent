import { mkdtemp, rm } from "node:fs/promises";
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
      try {
        const rootDir = await importNativeClientPackage(Buffer.from(bytes), destination);
        return { id: "imported-client", rootDir, mode: "base", cleanupRoot: destination };
      } catch (error) {
        await rm(destination, { recursive: true, force: true });
        throw error;
      }
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

    async patch({ baseWorkspace, changePlan, expectedPlanHash, semanticOperations, assets, workRoot }) {
      const workspace = await applyClientPatch(baseWorkspace.rootDir, changePlan, {
        planHash: expectedPlanHash,
        ...(semanticOperations === undefined ? {} : { semanticOperations }),
        ...(assets === undefined ? {} : { assets }),
        ...(workRoot === undefined ? {} : { workRoot }),
      });
      return { id: workspace.id, rootDir: workspace.rootDir, mode: "candidate" };
    },

    async validate({ baseWorkspace, candidateWorkspace, changePlan, assets }) {
      return validateClientProject(
        baseWorkspace.rootDir,
        candidateWorkspace.rootDir,
        changePlan,
        { skipRoundTrip: false, assetTargetPaths: assets?.map((asset) => asset.targetPath) ?? [] },
      );
    },

    async package({ workspace }) {
      const bytes = await packageNativeClientProject(workspace.rootDir);
      return {
        artifactKind: "client-package",
        domainProjectKind: "client-package",
        // KF's native `.gz` filename is a ZIP container, not a gzip stream.
        mediaType: "application/zip",
        fileExtension: ".gz",
        bytes,
      };
    },
  };
}
