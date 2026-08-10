import { describe, expect, it } from "vitest";
import {
  ClientProjectIR,
  ControlIR,
  SpecialNodeIR,
} from "./client-project-ir.js";

describe("SpecialNodeIR", () => {
  it("parses a CustomCharts node preserving pageProperty/objects/modlePrototype/region", () => {
    const node = {
      id: "CustomCharts1",
      x: 5.13,
      y: 35.92,
      width: 396,
      height: 344,
      type: "prototype",
      prototypeName: "CustomCharts",
      objectType: 1,
      pageProperty: {
        name: "CustomCharts1",
        pagePos: { x: 5.13, y: 35.92 },
        pageSize: { width: 396, height: 344 },
      },
      objects: [
        '{"name":"echart","customChartsType":1,"option":{"title":{"text":"供气占比统计"}}}',
      ],
      modlePrototype: {
        name: "",
        guid: "k6842b85b-e5bb-4334-9adf-cffcee058717",
        version: "1.0.0.1.1",
        type: 1,
      },
      region: "center",
      variableMng: [],
      depender: { dependObjects: [] },
      bordershow: false,
      toolTipEnable: true,
      toolTipText: "",
      fixedSize: [900, 400],
      visible: true,
      lock: false,
      linkMng: { linkList: [] },
    };
    const parsed = SpecialNodeIR.parse(node);
    expect(parsed.type).toBe("prototype");
    expect(parsed.prototypeName).toBe("CustomCharts");
    expect(parsed.id).toBe("CustomCharts1");
    expect(parsed.x).toBeCloseTo(5.13);
    expect(parsed.width).toBe(396);
    // 宽容保留：pageProperty / objects JSON 字符串 / modlePrototype / region 原样
    expect((parsed.pageProperty as { name: string }).name).toBe("CustomCharts1");
    expect(typeof (parsed.objects as string[])[0]).toBe("string");
    expect((parsed.modlePrototype as { type: number }).type).toBe(1);
    expect(parsed.region).toBe("center");
    expect(parsed.objectType).toBe(1);
  });

  it("parses a chart node with top-level geometry/title/chartComponentType/areas", () => {
    const node = {
      id: "XYChart1",
      x: 89,
      y: 34,
      width: 749,
      height: 271,
      type: "prototype",
      prototypeName: "XYChart",
      memberAccess: true,
      comment: "",
      title: { show: true, text: "XYChart", position: 1 },
      areas: [{ top: 0, left: 0, width: 749, height: 253 }],
      chartComponentType: 1,
      boundRect: { x: 89, y: 34, width: 749, height: 271 },
      enable: true,
      visible: true,
    };
    const parsed = SpecialNodeIR.parse(node);
    expect(parsed.prototypeName).toBe("XYChart");
    expect(parsed.title).toMatchObject({ show: true, text: "XYChart" });
    expect(parsed.chartComponentType).toBe(1);
    expect(parsed.areas).toHaveLength(1);
    expect(parsed.enable).toBe(true);
  });

  it("parses an AlarmWindow node with its alarm-specific fields", () => {
    const node = {
      id: "AlarmWindow1",
      x: 0,
      y: 0,
      width: 500,
      height: 300,
      type: "prototype",
      prototypeName: "AlarmWindow",
      alarmWindowType: 0,
      columns: [{ field: "alarmTime" }],
      dateSource: "alarmSource",
      dateType: 0,
      evalconfig: "",
      filterDataSource: false,
      filterMsg: "",
      historyNumber: 100,
      list: [],
      linkMng: { linkList: [] },
      titleName: "报警",
      showTree: false,
      showToolBar: true,
    };
    const parsed = SpecialNodeIR.parse(node);
    expect(parsed.prototypeName).toBe("AlarmWindow");
    expect(parsed.alarmWindowType).toBe(0);
    expect(parsed.columns).toHaveLength(1);
    expect(parsed.dateSource).toBe("alarmSource");
    expect(parsed.historyNumber).toBe(100);
    expect(parsed.titleName).toBe("报警");
  });

  it("is lenient with unknown fields (passthrough, not strict)", () => {
    const parsed = SpecialNodeIR.parse({
      id: "c1",
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      type: "prototype",
      prototypeName: "TrendChart",
      refreshFrequance: 5000,
      bogusField: { nested: [1, 2, 3] },
    });
    expect(parsed.refreshFrequance).toBe(5000);
    expect(parsed.bogusField).toEqual({ nested: [1, 2, 3] });
  });

  it("requires prototypeName (the discriminator source)", () => {
    expect(() =>
      SpecialNodeIR.parse({
        id: "c1",
        x: 0,
        y: 0,
        width: 100,
        height: 50,
        type: "prototype",
      }),
    ).toThrow();
  });
});

describe("ControlIR discriminated union", () => {
  it("dispatches the prototype variant on `type`", () => {
    const parsed = ControlIR.parse({
      id: "AlarmWindow1",
      x: 0,
      y: 0,
      width: 500,
      height: 300,
      type: "prototype",
      prototypeName: "AlarmWindow",
      alarmWindowType: 1,
    });
    if (parsed.type !== "prototype") throw new Error("expected prototype variant");
    expect(parsed.prototypeName).toBe("AlarmWindow");
    expect(parsed.alarmWindowType).toBe(1);
  });
});

describe("ClientProjectIR with special nodes", () => {
  it("parses a page mixing a chart and a CustomCharts node", () => {
    const project = {
      schema: "kf-client-project-ir/v1",
      id: "demo",
      name: "demo",
      pages: [
        {
          id: "p1",
          name: "p1",
          controls: [
            {
              id: "XYChart1",
              x: 89,
              y: 34,
              width: 749,
              height: 271,
              type: "prototype",
              prototypeName: "XYChart",
              title: { text: "XYChart" },
            },
            {
              id: "CustomCharts1",
              x: 5,
              y: 35,
              width: 396,
              height: 344,
              type: "prototype",
              prototypeName: "CustomCharts",
              objects: ['{"name":"echart"}'],
              region: "center",
            },
          ],
        },
      ],
    };
    const parsed = ClientProjectIR.parse(project);
    const controls = parsed.pages[0]!.controls;
    expect(controls).toHaveLength(2);
    expect(controls[0]!.type).toBe("prototype");
    expect(controls[1]!.type).toBe("prototype");
  });
});
