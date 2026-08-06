import { createHash } from "node:crypto";
import { DesignPlanSchema, type DesignPlan } from "@kf/contracts";
import type { AgentGraphStateValue, AgentGraphUpdate } from "../state.js";
import type { SolutionGraphDeps } from "../ports.js";

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
    const rawPlan = await deps.modelPort.createDesignPlan(
      {
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
      },
      { revising },
    );
    const parsed = DesignPlanSchema.safeParse(rawPlan);
    if (!parsed.success) {
      // I1: never persist or hash garbage from the model; return to idle with
      // INVALID_MODEL_OUTPUT and no side effects.
      return { stage: "idle", lastErrorCode: "INVALID_MODEL_OUTPUT" };
    }
    const plan = parsed.data;
    const revision = (state.designRevision ?? 0) + 1;
    const hash = hashDesignPlan(plan, revision);
    const rendered = formatDesignPlan(plan, revision);
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

/** Bounded, human-readable plan for the conversation (spec §5.7). */
function formatDesignPlan(plan: DesignPlan, revision: number): string {
  const sections = plan.sections
    .map(
      (section) =>
        `  ${section.label}：${section.controls
          .map((control) => `${control.type}${control.text !== undefined ? `(${control.text})` : ""}`)
          .join("、")}`,
    )
    .join("\n");
  return [
    "您好，我已根据您的需求整理出一份设计草案，请您过目：",
    `设计计划 v${revision}`,
    `工程名：${plan.displayName}`,
    `摘要：${plan.summary}`,
    `布局：${plan.layoutConcept}`,
    `风格：${plan.styleDirection}`,
    `分区：\n${sections}`,
    `记忆点：${plan.signature}`,
    "您可以随时告诉我哪里需要调整；确认没问题的话，回复「确认」即可。",
  ].join("\n");
}

/** The latest user turn, used as the requirement text for the model. */
function latestUserMessage(state: AgentGraphStateValue): string | undefined {
  for (let i = state.recentMessages.length - 1; i >= 0; i -= 1) {
    const message = state.recentMessages[i];
    if (message !== undefined && message.role === "user") return message.content;
  }
  return undefined;
}
