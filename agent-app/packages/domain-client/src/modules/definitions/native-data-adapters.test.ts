import { describe, expect, it } from "vitest";
import {
  parseChartData,
  parseTableData,
  serializeNativeData,
  toNativeTableProperties,
} from "./native-data-adapters.js";

describe("native data adapters", () => {
  it("accepts bounded semantic chart data and deterministically escapes transport text", () => {
    const chart = parseChartData({
      kind: "bar",
      title: "产线 \"A\"\n状态\u2028",
      labels: ["08:00", "09:00"],
      series: [{ name: "产量", values: [12, 18] }],
    });

    const encoded = serializeNativeData(chart);
    expect(encoded).toContain('\\"A\\"');
    expect(encoded).toContain("\\n");
    expect(encoded).not.toContain("\u2028");
    expect(encoded).not.toContain("\u2029");
    expect(JSON.parse(encoded)).toEqual(chart);
  });

  it.each([
    { kind: "line", labels: ["<script>alert(1)</script>"], series: [{ name: "A", values: [1] }] },
    { kind: "line", labels: ["{{ dangerous }}"], series: [{ name: "A", values: [1] }] },
    { kind: "line", labels: ["x"], series: [{ name: "javascript:alert(1)", values: [1] }] },
    { kind: "line", labels: ["x"], series: [{ name: "A", values: ["function evil() {}"] }] },
    { kind: "line", labels: ["x"], series: [{ name: "A", values: [() => 1] }] },
  ])("rejects model-authored executable or HTML chart content", (value) => {
    expect(() => parseChartData(value)).toThrow("UNSAFE_MODULE_DATA");
  });

  it("accepts only typed table columns and rows, then maps them to real KF datagrid data/columns fields", () => {
    const table = parseTableData({
      columns: [{ key: "device", label: "设备" }, { key: "temperature", label: "温度", align: "right" }],
      rows: [{ device: "泵 A", temperature: 42 }, { device: "泵 B", temperature: 39 }],
      pageSize: 20,
    });
    expect(toNativeTableProperties(table)).toEqual({
      data: [{ device: "泵 A", temperature: 42 }, { device: "泵 B", temperature: 39 }],
      columns: [[{ field: "device", title: "设备", width: "50%", align: "left" }, { field: "temperature", title: "温度", width: "50%", align: "right" }]],
      pageSize: 20,
    });
  });

  it.each([
    { columns: [{ key: "__proto__", label: "bad" }], rows: [{ __proto__: "bad" }] },
    { columns: [{ key: "device", label: "设备" }], rows: [{ device: "<img src=x>" }] },
    { columns: [{ key: "device", label: "设备" }], rows: [{ device: "data:text/html,evil" }] },
    { columns: [{ key: "device", label: "设备" }], rows: [{ device: { nested: true } }] },
    { columns: [{ key: "device", label: "设备" }], rows: [{ device: 1, extra: 2 }] },
    { columns: [{ key: "device", label: "设备" }], rows: [] },
    { columns: [{ key: "device", label: "${template}" }], rows: [{ device: "ok" }] },
    { columns: [{ key: "device", label: "`template`" }], rows: [{ device: "ok" }] },
  ])("rejects unsafe or unmodelled table values", (value) => {
    expect(() => parseTableData(value)).toThrow();
  });

  it("escapes U+2029 in a table transport round-trip", () => {
    const table = parseTableData({
      columns: [{ key: "note", label: "备注" }],
      rows: [{ note: "分隔\u2029文本" }],
    });
    const encoded = serializeNativeData(table);
    expect(encoded).not.toContain("\u2029");
    expect(JSON.parse(encoded)).toEqual(table);
  });

  it("rejects accessors, cycles, symbols, and non-finite numbers before native materialization", () => {
    const accessor = { columns: [{ key: "value", label: "值" }], rows: [{}] } as Record<string, unknown>;
    Object.defineProperty((accessor.rows as Array<Record<string, unknown>>)[0]!, "value", { enumerable: true, get: () => 1 });
    const cyclic = { columns: [{ key: "value", label: "值" }], rows: [{ value: 1 }] } as Record<string, unknown>;
    cyclic.self = cyclic;
    const withSymbol = { columns: [{ key: "value", label: "值" }], rows: [{ value: 1 }] };
    Object.defineProperty(withSymbol, Symbol("unsafe"), { enumerable: true, value: "x" });

    expect(() => parseTableData(accessor)).toThrow("UNSAFE_MODULE_DATA");
    expect(() => parseTableData(cyclic)).toThrow("UNSAFE_MODULE_DATA");
    expect(() => parseTableData(withSymbol)).toThrow("UNSAFE_MODULE_DATA");
    expect(() => parseTableData({ columns: [{ key: "value", label: "值" }], rows: [{ value: Number.POSITIVE_INFINITY }] })).toThrow();
  });
});
