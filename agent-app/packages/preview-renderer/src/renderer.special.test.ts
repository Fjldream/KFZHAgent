// KF 特殊节点渲染测试：type="prototype"（prototypeName 分派）。
// CustomCharts → kf-special-custom；图表型（TrendChart/BarChart/PieChart/XYChart）
// → kf-special-chart；AlarmWindow/EventWindow → kf-special-alarm。
import { describe, expect, it } from "vitest";
import { renderKfProject, renderPagePreview } from "./index.js";
import type { PageIR } from "@kf/domain-client";

function pageWith(controls: PageIR["controls"]): PageIR {
  return { id: "p-special", name: "特殊节点页", width: 1440, height: 900, controls };
}

describe("KF 特殊节点渲染（type=\"prototype\"，按 prototypeName 分派）", () => {
  it("CustomCharts 渲染 kf-special-custom 占位（标题取 pageProperty.name + ECharts 标注）", () => {
    const html = renderPagePreview(
      pageWith([
        {
          id: "CustomCharts2", type: "prototype", prototypeName: "CustomCharts",
          x: 13, y: 5, width: 952, height: 513,
          pageProperty: {
            name: "自定义图表2",
            pagePos: { x: 13, y: 5 },
            pageSize: { width: 952, height: 513 },
          },
          objects: ["{\"name\":\"echart\",\"customChartsType\":1}"],
        },
      ]),
    );
    expect(html).toContain('data-type="prototype"');
    expect(html).toContain("kf-special-custom");
    expect(html).toContain("自定义图表2"); // pageProperty.name → 标题
    expect(html).toContain("ECharts 自定义图表");
    expect(html).toContain("left:13px;top:5px;width:952px;height:513px"); // 绝对定位
  });

  it("图表型渲染 kf-special-chart 占位（标题取 title.text + 中文类型标签）", () => {
    const html = renderPagePreview(
      pageWith([
        {
          id: "TrendChart1", type: "prototype", prototypeName: "TrendChart",
          x: 154, y: 609, width: 695, height: 304,
          title: { show: true, text: "实时趋势曲线" },
          areas: [], chartComponentType: 2,
        },
        {
          id: "Bar1", type: "prototype", prototypeName: "BarChart",
          x: 10, y: 10, width: 400, height: 200,
          title: { show: true, text: "产量统计" },
          areas: [], chartComponentType: 3,
        },
        {
          id: "Pie1", type: "prototype", prototypeName: "PieChart",
          x: 420, y: 10, width: 300, height: 200,
          title: { show: true, text: "占比分布" },
          areas: [], chartComponentType: 4,
        },
        {
          id: "XY1", type: "prototype", prototypeName: "XYChart",
          x: 10, y: 220, width: 500, height: 200,
          title: { show: true, text: "XY 曲线" },
          areas: [], chartComponentType: 5,
        },
      ]),
    );
    expect(html).toContain("kf-special-chart");
    expect(html).toContain("实时趋势曲线");
    expect(html).toContain("趋势图");
    expect(html).toContain("产量统计");
    expect(html).toContain("柱状图");
    expect(html).toContain("占比分布");
    expect(html).toContain("饼图");
    expect(html).toContain("XY 曲线");
    expect(html).toContain("XY曲线");
  });

  it("图表型标题回退：title.text 缺失时使用 prototypeName", () => {
    const html = renderPagePreview(
      pageWith([
        {
          id: "BarNoTitle", type: "prototype", prototypeName: "BarChart",
          x: 10, y: 10, width: 400, height: 200,
          areas: [], chartComponentType: 3,
        },
      ]),
    );
    expect(html).toContain("kf-special-chart");
    expect(html).toContain("BarChart"); // 标题回退 prototypeName
    expect(html).toContain("柱状图"); // 类型标签仍为中文
  });

  it("AlarmWindow 渲染 kf-special-alarm 占位（标题 + 告警窗口标签）", () => {
    const html = renderPagePreview(
      pageWith([
        {
          id: "AlarmWindow1", type: "prototype", prototypeName: "AlarmWindow",
          x: 28, y: 135, width: 354, height: 353,
          alarmWindowType: "实时报警窗", titleName: "报警窗",
          columns: [{ field: "报警日期", title: "报警日期", width: 100, align: "center" }],
        },
      ]),
    );
    expect(html).toContain("kf-special-alarm");
    expect(html).toContain("报警窗"); // titleName → 标题
    expect(html).toContain("告警窗口");
    expect(html).toContain("left:28px;top:135px;width:354px;height:353px");
  });

  it("EventWindow 渲染 kf-special-alarm 占位（事件窗口标签）", () => {
    const html = renderPagePreview(
      pageWith([
        {
          id: "EventWindow1", type: "prototype", prototypeName: "EventWindow",
          x: 0, y: 0, width: 600, height: 300,
          titleName: "事件窗", alarmWindowType: "实时事件窗",
          columns: [],
        },
      ]),
    );
    expect(html).toContain("kf-special-alarm");
    expect(html).toContain("事件窗");
    expect(html).toContain("事件窗口");
  });
});

describe("KF 原生页面 JSON → IR：prototypeName 特判", () => {
  it("CustomCharts / 图表型 / AlarmWindow 转为 type=prototype 并渲染占位", () => {
    const kfPage = {
      name: "特殊节点页",
      width: 1440,
      height: 900,
      objects: [
        {
          name: "CustomCharts2", prototypeName: "CustomCharts", objectType: 1,
          pageProperty: { name: "自定义图表2", pagePos: { x: 13, y: 5 }, pageSize: { width: 400, height: 240 } },
          objects: ["{\"name\":\"echart\",\"customChartsType\":1}"],
          modlePrototype: { name: "", guid: "kcc", version: "2.0.0.1.1", type: 1 },
        },
        {
          name: "TrendChart1", prototypeName: "TrendChart", chartComponentType: 2,
          leftTopPt: { x: 430, y: 5 }, width: 400, height: 240,
          title: { show: true, text: "实时趋势曲线" }, areas: [{}], areasNumStr: "1,0,0,0",
        },
        {
          name: "AlarmWindow1", prototypeName: "AlarmWindow",
          leftTopPt: { x: 13, y: 260 }, width: 400, height: 240,
          titleName: "报警窗", alarmWindowType: "实时报警窗",
          columns: [{ field: "报警日期", title: "报警日期" }],
        },
      ],
    };
    const html = renderKfProject("特殊节点样例", [kfPage]);
    // 三个特殊节点都转为 type="prototype" 并渲染对应占位（不再 fallback text 崩溃）
    expect(html).toContain('data-type="prototype"');
    expect(html).toContain("kf-special-custom");
    expect(html).toContain("自定义图表2");
    expect(html).toContain("kf-special-chart");
    expect(html).toContain("实时趋势曲线");
    expect(html).toContain("趋势图");
    expect(html).toContain("kf-special-alarm");
    expect(html).toContain("报警窗");
    expect(html).toContain("告警窗口");
  });
});
