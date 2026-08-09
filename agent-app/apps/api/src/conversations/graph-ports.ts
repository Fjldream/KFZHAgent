import type { BuildJobPort, WorkspaceQueryPort } from "@kf/agent-orchestrator";
import type { ChangePlanRepository } from "@kf/agent-orchestrator";
import type { EditableEntity } from "@kf/agent-orchestrator";
import type { GraphMessage } from "@kf/agent-orchestrator";
import { deriveGuid } from "@kf/domain-client";
import { importNativeClientPackage, inspectClientProject } from "@kf/domain-client";
import type { ArtifactStorage } from "@kf/artifact-storage";
import type { ChangePlan } from "@kf/contracts";
import type { Prisma } from "@prisma/client";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaService } from "../prisma/prisma.service.js";
import { BuildJobService } from "../build-jobs/build-job.service.js";

/**
 * Real Prisma-backed ports for the solution graph (brief "Consumes" line).
 * The graph stays free of direct database access; every read/write flows
 * through these ports so it remains deterministic and resumable.
 */

/** How many recent messages are handed to the model (mirrors the graph bound). */
const RECENT_MESSAGE_LIMIT = 20;

export interface GraphPorts {
  workspaceQuery: WorkspaceQueryPort;
  changePlanRepository: ChangePlanRepository;
  buildJobPort: BuildJobPort;
}

export function createGraphPorts(
  prisma: PrismaService,
  storage: ArtifactStorage,
): GraphPorts {
  const buildJobs = new BuildJobService(prisma);

  const workspaceQuery: WorkspaceQueryPort = {
    async listRecentMessages({ tenantId, conversationId, limit }) {
      const rows = await prisma.message.findMany({
        where: { tenantId, conversationId },
        orderBy: { createdAt: "asc" },
        take: Math.min(limit, RECENT_MESSAGE_LIMIT),
      });
      return rows.map((row) => ({
        role: row.role as "user" | "assistant",
        content: row.content,
      }));
    },
    async appendMessage({ tenantId, conversationId, role, content }) {
      await prisma.message.create({ data: { tenantId, conversationId, role, content } });
    },
    async getConversationSummary({ tenantId, conversationId }) {
      const conversation = await prisma.conversation.findFirst({
        where: { id: conversationId, tenantId },
      });
      return conversation?.summary ?? undefined;
    },
    async setConversationSummary({ tenantId, conversationId, summary }) {
      await prisma.conversation.updateMany({
        where: { id: conversationId, tenantId },
        data: { summary },
      });
    },
    async getCurrentRevisionId({ tenantId, workspaceId }) {
      const workspace = await prisma.solutionWorkspace.findFirst({
        where: { id: workspaceId, tenantId },
      });
      return workspace?.currentRevisionId ?? undefined;
    },
    async getRevisionSummary({ tenantId, revisionId }) {
      const revision = await prisma.solutionRevision.findFirst({
        where: { id: revisionId, tenantId },
      });
      if (revision === null || revision.state === null || typeof revision.state !== "object") {
        return undefined;
      }
      return makeBoundedRevisionSummary(revision.state);
    },
    async getRevisionEntities({ tenantId, revisionId, workspaceId }) {
      const revision = await prisma.solutionRevision.findFirst({
        where: { id: revisionId, tenantId },
      });
      if (revision === null || revision.state === null || typeof revision.state !== "object") {
        return [];
      }
      // compile-mode revisions store the ClientProjectIR in state; its control
      // GUIDs are deterministic per workspace: deriveGuid({ seed: workspaceId }, id).
      const record = revision.state as Record<string, unknown>;
      if (!Array.isArray(record["pages"])) {
        const projectRevision = await prisma.domainProjectRevision.findFirst({
          where: {
            tenantId,
            solutionRevisionId: revisionId,
            domainKind: "kingclient",
          },
          select: { packageUrl: true },
        });
        if (projectRevision === null || projectRevision.packageUrl === null) return [];
        return inspectBuiltClientEntities(tenantId, projectRevision.packageUrl, storage);
      }
      const entities: EditableEntity[] = [];
      for (const page of record["pages"] as Record<string, unknown>[]) {
        const pageName = typeof page["name"] === "string" ? page["name"] : "";
        if (pageName !== "") {
          entities.push({
            kind: "page",
            name: pageName,
            type: "page",
            guid: deriveGuid({ seed: workspaceId }, pageName),
          });
        }
        const controls = Array.isArray(page["controls"]) ? page["controls"] : [];
        for (const control of controls as Record<string, unknown>[]) {
          const id = typeof control["id"] === "string" ? control["id"] : "";
          if (id === "") continue;
          entities.push({
            kind: "control",
            name: id,
            type: typeof control["type"] === "string" ? control["type"] : "?",
            guid: deriveGuid({ seed: workspaceId }, id),
          });
        }
      }
      return entities;
    },
  };

  const changePlanRepository: ChangePlanRepository = {
    async findOpenChangeRequest({ tenantId, workspaceId, conversationId }) {
      const request = await prisma.changeRequest.findFirst({
        where: { id: `cr:${workspaceId}:${conversationId}`, tenantId, status: "OPEN" },
      });
      return request === null ? null : { id: request.id };
    },
    async saveChangeRequest({ id, tenantId, workspaceId, title, status }) {
      await prisma.changeRequest.upsert({
        where: { id },
        create: { id, tenantId, workspaceId, title, status },
        update: { title, status },
      });
    },
    async savePlan({ id, tenantId, workspaceId, changeRequestId, planHash, plan }) {
      await prisma.changePlan.upsert({
        where: { id },
        create: {
          id,
          tenantId,
          workspaceId,
          changeRequestId,
          planHash,
          plan: plan as Prisma.InputJsonValue,
        },
        update: { planHash, plan: plan as Prisma.InputJsonValue },
      });
    },
    async loadPlanHash({ tenantId, changePlanId }) {
      const plan = await prisma.changePlan.findFirst({
        where: { id: changePlanId, tenantId },
      });
      return plan?.planHash ?? undefined;
    },
    async setChangeRequestStatus({ tenantId, changeRequestId, status }) {
      await prisma.changeRequest.updateMany({
        where: { id: changeRequestId, tenantId },
        data: { status },
      });
    },
  };

  const buildJobPort: BuildJobPort = {
    async enqueue(input) {
      const job = await buildJobs.enqueue(input);
      return { id: job.id, status: job.status };
    },
    async getJob({ tenantId, jobId }) {
      const job = await buildJobs.get(jobId, tenantId);
      return job === null ? null : { id: job.id, status: job.status };
    },
  };

  return { workspaceQuery, changePlanRepository, buildJobPort };
}

async function inspectBuiltClientEntities(
  tenantId: string,
  storageKey: string,
  storage: ArtifactStorage,
): Promise<EditableEntity[]> {
  const stream = await storage.open(tenantId, storageKey);
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const destination = await mkdtemp(path.join(tmpdir(), "kf-graph-context-"));
  try {
    const rootDir = await importNativeClientPackage(Buffer.concat(chunks), destination);
    const inspection = await inspectClientProject(rootDir);
    const entities: EditableEntity[] = [];
    for (const page of inspection.summary.pages) {
      entities.push({
        kind: "page",
        name: page.name,
        type: "page",
        guid: page.guid,
      });
      const pageIndex = inspection.index.pages[page.guid];
      for (const controlGuid of pageIndex?.controlGuids ?? []) {
        const control = inspection.index.controls[controlGuid];
        if (control === undefined) continue;
        entities.push({
          kind: "control",
          name: control.name ?? control.id,
          type: control.type,
          guid: control.guid,
        });
      }
    }
    return entities;
  } finally {
    await rm(destination, { recursive: true, force: true });
  }
}

/**
 * Bounded revision summary: names and counts only, never the full page JSON
 * or raw project IR (brief Step 6).
 */
function makeBoundedRevisionSummary(state: object): string {
  const record = state as Record<string, unknown>;
  const pages = Array.isArray(record["pages"]) ? (record["pages"] as Record<string, unknown>[]) : [];
  const names = pages
    .map((page) => {
      const name = page["name"];
      return typeof name === "string" ? name : "?";
    })
    .slice(0, 5)
    .join("、");
  return `页面 ${names.length > 0 ? names : "（无）"}；共 ${pages.length} 页`;
}

export type { ChangePlan, GraphMessage };
