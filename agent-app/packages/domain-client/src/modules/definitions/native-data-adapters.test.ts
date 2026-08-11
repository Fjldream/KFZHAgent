import { describe, expect, it } from "vitest";
import {
  parseChartData,
  parseTableData,
  serializeNativeData,
  toNativeChartProperties,
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
    expect(toNativeChartProperties(chart)).toEqual(expect.objectContaining({
      title: expect.objectContaining({ text: "产线 \"A\"\n状态\u2028" }),
      comment: expect.stringMatching(/^kf-module-chart\/v1:/),
    }));
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

  it("accepts only typed table columns and rows, then maps them to reviewed datagrid fields", () => {
    const table = parseTableData({
      columns: [{ key: "device", label: "设备" }, { key: "temperature", label: "温度", align: "right" }],
      rows: [{ device: "泵 A", temperature: 42 }, { device: "泵 B", temperature: 39 }],
      pageSize: 20,
    });
    expect(toNativeTableProperties(table)).toEqual({
      data: [{ device: "泵 A", temperature: 42 }, { device: "泵 B", temperature: 39 }],
      queryParams: { kfModuleColumns: [{ key: "device", label: "设备", align: "left" }, { key: "temperature", label: "温度", align: "right" }] },
      pageSize: 20,
    });
  });

  it.each([
    { columns: [{ key: "__proto__", label: "bad" }], rows: [{ __proto__: "bad" }] },
    { columns: [{ key: "device", label: "设备" }], rows: [{ device: "<img src=x>" }] },
    { columns: [{ key: "device", label: "设备" }], rows: [{ device: "data:text/html,evil" }] },
    { columns: [{ key: "device", label: "设备" }], rows: [{ device: { nested: true } }] },
    { columns: [{ key: "device", label: "设备" }], rows: [{ device: 1, extra: 2 }] },
  ])("rejects unsafe or unmodelled table values", (value) => {
    expect(() => parseTableData(value)).toThrow();
  });
});
