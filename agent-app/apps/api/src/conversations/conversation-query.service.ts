// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient, Conversation } from "@prisma/client";
import type { ConversationListItem, ConversationQueries, MessageView, Page, RunStatus } from "@kf/contracts";
import { sanitizeConversationMessage } from "./conversation.service.js";

const ACTIVE = ["QUEUED", "RUNNING", "WAITING_INPUT", "WAITING_APPROVAL", "BUILDING", "CANCEL_REQUESTED"];
type Database = PrismaClient | Prisma.TransactionClient;
type Cursor = { version: 1; scope: string; timestamp: string; id: string };
const scopeKey = (...values: unknown[]) => JSON.stringify(values);
const validateLimit = (limit: number) => {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new BadRequestException("INVALID_LIMIT");
};
export const validateConversationTitle = (title: unknown): string => {
  if (typeof title !== "string" || Array.from(title.trim()).length < 1 || Array.from(title.trim()).length > 100) {
    throw new BadRequestException("INVALID_TITLE");
  }
  return title.trim();
};
function decodeCursor(raw: string | null, scope: string): Cursor | null {
  if (raw === null) return null;
  try {
    if (typeof raw !== "string" || raw.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(raw)) throw new Error();
    const buffer = Buffer.from(raw, "base64url");
    if (buffer.toString("base64url") !== raw) throw new Error();
    const value = JSON.parse(buffer.toString("utf8")) as Cursor;
    if (!value || Object.keys(value).sort().join() !== "id,scope,timestamp,version" || value.version !== 1 || value.scope !== scope
      || typeof value.id !== "string" || value.id.length < 1 || value.id.length > 128
      || typeof value.timestamp !== "string" || new Date(value.timestamp).toISOString() !== value.timestamp) throw new Error();
    return value;
  } catch { throw new BadRequestException("INVALID_CURSOR"); }
}
const encodeCursor = (scope: string, date: Date, id: string): string => Buffer.from(JSON.stringify({ version: 1, scope, timestamp: date.toISOString(), id })).toString("base64url");

export class ConversationQueryService implements ConversationQueries {
  constructor(private readonly prisma: PrismaClient) {}

  async get(tenantId: string, conversationId: string): Promise<ConversationListItem> {
    return this.item(this.prisma, await this.conversation(this.prisma, tenantId, conversationId));
  }

  private async item(database: Database, row: Conversation): Promise<ConversationListItem> {
    const runs = await database.agentRun.findMany({ where: { tenantId: row.tenantId, conversationId: row.id, status: { in: ACTIVE } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    const active = runs.find(run => run.status !== "QUEUED") ?? runs[0];
    return { id: row.id, workspaceId: row.workspaceId, title: row.title, archivedAt: row.archivedAt?.toISOString() ?? null,
      lastActivityAt: row.lastActivityAt.toISOString(), activeRunId: active?.id ?? null, activeRunStatus: (active?.status as RunStatus | undefined) ?? null };
  }

  private async conversation(database: Database, tenantId: string, id: string) {
    const row = await database.conversation.findFirst({ where: { id, tenantId } });
    if (!row) throw new NotFoundException("conversation");
    return row;
  }

  async list(tenantId: string, workspaceId: string, cursor: string | null = null, limit = 50, archived = false): Promise<Page<ConversationListItem>> {
    validateLimit(limit);
    if (typeof workspaceId !== "string" || !workspaceId || typeof archived !== "boolean") throw new BadRequestException("INVALID_QUERY");
    if (!await this.prisma.solutionWorkspace.findFirst({ where: { id: workspaceId, tenantId }, select: { id: true } })) throw new NotFoundException("workspace");
    const scope = scopeKey("conversations", tenantId, workspaceId, archived);
    const boundary = decodeCursor(cursor, scope);
    const rows = await this.prisma.conversation.findMany({ where: { tenantId, workspaceId, archivedAt: archived ? { not: null } : null,
      ...(boundary ? { OR: [{ lastActivityAt: { lt: new Date(boundary.timestamp) } }, { lastActivityAt: new Date(boundary.timestamp), id: { lt: boundary.id } }] } : {}) },
      orderBy: [{ lastActivityAt: "desc" }, { id: "desc" }], take: limit + 1 });
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    return { items: await Promise.all(page.map(row => this.item(this.prisma, row))), nextCursor: rows.length > limit && last ? encodeCursor(scope, last.lastActivityAt, last.id) : null };
  }

  async messages(tenantId: string, conversationId: string, before: string | null = null, limit = 50): Promise<Page<MessageView>> {
    validateLimit(limit);
    await this.conversation(this.prisma, tenantId, conversationId);
    const scope = scopeKey("messages", tenantId, conversationId);
    const boundary = decodeCursor(before, scope);
    const rows = await this.prisma.message.findMany({ where: { tenantId, conversationId,
      ...(boundary ? { OR: [{ createdAt: { lt: new Date(boundary.timestamp) } }, { createdAt: new Date(boundary.timestamp), id: { lt: boundary.id } }] } : {}) },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit + 1 });
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    const nextCursor = rows.length > limit && last ? encodeCursor(scope, last.createdAt, last.id) : null;
    return { items: page.reverse().map(row => ({ id: row.id, conversationId, role: row.role as MessageView["role"], content: sanitizeConversationMessage(row).content,
      createdAt: row.createdAt.toISOString(), runId: row.runId, parts: [] })), nextCursor };
  }

  async create(tenantId: string, body: unknown): Promise<ConversationListItem> {
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new BadRequestException("INVALID_BODY");
    const value = body as Record<string, unknown>;
    if (Object.keys(value).some(key => !["workspaceId", "title"].includes(key)) || typeof value.workspaceId !== "string" || !value.workspaceId) throw new BadRequestException("INVALID_BODY");
    const title = value.title === undefined ? "新对话" : validateConversationTitle(value.title);
    if (!await this.prisma.solutionWorkspace.findFirst({ where: { id: value.workspaceId, tenantId }, select: { id: true } })) throw new NotFoundException("workspace");
    const createdAt = new Date();
    const row = await this.prisma.conversation.create({ data: { tenantId, workspaceId: value.workspaceId, title, createdAt,
      // Explicit titles, even the default label, must never be auto-replaced.
      updatedAt: value.title === undefined ? createdAt : new Date(createdAt.getTime() + 1) } });
    return this.item(this.prisma, row);
  }

  rename(tenantId: string, conversationId: string, title: string) { return this.patch(tenantId, conversationId, { title }); }
  archive(tenantId: string, conversationId: string, archived: boolean) { return this.patch(tenantId, conversationId, { archived }); }

  async patch(tenantId: string, conversationId: string, body: unknown): Promise<ConversationListItem> {
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new BadRequestException("INVALID_BODY");
    const value = body as Record<string, unknown>;
    if (!Object.keys(value).length || Object.keys(value).some(key => !["title", "archived"].includes(key))) throw new BadRequestException("INVALID_BODY");
    const title = "title" in value ? validateConversationTitle(value.title) : undefined;
    if ("archived" in value && typeof value.archived !== "boolean") throw new BadRequestException("INVALID_ARCHIVED");
    return this.prisma.$transaction(async tx => {
      // Admission takes this lock first; never wait for a turn lease while holding it.
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`kf-run:${conversationId}`}, 0))`;
      const row = await this.conversation(tx, tenantId, conversationId);
      if (value.archived === true) {
        const [turn] = await tx.$queryRaw<Array<{ acquired: boolean }>>`SELECT pg_try_advisory_xact_lock(hashtextextended(${`kf-turn:${conversationId}`}, 0)) AS acquired`;
        const active = await tx.agentRun.findFirst({ where: { tenantId, conversationId, status: { in: ACTIVE } }, select: { id: true } });
        const fence = await tx.conversationTurnFence.findUnique({ where: { conversationId } });
        if (!turn?.acquired || active || fence) throw new ConflictException("RUN_ACTIVE");
      }
      const updated = await tx.conversation.update({ where: { id: conversationId }, data: {
        ...(title === undefined ? {} : { title }),
        ...("archived" in value ? { archivedAt: value.archived ? row.archivedAt ?? new Date() : null } : {}),
        updatedAt: new Date(Math.max(Date.now(), row.createdAt.getTime() + 1)),
      } });
      return this.item(tx, updated);
    });
  }
}
// end
