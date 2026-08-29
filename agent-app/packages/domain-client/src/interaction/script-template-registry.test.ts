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
    { name: "key", description: "记录编号", refKind: "control", refId: "visitor-code" },
    { name: "field-1", description: "访客姓名", refKind: "control", refId: "visitor-name" },
  ],
  outputs: [
    { name: "updated", description: "更新后的记录", refKind: "mock-data", refId: "updated-records" },
    { name: "view", description: "访客表格", refKind: "control", refId: "records-table" },
  ],
  parameters: [
    { name: "operation", value: "append" },
    { name: "key-field", value: "code" },
    { name: "field-1-name", value: "name" },
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
    expect(templates.map(({ id, availability, diagnostic }) => ({ id, availability, diagnostic }))).toEqual([
      { id: "form-validate-submit", availability: "supported", diagnostic: undefined },
      { id: "master-detail-fill", availability: "planned", diagnostic: "SCRIPT_TEMPLATE_INPUT_WRITE_UNVERIFIED" },
      { id: "multi-filter", availability: "supported", diagnostic: undefined },
      { id: "record-mutate", availability: "planned", diagnostic: "SCRIPT_TEMPLATE_PERSISTENT_DATA_MUTATION_UNVERIFIED" },
      { id: "reset-controls", availability: "planned", diagnostic: "SCRIPT_TEMPLATE_RESET_WRITE_UNVERIFIED" },
    ]);
    expect(() => requireScriptTemplate("missing-template")).toThrow("SCRIPT_TEMPLATE_UNKNOWN: missing-template");
  });

  it("renders multi-filter with a statically bounded record set and exact output writes", () => {
    expect(renderScriptTemplate("multi-filter", multiFilter)).toBe([
      "const records = $data.get(\"visitor-records\");",
      "const criterion1 = $control.getValue(\"status-filter\");",
      "const criterion2 = $control.getValue(\"name-filter\");",
      "const filtered = records.slice(0, 100).filter((record) => (record[\"status\"] === criterion1 && String(record[\"name\"]).startsWith(String(criterion2))));",
      "$control.setData(\"records-table\", filtered);",
    ].join("\n"));
  });

  it("rejects the legacy filtered output instead of silently treating a declared port as ephemeral", () => {
    expect(() => renderScriptTemplate("multi-filter", {
      ...multiFilter,
      outputs: [
        { name: "filtered", description: "筛选结果", refKind: "mock-data", refId: "filtered-records" },
        ...multiFilter.outputs,
      ],
    })).toThrow(/SCRIPT_TEMPLATE_PARAMETER_INVALID: multi-filter \(outputs\.filtered\)/);
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
      "$state.set(\"submitted-state\", Boolean(valid));",
      "if (valid) { $feedback.show(\"success\", \"访客信息已模拟提交\"); }",
    ].join("\n"));
  });

  it("renders a bounded local append and publishes every declared output", () => {
    expect(renderScriptTemplate("record-mutate", appendRecord)).toBe([
      "const records = $data.get(\"visitor-records\");",
      "const nextRecords = records.slice(0, 100);",
      "const recordKey = $control.getValue(\"visitor-code\");",
      "const nextRecord = { \"code\": recordKey, \"name\": $control.getValue(\"visitor-name\") };",
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
      "for (let index = 0; index < 100 && index < nextRecords.length; index += 1) { if (nextRecords[index][\"code\"] === recordKey) { nextRecords[index] = { ...nextRecords[index], \"name\": $control.getValue(\"visitor-name\"), \"code\": recordKey }; } }",
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

  it("revalidates generated source and never truncates the 8000-character contract", () => {
    const longValue = "值".repeat(2_000);
    const bounded = {
      ...reset,
      inputs: [],
      outputs: [1, 2, 3].map((index) => ({ name: `target-${index}`, description: `重置项${index}`, refKind: "control" as const, refId: `reset-control-${index}` })),
      parameters: [
        ...[1, 2, 3].map((index) => ({ name: `target-${index}-value`, value: longValue })),
        { name: "success-message", value: "重置完成" },
      ],
    };
    const exact = [
      ...[1, 2, 3].map((index) => `$control.setValue("reset-control-${index}", ${JSON.stringify(longValue)});`),
      "$feedback.show(\"info\", \"重置完成\");",
    ].join("\n");
    const source = renderScriptTemplate("reset-controls", bounded);
    expect(source).toBe(exact);
    expect(source.length).toBeLessThanOrEqual(8_000);

    const oversized = {
      ...bounded,
      outputs: [...bounded.outputs, { name: "target-4", description: "重置项4", refKind: "control" as const, refId: "reset-control-4" }],
      parameters: [
        ...bounded.parameters.slice(0, -1),
        { name: "target-4-value", value: longValue },
        bounded.parameters.at(-1)!,
      ],
    };
    expect(() => renderScriptTemplate("reset-controls", oversized)).toThrow(/SCRIPT_TEMPLATE_OUTPUT_INVALID: reset-controls/);
  });

  it("keeps record-mutate maximum strings within the canonical source bound", () => {
    const longKeyField = `a${"b".repeat(99)}`;
    const longValueField = `c${"d".repeat(99)}`;
    const maximal = {
      ...appendRecord,
      inputs: appendRecord.inputs.map((input, index) => ({ ...input, refId: `${String.fromCharCode(97 + index)}${"x".repeat(99)}` })),
      outputs: appendRecord.outputs.map((output, index) => ({ ...output, refId: `${String.fromCharCode(109 + index)}${"y".repeat(99)}` })),
      parameters: appendRecord.parameters.map((parameter) => parameter.name === "key-field"
        ? { ...parameter, value: longKeyField }
        : parameter.name === "field-1-name" ? { ...parameter, value: longValueField }
        : parameter.name === "success-message" ? { ...parameter, value: "完成".repeat(200) } : parameter),
    };
    const source = renderScriptTemplate("record-mutate", maximal);
    expect(source.length).toBeLessThanOrEqual(8_000);
    expect(ScriptPlanSchema.safeParse({
      id: maximal.id,
      kind: "custom",
      programVersion: "semantic-js/v1",
      purpose: maximal.purpose,
      inputs: maximal.inputs,
      outputs: maximal.outputs,
      source,
    }).success).toBe(true);
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

  it("rejects root and nested proxies without invoking a single reflection trap", () => {
    for (const nested of [false, true]) {
      let traps = 0;
      const target = structuredClone(multiFilter);
      const handler: ProxyHandler<object> = {
        ownKeys(value) { traps += 1; return Reflect.ownKeys(value); },
        getOwnPropertyDescriptor(value, key) { traps += 1; return Reflect.getOwnPropertyDescriptor(value, key); },
        getPrototypeOf(value) { traps += 1; return Reflect.getPrototypeOf(value); },
      };
      const invocation = nested
        ? { ...target, parameters: [new Proxy(target.parameters[0], handler), ...target.parameters.slice(1)] }
        : new Proxy(target, handler);
      expect(() => renderScriptTemplate("multi-filter", invocation)).toThrow(/SCRIPT_TEMPLATE_PARAMETER_INVALID/);
      expect(traps).toBe(0);
    }
  });

  it.each(["append", "update"] as const)("rejects normalized field aliases and key overwrites for %s", (operation) => {
    const base = {
      ...appendRecord,
      inputs: [
        appendRecord.inputs[0],
        appendRecord.inputs[1],
        appendRecord.inputs[2],
        { name: "field-2", description: "别名字段", refKind: "control", refId: "visitor-alias" },
      ],
      parameters: [
        { name: "operation", value: operation },
        { name: "key-field", value: "record-id" },
        { name: "field-1-name", value: "user-id" },
        { name: "field-2-name", value: "user_id" },
        { name: "success-message", value: "本地记录已更新" },
      ],
    };
    expect(() => renderScriptTemplate("record-mutate", operation === "update"
      ? { ...base, inputs: [base.inputs[0], { name: "key", description: "记录编号", refKind: "local-state", refId: "selected-record" }, ...base.inputs.slice(2)] }
      : base)).toThrow(/SCRIPT_TEMPLATE_PARAMETER_INVALID: record-mutate \(fields\.1\.field\)/);

    const keyCollision = {
      ...appendRecord,
      parameters: appendRecord.parameters.map((parameter) => parameter.name === "operation"
        ? { ...parameter, value: operation }
        : parameter.name === "field-1-name" ? { ...parameter, value: "CODE" } : parameter),
      ...(operation === "update" ? { inputs: [appendRecord.inputs[0], { name: "key", description: "记录编号", refKind: "local-state", refId: "selected-record" }, appendRecord.inputs[2]] } : {}),
    };
    expect(() => renderScriptTemplate("record-mutate", keyCollision)).toThrow(/SCRIPT_TEMPLATE_PARAMETER_INVALID: record-mutate \(fields\.0\.field\)/);
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
