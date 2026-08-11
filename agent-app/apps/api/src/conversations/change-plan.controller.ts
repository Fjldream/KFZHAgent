import {
  Controller,
  Get,
  NotFoundException,
  InternalServerErrorException,
  Inject,
  Param,
  Req,
  UseGuards,
} from "@nestjs/common";
import { TenantGuard, type AuthenticatedRequest } from "../auth/tenant.guard.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { changePlanSchema } from "@kf/contracts";
import { SERVER_PLAN_AUTHORITY } from "./server-plan-authority.js";
import type { ServerPlanAuthority } from "@kf/build-jobs";

/** 计划中涉及 linkMng（控件事件脚本）的变更，确认前必须单独可见（I5）。 */
export interface ScriptChange {
  op: string;
  entityId: string;
  entityType?: string;
  paths: string[];
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function publicChangePlan(
  storedPlan: unknown,
  expectedPlanHash: string,
  authority: Pick<ServerPlanAuthority, "verify">,
): unknown {
  const record = asRecord(storedPlan);
  try {
    if (record["schema"] === "kf-server-plan-envelope/v1") {
      return authority.verify(storedPlan, { expectedPlanHash }).plan;
    }
    const schema = record["schema"];
    const internalKeys = ["signature", "semanticOperations", "revisionId", "planHash", "plan"];
    if ((typeof schema === "string" && schema.startsWith("kf-server-plan-envelope/"))
      || internalKeys.some((key) => Object.hasOwn(record, key))) {
      throw new Error("invalid internal envelope candidate");
    }
    const plain = changePlanSchema.safeParse(storedPlan);
    if (!plain.success) throw new Error("invalid legacy plan");
    return plain.data;
  } catch {
    throw new InternalServerErrorException("stored change plan is invalid");
  }
}

function isScriptPath(path: unknown): path is string {
  return typeof path === "string" && (path === "/linkMng" || path.startsWith("/linkMng/"));
}

/** 提取计划中修改 linkMng 子树的 update 操作，作为“脚本类变更”单独标注。 */
export function scriptChangesOf(plan: unknown): ScriptChange[] {
  const rec = asRecord(plan);
  const operations = Array.isArray(rec["operations"]) ? (rec["operations"] as unknown[]) : [];
  const out: ScriptChange[] = [];
  for (const raw of operations) {
    const op = asRecord(raw);
    const action = op["op"] ?? op["action"];
    if (action !== "update") continue;
    const changes = Array.isArray(op["changes"]) ? (op["changes"] as unknown[]) : [];
    const paths = changes.map((c) => asRecord(c)["path"]).filter(isScriptPath);
    if (paths.length === 0) continue;
    const entityId = op["entityId"];
    if (typeof entityId !== "string") continue;
    out.push({
      op: "update",
      entityId,
      ...(typeof op["entityType"] === "string" ? { entityType: op["entityType"] } : {}),
      paths,
    });
  }
  return out;
}

/**
 * 计划详情查询（Task 12 确认 UX 所需）：前端展示「精确 create/update/delete
 * 操作」必须读取规范化计划，而 SSE done / resume 载荷只携带 planHash 与
 * 摘要。计划按 tenant 隔离，跨租户 id 一律 404。
 */
@Controller("api/change-plans")
@UseGuards(TenantGuard)
export class ChangePlanController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(SERVER_PLAN_AUTHORITY) private readonly serverPlanAuthority: ServerPlanAuthority,
  ) {}

  @Get(":id")
  async get(
    @Param("id") id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ id: string; planHash: string; plan: unknown; scriptChanges: ScriptChange[] }> {
    const plan = await this.prisma.changePlan.findFirst({
      where: { id, tenantId: req.principal.tenantId },
    });
    if (plan === null) {
      throw new NotFoundException();
    }
    // Never expose server-owned semantic authorizations. A corrupt/tampered
    // envelope must fail closed instead of being mistaken for a legacy plan.
    const publicPlan = publicChangePlan(plan.plan, plan.planHash, this.serverPlanAuthority);
    return {
      id: plan.id,
      planHash: plan.planHash,
      plan: publicPlan,
      scriptChanges: scriptChangesOf(publicPlan),
    };
  }
}
