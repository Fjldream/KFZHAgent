import { describe, expect, it } from "vitest";
import {
  ActionGraphSchema,
  ActionPlanSchema,
  ActionValueSchema,
  SemanticEventBindingSchema,
  semanticImplementationTextIssue,
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
    const chainGraph = { ...graphFixture, references: { ...graphFixture.references, scriptIds: [] }, actions };
    expect(ActionGraphSchema.safeParse(chainGraph).success).toBe(true);
    actions[0]!.afterActionIds = ["action-199"];
    expect(ActionGraphSchema.safeParse(chainGraph).success).toBe(false);
  });

  it("uses one implementation-leakage guard for action text and conditions", () => {
    for (const payload of [
      ".a,.b",
      "[data-secret]",
      "button:hover",
      "$control?.[\"styleDataNew\"](\"x\")",
      "styleDataNew",
    ]) {
      expect(semanticImplementationTextIssue(payload, "semantic-text"), payload).toBeDefined();
      expect(ActionPlanSchema.safeParse({
        id: "feedback",
        kind: "show-feedback",
        level: "info",
        message: payload,
        afterActionIds: [],
      }).success, payload).toBe(false);
      expect(ActionPlanSchema.safeParse({
        id: "conditional",
        kind: "show-feedback",
        level: "info",
        message: "正常提示",
        conditions: [{
          left: { kind: "literal", value: payload },
          operator: "equals",
          right: { kind: "literal", value: "正常值" },
        }],
        afterActionIds: [],
      }).success, payload).toBe(false);
    }
    for (const value of ["KPI(关键指标)", "Version(3.6)", "状态 status:active", "#ffffff"]) {
      expect(semanticImplementationTextIssue(value, "semantic-text"), value).toBeUndefined();
    }
  });

  it("preflights recursive values without getters, recursion overflow, or bare descriptor errors", () => {
    let getterCalls = 0;
    const accessor = { kind: "list" };
    Object.defineProperty(accessor, "items", {
      enumerable: true,
      get() {
        getterCalls += 1;
        return [];
      },
    });
    expect(ActionValueSchema.safeParse(accessor).success).toBe(false);
    expect(getterCalls).toBe(0);

    const cyclic: { kind: "list"; items: object[] } = { kind: "list", items: [] };
    cyclic.items.push(cyclic);
    expect(() => ActionValueSchema.safeParse(cyclic)).not.toThrow();
    expect(ActionValueSchema.safeParse(cyclic).success).toBe(false);

    const sparse = new Array(2);
    sparse[0] = "present";
    expect(ActionValueSchema.safeParse({ kind: "list", items: sparse }).success).toBe(false);

    const hostile = new Proxy({}, {
      ownKeys() {
        throw new Error("hostile descriptor trap");
      },
    });
    expect(() => ActionValueSchema.safeParse(hostile)).not.toThrow();
    expect(ActionValueSchema.safeParse(hostile).success).toBe(false);

    let depthEight: object = "leaf" as never;
    for (let depth = 0; depth < 8; depth += 1) depthEight = { kind: "list", items: [depthEight] };
    expect(ActionValueSchema.safeParse(depthEight).success).toBe(true);
    const depthNine = { kind: "list", items: [depthEight] };
    expect(ActionValueSchema.safeParse(depthNine).success).toBe(false);

    expect(ActionValueSchema.safeParse({ kind: "list", items: Array.from({ length: 32 }, () => null) }).success).toBe(true);
    expect(ActionValueSchema.safeParse({ kind: "list", items: Array.from({ length: 33 }, () => null) }).success).toBe(false);
  });

  it("rejects ActionGraph script references without a run-script effect", () => {
    const orphan = structuredClone(graphFixture);
    orphan.actions = orphan.actions.filter((action) => action.id !== "filter");
    orphan.actions[0]!.afterActionIds = [];
    const result = ActionGraphSchema.safeParse(orphan);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some((issue) => issue.message === "ACTION_SCRIPT_ORPHANED: filter-records")).toBe(true);
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
