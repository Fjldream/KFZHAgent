import { describe, expect, it } from "vitest";
import {
  ActionGraphSchema,
  ActionPlanSchema,
  SemanticEventBindingSchema,
} from "./action-graph.js";

const graphFixture = {
  schema: "kf-action-graph/v1",
  references: {
    pageIds: ["records-page"],
    controlIds: ["status-filter", "records-table", "detail-panel"],
    overlayIds: ["record-detail"],
    stateIds: ["selected-record"],
    mockDataIds: ["records"],
    scriptIds: ["filter-records"],
  },
  actions: [
    {
      id: "filter",
      trigger: { controlId: "status-filter", semanticEvent: "change" },
      conditions: [],
      effects: [{ kind: "run-script", scriptId: "filter-records" }],
      afterActionIds: [],
    },
    {
      id: "select",
      trigger: { controlId: "records-table", semanticEvent: "row-select" },
      conditions: [{
        left: { kind: "local-state", stateId: "selected-record" },
        operator: "not-equals",
        right: { kind: "literal", value: null },
      }],
      effects: [{ kind: "set-visibility", targetId: "detail-panel", visible: true }],
      afterActionIds: ["filter"],
    },
    {
      id: "open",
      trigger: { controlId: "detail-panel", semanticEvent: "click" },
      conditions: [],
      effects: [{ kind: "open-overlay", overlayId: "record-detail" }],
      afterActionIds: ["select"],
    },
  ],
};

describe("ActionGraph contracts", () => {
  it("accepts a bounded typed graph with exactly one trigger owner per action", () => {
    expect(ActionGraphSchema.parse(graphFixture).actions).toHaveLength(3);
  });

  it("rejects unknown effect and condition references with stable errors", () => {
    const unknownTarget = structuredClone(graphFixture);
    unknownTarget.actions[1]!.effects = [{ kind: "set-visibility", targetId: "missing-control", visible: true }];
    const targetResult = ActionGraphSchema.safeParse(unknownTarget);
    expect(targetResult.success).toBe(false);
    if (!targetResult.success) expect(targetResult.error.issues[0]?.message).toBe("ACTION_TARGET_UNKNOWN: missing-control");

    const unknownState = structuredClone(graphFixture);
    unknownState.actions[1]!.conditions[0]!.left = { kind: "local-state", stateId: "missing-state" };
    const stateResult = ActionGraphSchema.safeParse(unknownState);
    expect(stateResult.success).toBe(false);
    if (!stateResult.success) expect(stateResult.error.issues[0]?.message).toBe("ACTION_CONDITION_STATE_UNKNOWN: missing-state");
  });

  it("rejects duplicate ids, dependency cycles, and effectless actions", () => {
    const duplicate = structuredClone(graphFixture);
    duplicate.actions[1]!.id = "filter";
    expect(ActionGraphSchema.safeParse(duplicate).success).toBe(false);

    const cycle = structuredClone(graphFixture);
    cycle.actions[0]!.afterActionIds = ["open"];
    expect(ActionGraphSchema.safeParse(cycle).success).toBe(false);

    const effectless = structuredClone(graphFixture);
    effectless.actions[0]!.effects = [];
    expect(ActionGraphSchema.safeParse(effectless).success).toBe(false);
  });

  it("validates the maximum action chain iteratively", () => {
    const actions = Array.from({ length: 200 }, (_, index) => ({
      id: `action-${index}`,
      trigger: { controlId: "status-filter", semanticEvent: "change" },
      conditions: [],
      effects: [{ kind: "show-feedback", level: "info", message: `步骤 ${index}` }],
      afterActionIds: index === 0 ? [] : [`action-${index - 1}`],
    }));
    expect(ActionGraphSchema.safeParse({ ...graphFixture, actions }).success).toBe(true);
    actions[0]!.afterActionIds = ["action-199"];
    expect(ActionGraphSchema.safeParse({ ...graphFixture, actions }).success).toBe(false);
  });

  it("keeps the Phase 2 flat action and embedded event-binding source shapes", () => {
    expect(ActionPlanSchema.safeParse({
      id: "open-detail",
      kind: "open-overlay",
      overlayId: "record-detail",
      afterActionIds: [],
    }).success).toBe(true);
    expect(SemanticEventBindingSchema.safeParse({
      semanticEvent: "click",
      actionIds: ["open-detail"],
    }).success).toBe(true);
    expect(ActionPlanSchema.safeParse({
      id: "set-record",
      kind: "set-state",
      stateId: "selected-record",
      value: { kind: "record", fields: [{ name: "left", value: 0 }] },
      afterActionIds: [],
    }).success).toBe(false);
    expect(ActionPlanSchema.safeParse({
      id: "set-record",
      kind: "set-state",
      stateId: "selected-record",
      value: "document.querySelector('#app')",
      afterActionIds: [],
    }).success).toBe(false);
    expect(ActionPlanSchema.safeParse({
      id: "linkId",
      kind: "show-feedback",
      level: "info",
      message: "完成",
      afterActionIds: [],
    }).success).toBe(false);
  });
});
