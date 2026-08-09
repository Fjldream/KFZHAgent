import { createHash } from "node:crypto";
import {
  CustomerEffectBlueprintSchema,
  type DesignPlan,
} from "@kf/contracts";
import type { AgentGraphStateValue, AgentGraphUpdate } from "../state.js";
import type { SolutionGraphDeps } from "../ports.js";
import { assessBlueprintRevision } from "../blueprint-quality.js";
import { encodeBlueprintMessage } from "../blueprint-message.js";

/**
 * Generates or revises a DesignPlan (spec §5.3) and hands it back to the user:
 *   - `ModelPort.createDesignPlan(context, { revising })` is called with the
 *     bounded model context; `revising` is true for a REVISE_DESIGN turn so
 *     the model amends the previous plan instead of starting fresh,
 *   - `designPlanHash = sha256(canonical(designPlan))` is stored (a revision
 *     produces a new hash/version),
 *   - the plan is rendered as a bounded assistant message inside the
 *     conversation (greeting + title + sections + style + signature + a
 *     warm closing line inviting adjustments or a "确认" confirmation),
 *   - the node ends in the `design-review` stage where the user can confirm
 *     (CONFIRM_DESIGN → plan-change) or revise again (REVISE_DESIGN → this node).
 *
 * The revision number is carried on `designRevision` (a state channel), NOT as
 * a `revision` field on the plan itself: `DesignPlanSchema` is a strict shared
 * contract and would reject an unknown key, so the plan body stays verbatim
 * and the version lives next to it in state.
 */
export function createDesignPlanNode(deps: SolutionGraphDeps) {
  return async (state: AgentGraphStateValue): Promise<AgentGraphUpdate> => {
    const revising = state.revising === true || state.intent === "REVISE_DESIGN";
    const modelInput = {
      tenantId: state.tenantId,
      userId: state.userId,
      workspaceId: state.workspaceId,
      conversationId: state.conversationId,
      recentMessages: state.recentMessages,
      requirementText: latestUserMessage(state),
      revisionSummary: state.revisionSummary,
      designPlan: state.designPlan,
      // editableEntities may not be materialised on state yet; the context
      // field stays optional so a future wiring can feed it through.
      editableEntities: (state as { editableEntities?: unknown }).editableEntities as
        | import("../ports.js").EditableEntity[]
        | undefined,
    };
    let rawPlan: unknown;
    let modelCallFailed = false;
    try {
      rawPlan = await deps.modelPort.createDesignPlan(modelInput, { revising });
    } catch {
      modelCallFailed = true;
    }
    let parsed = CustomerEffectBlueprintSchema.safeParse(rawPlan);
    let rejectionReasons = modelCallFailed
      ? ["模型未返回完整客户效果蓝图"]
      : parsed.success
        ? []
        : ["候选蓝图不符合完整客户效果蓝图结构"];
    if (parsed.success && revising && state.designPlan !== undefined) {
      rejectionReasons = assessBlueprintRevision(state.designPlan, parsed.data);
    }

    if (rejectionReasons.length > 0) {
      let retried: unknown;
      modelCallFailed = false;
      try {
        retried = await deps.modelPort.createDesignPlan(modelInput, {
          revising,
          rejectionReasons,
        });
      } catch {
        modelCallFailed = true;
      }
      parsed = CustomerEffectBlueprintSchema.safeParse(retried);
      rejectionReasons = modelCallFailed
        ? ["模型未返回完整客户效果蓝图"]
        : parsed.success
          ? revising && state.designPlan !== undefined
            ? assessBlueprintRevision(state.designPlan, parsed.data)
            : []
          : ["候选蓝图不符合完整客户效果蓝图结构"];
    }

    if (!parsed.success || rejectionReasons.length > 0) {
      if (!revising || state.designPlan === undefined) {
        // I1: never persist or hash garbage from the model. A first blueprint
        // gets one repair attempt, then safely returns without side effects.
        return { stage: "idle", lastErrorCode: "INVALID_MODEL_OUTPUT" };
      }
      await deps.workspaceQuery.appendMessage({
        tenantId: state.tenantId,
        conversationId: state.conversationId,
        role: "assistant",
        content:
          "抱歉，您刚才提出的修改还没有充分体现到新蓝图中，因此我保留了上一版有效方案，没有进入工程计划。请再补充一下希望新增或调整的具体内容，我会继续为您完善。",
      });
      return {
        stage: "design-review",
        revising: undefined,
        lastErrorCode: "DESIGN_REVISION_NOT_APPLIED",
      };
    }
    const plan = parsed.data;
    const revision = (state.designRevision ?? 0) + 1;
    const hash = hashDesignPlan(plan, revision);
    const rendered = encodeBlueprintMessage(plan, revision);
    await deps.workspaceQuery.appendMessage({
      tenantId: state.tenantId,
      conversationId: state.conversationId,
      role: "assistant",
      content: rendered,
    });
    return {
      designPlan: plan,
      designPlanHash: hash,
      designRevision: revision,
      stage: "design-review",
      revising: undefined,
    };
  };
}

/**
 * Canonical sha256 over the plan plus its revision number. Keys are
 * serialised in sorted order (recursively) so the same plan always hashes the
 * same, and a revision bump always yields a new hash — even if the plan body
 * is unchanged, matching the spec's "修订产生新版本". The revision is folded
 * into the hash only; it never touches the strict DesignPlan body stored on
 * state.
 */
function hashDesignPlan(plan: DesignPlan, revision: number): string {
  const canonical = stableStringify({ ...plan, revision });
  return createHash("sha256").update(canonical).digest("hex");
}

/** Deterministic JSON serialisation: object keys emitted in sorted order. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const parts = Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`);
    return `{${parts.join(",")}}`;
  }
  return JSON.stringify(value);
}

/** The latest user turn, used as the requirement text for the model. */
function latestUserMessage(state: AgentGraphStateValue): string | undefined {
  for (let i = state.recentMessages.length - 1; i >= 0; i -= 1) {
    const message = state.recentMessages[i];
    if (message !== undefined && message.role === "user") return message.content;
  }
  return undefined;
}
