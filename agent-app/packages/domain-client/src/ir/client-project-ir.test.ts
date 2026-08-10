import { describe, expect, it } from "vitest";
import {
  ClientProjectIR,
  ControlIR,
  EasyuiControlIR,
  LayoutContainerIR,
} from "./client-project-ir.js";

describe("EasyuiControlIR", () => {
  it("parses a datagrid easyui control with core options", () => {
    const control = {
      id: "Datagrid1",
      x: 14,
      y: 13,
      width: 690,
      height: 227,
      type: "easyui",
      proto: 1,
      uiExtendType: 1,
      striped: false,
      pagination: false,
      showHeader: true,
      singleSelect: false,
      fitColumns: false,
      rownumbers: false,
      pageSize: 5,
      pageList: [10, 20, 30, 40, 50],
    };
    const parsed = EasyuiControlIR.parse(control);
    expect(parsed.type).toBe("easyui");
    expect(parsed.proto).toBe(1);
    expect(parsed.showHeader).toBe(true);
  });

  it("rejects unknown fields (strict mode)", () => {
    expect(() =>
      EasyuiControlIR.parse({
        id: "x",
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        type: "easyui",
        proto: 1,
        bogusField: 1,
      }),
    ).toThrow();
  });
});

describe("LayoutContainerIR", () => {
  it("parses a docking layout with nested children and panels", () => {
    const layout = {
      id: "DockingLayout6",
      x: -1, // KF Docking 布局贴边坐标可为 -1
      y: 59,
      width: 1920,
      height: 1080,
      type: "layout",
      layoutType: 5,
      children: [
        {
          baseProperty: {
            name: "HorizontalLayout1",
            leftTopPt: { x: 0, y: 0 },
            width: 1920,
            height: 1080,
            guid: "k1",
          },
          layoutType: 2,
          objectType: 2,
          insiderObjects: [],
        },
      ],
      panels: [{ region: "center", width: 1920, height: 1080, split: false }],
    };
    const parsed = LayoutContainerIR.parse(layout);
    expect(parsed.type).toBe("layout");
    expect(parsed.layoutType).toBe(5);
    expect(parsed.children).toHaveLength(1);
    expect(parsed.panels).toHaveLength(1);
  });

  it("rejects unknown fields (strict mode)", () => {
    expect(() =>
      LayoutContainerIR.parse({
        id: "l1",
        x: 0,
        y: 0,
        width: 100,
        height: 50,
        type: "layout",
        layoutType: 5,
        bogus: true,
      }),
    ).toThrow();
  });
});

describe("ControlIR discriminated union", () => {
  it("dispatches the easyui and layout variants on `type`", () => {
    const easyui = ControlIR.parse({
      id: "g1",
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      type: "easyui",
      proto: 1,
    });
    if (easyui.type !== "easyui") throw new Error("expected easyui variant");
    expect(easyui.proto).toBe(1);

    const layout = ControlIR.parse({
      id: "l1",
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      type: "layout",
      layoutType: 5,
    });
    if (layout.type !== "layout") throw new Error("expected layout variant");
    expect(layout.layoutType).toBe(5);
  });
});

describe("ClientProjectIR with container controls", () => {
  it("parses a page mixing a datagrid and a nested layout container", () => {
    const project = {
      schema: "kf-client-project-ir/v1",
      id: "demo-cockpit",
      name: "驾驶舱demo示例",
      version: "1.0.0.1",
      pages: [
        {
          id: "p1",
          name: "驾驶舱demo示例",
          width: 1920,
          height: 1080,
          controls: [
            {
              id: "Datagrid1",
              x: 14,
              y: 13,
              width: 690,
              height: 227,
              type: "easyui",
              proto: 1,
              striped: false,
              pagination: false,
              showHeader: true,
              singleSelect: false,
            },
            {
              id: "DockingLayout6",
              x: -1,
              y: 59,
              width: 1920,
              height: 1080,
              type: "layout",
              layoutType: 5,
              children: [
                {
                  baseProperty: {
                    name: "HorizontalLayout1",
                    leftTopPt: { x: 0, y: 0 },
                    width: 1920,
                    height: 1080,
                  },
                  layoutType: 2,
                  objectType: 2,
                },
              ],
            },
          ],
        },
      ],
    };
    const parsed = ClientProjectIR.parse(project);
    const controls = parsed.pages[0]!.controls;
    expect(controls).toHaveLength(2);
    expect(controls[0]!.type).toBe("easyui");
    expect(controls[1]!.type).toBe("layout");
  });
});
