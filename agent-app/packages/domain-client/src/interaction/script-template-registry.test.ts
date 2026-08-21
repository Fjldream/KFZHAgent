import { ScriptPlanSchema } from "@kf/contracts";
import { describe, expect, it } from "vitest";
import {
  listScriptTemplates,
  renderScriptTemplate,
  requireScriptTemplate,
} from "./script-template-registry.js";

const multiFilter = {
  id: "filter-records",
  kind: "template",
  template: "multi-filter",
  purpose: "按状态与名称筛选本地访客记录",
  inputs: [
    { name: "records", description: "访客记录", refKind: "mock-data", refId: "visitor-records" },
    { name: "criterion-1-value", description: "状态条件", refKind: "control", refId: "status-filter" },
    { name: "criterion-2-value", description: "名称条件", refKind: "control", refId: "name-filter" },
  ],
  outputs: [
    { name: "filtered", description: "筛选结果", refKind: "mock-data", refId: "filtered-records" },
    { name: "view", description: "结果表格", refKind: "control", refId: "records-table" },
  ],
  parameters: [
    { name: "combine", value: "all" },
    { name: "criterion-1-field", value: "status" },
    { name: "criterion-1-mode", value: "equals" },
    { name: "criterion-2-field", value: "name" },
    { name: "criterion-2-mode", value: "starts-with" },
  ],
} as const;

const masterDetail = {
  id: "fill-detail",
  kind: "template",
  template: "master-detail-fill",
  purpose: "将选中访客填入详情表单",
  inputs: [],
  outputs: [
    { name: "target-1", description: "访客姓名", refKind: "control", refId: "visitor-name" },
    { name: "target-2", description: "访客单位", refKind: "control", refId: "visitor-company" },
  ],
  parameters: [
    { name: "mapping-1-field", value: "name" },
    { name: "mapping-2-field", value: "company" },
    { name: "missing-message", value: "请先选择一条访客记录" },
  ],
} as const;

const validateSubmit = {
  id: "submit-form",
  kind: "template",
  template: "form-validate-submit",
  purpose: "校验访客表单并模拟提交",
  inputs: [
    { name: "field-1", description: "访客姓名", refKind: "control", refId: "visitor-name" },
    { name: "field-2", description: "联系电话", refKind: "control", refId: "visitor-phone" },
  ],
  outputs: [
    { name: "submitted", description: "本地提交状态", refKind: "local-state", refId: "submitted-state" },
  ],
  parameters: [
    { name: "field-1-required", value: true },
    { name: "field-1-message", value: "请输入访客姓名" },
    { name: "field-2-required", value: false },
    { name: "success-message", value: "访客信息已模拟提交" },
  ],
} as const;

const appendRecord = {
  id: "append-record",
  kind: "template",
  template: "record-mutate",
  purpose: "向本地访客集合追加记录",
  inputs: [
    { name: "records", description: "访客记录", refKind: "mock-data", refId: "visitor-records" },
    { name: "field-1", description: "记录编号", refKind: "control", refId: "visitor-code" },
    { name: "field-2", description: "访客姓名", refKind: "control", refId: "visitor-name" },
  ],
  outputs: [
    { name: "updated", description: "更新后的记录", refKind: "mock-data", refId: "updated-records" },
    { name: "view", description: "访客表格", refKind: "control", refId: "records-table" },
  ],
  parameters: [
    { name: "operation", value: "append" },
    { name: "field-1-name", value: "code" },
    { name: "field-2-name", value: "name" },
    { name: "success-message", value: "已在本地追加访客记录" },
  ],
} as const;

const reset = {
  id: "reset-demo",
  kind: "template",
  template: "reset-controls",
  purpose: "恢复筛选项与本地结果",
  inputs: [
    { name: "source-3", description: "初始访客记录", refKind: "mock-data", refId: "visitor-records" },
  ],
  outputs: [
    { name: "target-1", description: "状态筛选项", refKind: "control", refId: "status-filter" },
    { name: "target-2", description: "提交状态", refKind: "local-state", refId: "submitted-state" },
    { name: "target-3", description: "筛选结果", refKind: "mock-data", refId: "filtered-records" },
  ],
  parameters: [
    { name: "target-1-value", value: "all" },
    { name: "target-2-value", value: false },
    { name: "success-message", value: "演示状态已重置" },
  ],
} as const;

describe("reviewed script template registry", () => {
  it("lists exactly five deeply immutable templates in code-point order", () => {
    const templates = listScriptTemplates();
    expect(templates.map((template) => template.id)).toEqual([
      "form-validate-submit",
      "master-detail-fill",
      "multi-filter",
      "record-mutate",
      "reset-controls",
    ]);
    expect(Object.isFrozen(templates)).toBe(true);
    expect(templates.every((template) => Object.isFrozen(template) && Object.isFrozen(template.semanticCalls))).toBe(true);
    expect(requireScriptTemplate("record-mutate").operations).toEqual(["append", "update", "remove"]);
    expect(Object.isFrozen(requireScriptTemplate("record-mutate").operations)).toBe(true);
    expect(requireScriptTemplate("multi-filter")).toBe(templates[2]);
    expect(() => requireScriptTemplate("missing-template")).toThrow("SCRIPT_TEMPLATE_UNKNOWN: missing-template");
  });

  it("renders multi-filter with a statically bounded record set and exact output writes", () => {
    expect(renderScriptTemplate("multi-filter", multiFilter)).toBe([
      "const records = $data.get(\"visitor-records\");",
      "const criterion1 = $control.getValue(\"status-filter\");",
      "const criterion2 = $control.getValue(\"name-filter\");",
      "const filtered = records.slice(0, 100).filter((record) => (record[\"status\"] === criterion1 && String(record[\"name\"]).startsWith(String(criterion2))));",
      "$data.set(\"filtered-records\", filtered);",
      "$control.setData(\"records-table\", filtered);",
    ].join("\n"));
  });

  it("renders selected-record detail fill without an undeclared selection API", () => {
    expect(renderScriptTemplate("master-detail-fill", masterDetail)).toBe([
      "const selectedRecord = $event.record();",
      "if (selectedRecord === null) {",
      "  $feedback.show(\"warning\", \"请先选择一条访客记录\");",
      "} else {",
      "  $control.setValue(\"visitor-name\", selectedRecord[\"name\"]);",
      "  $control.setValue(\"visitor-company\", selectedRecord[\"company\"]);",
      "}",
    ].join("\n"));
  });

  it("renders local-only validation and simulated submit", () => {
    expect(renderScriptTemplate("form-validate-submit", validateSubmit)).toBe([
      "const field1 = $control.getValue(\"visitor-name\");",
      "const field2 = $control.getValue(\"visitor-phone\");",
      "let valid = true;",
      "if (field1 === null || String(field1).trim() === \"\") { valid = false; $feedback.show(\"error\", \"请输入访客姓名\"); }",
      "$state.set(\"submitted-state\", valid);",
      "if (valid) { $feedback.show(\"success\", \"访客信息已模拟提交\"); }",
    ].join("\n"));
  });

  it("renders a bounded local append and publishes every declared output", () => {
    expect(renderScriptTemplate("record-mutate", appendRecord)).toBe([
      "const records = $data.get(\"visitor-records\");",
      "const nextRecords = records.slice(0, 100);",
      "const nextRecord = { \"code\": $control.getValue(\"visitor-code\"), \"name\": $control.getValue(\"visitor-name\") };",
      "if (nextRecords.length < 100) { nextRecords.push(nextRecord); }",
      "$data.set(\"updated-records\", nextRecords);",
      "$control.setData(\"records-table\", nextRecords);",
      "$feedback.show(\"success\", \"已在本地追加访客记录\");",
    ].join("\n"));
  });

  it("renders bounded local update and remove branches", () => {
    const update = {
      ...appendRecord,
      id: "update-record",
      inputs: [
        appendRecord.inputs[0],
        { name: "key", description: "选中记录编号", refKind: "local-state", refId: "selected-code" },
        { name: "field-1", description: "访客姓名", refKind: "control", refId: "visitor-name" },
      ],
      parameters: [
        { name: "operation", value: "update" },
        { name: "key-field", value: "code" },
        { name: "field-1-name", value: "name" },
        { name: "success-message", value: "已在本地更新访客记录" },
      ],
    };
    expect(renderScriptTemplate("record-mutate", update)).toBe([
      "const records = $data.get(\"visitor-records\");",
      "const nextRecords = records.slice(0, 100);",
      "const recordKey = $state.get(\"selected-code\");",
      "for (let index = 0; index < 100 && index < nextRecords.length; index += 1) { if (nextRecords[index][\"code\"] === recordKey) { nextRecords[index] = { \"code\": recordKey, \"name\": $control.getValue(\"visitor-name\") }; } }",
      "$data.set(\"updated-records\", nextRecords);",
      "$control.setData(\"records-table\", nextRecords);",
      "$feedback.show(\"success\", \"已在本地更新访客记录\");",
    ].join("\n"));

    const remove = {
      ...appendRecord,
      id: "delete-record",
      inputs: [
        appendRecord.inputs[0],
        { name: "key", description: "待删除记录编号", refKind: "control", refId: "visitor-code" },
      ],
      parameters: [
        { name: "operation", value: "remove" },
        { name: "key-field", value: "code" },
        { name: "success-message", value: "已在本地删除访客记录" },
      ],
    };
    expect(renderScriptTemplate("record-mutate", remove)).toBe([
      "const records = $data.get(\"visitor-records\");",
      "const nextRecords = records.slice(0, 100);",
      "const recordKey = $control.getValue(\"visitor-code\");",
      "const changedRecords = nextRecords.filter((record) => record[\"code\"] !== recordKey);",
      "$data.set(\"updated-records\", changedRecords);",
      "$control.setData(\"records-table\", changedRecords);",
      "$feedback.show(\"success\", \"已在本地删除访客记录\");",
    ].join("\n"));
  });

  it("renders deterministic reset writes for controls, state, and local data", () => {
    expect(renderScriptTemplate("reset-controls", reset)).toBe([
      "$control.setValue(\"status-filter\", \"all\");",
      "$state.set(\"submitted-state\", false);",
      "const resetData3 = $data.get(\"visitor-records\").slice(0, 100);",
      "$data.set(\"filtered-records\", resetData3);",
      "$feedback.show(\"info\", \"演示状态已重置\");",
    ].join("\n"));
  });

  it("is byte-deterministic and remains accepted by the Task 1 semantic-source boundary", () => {
    const first = renderScriptTemplate("multi-filter", structuredClone(multiFilter));
    const second = renderScriptTemplate("multi-filter", structuredClone(multiFilter));
    expect(second).toBe(first);
    expect(ScriptPlanSchema.safeParse({
      id: "compiled-filter-template",
      kind: "custom",
      programVersion: "semantic-js/v1",
      purpose: "执行经过审查的本地多条件筛选",
      inputs: multiFilter.inputs,
      outputs: multiFilter.outputs,
      source: first,
    }).success).toBe(true);
    expect(first).not.toMatch(/(?:fetch|XMLHttpRequest|WebSocket|document|window|globalThis|localStorage|sessionStorage|eval|Function|require|import\s*\()/);
    expect(first).not.toMatch(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}|linkId|querySelector|#[A-Za-z_.[]/);
  });

  it("keeps every reviewed template inside the Task 1 semantic-source contract", () => {
    for (const [id, invocation] of [
      ["form-validate-submit", validateSubmit],
      ["master-detail-fill", masterDetail],
      ["multi-filter", multiFilter],
      ["record-mutate", appendRecord],
      ["reset-controls", reset],
    ] as const) {
      const source = renderScriptTemplate(id, invocation);
      expect(ScriptPlanSchema.safeParse({
        id: `reviewed-${id}`,
        kind: "custom",
        programVersion: "semantic-js/v1",
        purpose: "执行经过审查的本地交互模板",
        inputs: invocation.inputs,
        outputs: invocation.outputs,
        source,
      }).success, id).toBe(true);
      expect(source.length).toBeLessThanOrEqual(8_000);
    }
  });

  it.each([
    ["network operation", { ...appendRecord, parameters: appendRecord.parameters.map((parameter) => parameter.name === "operation" ? { ...parameter, value: "network-sync" } : parameter) }],
    ["canonical-contract-forbidden delete spelling", { ...appendRecord, parameters: appendRecord.parameters.map((parameter) => parameter.name === "operation" ? { ...parameter, value: "delete" } : parameter) }],
    ["unknown parameter", { ...multiFilter, parameters: [...multiFilter.parameters, { name: "snippet", value: "本地筛选" }] }],
    ["criterion index gap", { ...multiFilter, inputs: multiFilter.inputs.map((input) => input.name === "criterion-2-value" ? { ...input, name: "criterion-3-value" } : input), parameters: multiFilter.parameters.map((parameter) => parameter.name.includes("criterion-2-") ? { ...parameter, name: parameter.name.replace("criterion-2-", "criterion-3-") } : parameter) }],
    ["duplicate semantic ref", { ...multiFilter, inputs: multiFilter.inputs.map((input) => input.name === "criterion-2-value" ? { ...input, refId: "status-filter" } : input) }],
    ["extra input", { ...masterDetail, inputs: [{ name: "selection", description: "未使用选择", refKind: "local-state", refId: "selected-record" }] }],
    ["extra output", { ...validateSubmit, outputs: [...validateSubmit.outputs, { name: "unused", description: "未使用状态", refKind: "local-state", refId: "unused-state" }] }],
    ["source field", { ...multiFilter, source: "$data.set(\"x\", []);" }],
  ])("rejects %s instead of silently ignoring it", (_label, invocation) => {
    const failure = () => renderScriptTemplate(invocation.template, invocation);
    expect(failure).toThrow(/SCRIPT_TEMPLATE_PARAMETER_INVALID/);
    if (_label === "network operation" || _label === "canonical-contract-forbidden delete spelling") {
      expect(failure).toThrow(/append\|update\|remove/);
    }
  });

  it("does not invoke accessors while reparsing the untrusted invocation", () => {
    let reads = 0;
    const hostile = Object.create(null) as Record<string, object | string>;
    Object.defineProperty(hostile, "id", { enumerable: true, get: () => { reads += 1; return "filter-records"; } });
    Object.defineProperty(hostile, "kind", { enumerable: true, value: "template" });
    Object.defineProperty(hostile, "template", { enumerable: true, value: "multi-filter" });
    Object.defineProperty(hostile, "purpose", { enumerable: true, value: "本地筛选" });
    Object.defineProperty(hostile, "inputs", { enumerable: true, value: [] });
    Object.defineProperty(hostile, "outputs", { enumerable: true, value: [] });
    Object.defineProperty(hostile, "parameters", { enumerable: true, value: [] });
    expect(() => renderScriptTemplate("multi-filter", hostile)).toThrow(/SCRIPT_TEMPLATE_PARAMETER_INVALID/);
    expect(reads).toBe(0);
  });

  it("rejects extended arrays instead of letting canonical parsing drop hidden input", () => {
    const extended = structuredClone(multiFilter);
    Object.defineProperty(extended.parameters, "poison", {
      enumerable: true,
      value: { name: "snippet", value: "本地筛选" },
    });
    expect(() => renderScriptTemplate("multi-filter", extended)).toThrow(/SCRIPT_TEMPLATE_PARAMETER_INVALID/);
  });

  it("rejects the old generic master-detail fixture shape instead of maintaining a second protocol", () => {
    const genericOnly = {
      ...masterDetail,
      inputs: [
        { name: "records", description: "访客记录集合", refKind: "mock-data", refId: "visitor-records" },
        { name: "selection", description: "选中访客", refKind: "local-state", refId: "selected-visitor" },
      ],
      outputs: [{ name: "detail", description: "详情控件", refKind: "control", refId: "visitor-name" }],
      parameters: [
        { name: "emptyMessage", value: "请先选择一条访客记录" },
        { name: "target", refKind: "control", refId: "visitor-name" },
      ],
    };
    expect(ScriptPlanSchema.safeParse(genericOnly).success).toBe(true);
    expect(() => renderScriptTemplate("master-detail-fill", genericOnly)).toThrow(/SCRIPT_TEMPLATE_PARAMETER_INVALID/);
  });

  it("enforces the reviewed template count bounds", () => {
    const indexes = [3, 4, 5, 6, 7, 8, 9];
    const tooManyCriteria = {
      ...multiFilter,
      inputs: [
        ...multiFilter.inputs,
        ...indexes.map((index) => ({ name: `criterion-${index}-value`, description: `条件${index}`, refKind: "control" as const, refId: `filter-${index}` })),
      ],
      parameters: [
        ...multiFilter.parameters,
        ...indexes.flatMap((index) => [
          { name: `criterion-${index}-field`, value: `field-${index}` },
          { name: `criterion-${index}-mode`, value: "equals" },
        ]),
      ],
    };
    expect(() => renderScriptTemplate("multi-filter", tooManyCriteria)).toThrow(/SCRIPT_TEMPLATE_PARAMETER_INVALID/);
  });
});
