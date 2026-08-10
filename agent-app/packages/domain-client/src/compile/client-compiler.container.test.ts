// client-compiler 对 KF 容器对象（easyui / layout）的 IR 校验 + 全流程编译测试。
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compileClientProject } from "./client-compiler.js";
import type { ClientProjectIR } from "../ir/client-project-ir.js";

const build = { seed: "container-seed" };

function projectWith(controls: unknown[]): ClientProjectIR {
  return {
    schema: "kf-client-project-ir/v1",
    id: "container-project",
    name: "Container",
    version: "1.0.0.1",
    pages: [
      {
        id: "page-1",
        name: "Page1",
        width: 1440,
        height: 900,
        controls: controls as ClientProjectIR["pages"][number]["controls"],
      },
    ],
    variables: [],
  };
}

const validEasyui = {
  id: "Datagrid1",
  type: "easyui",
  x: 14,
  y: 13,
  width: 690,
  height: 227,
  proto: 1,
  uiExtendType: 1,
  striped: false,
  pagination: true,
  pageSize: 5,
  value: "abc", // 白名单字符串字段不应触发注入拒绝（datagrid 白名单不含 value，编译时不输出）
};

const validEasyuiTextbox = {
  id: "Textbox1",
  type: "easyui",
  x: 0,
  y: 0,
  width: 200,
  height: 25,
  proto: 9,
  uiExtendType: 9,
  value: "hello", // textbox 白名单含 value：字符串字段正常透传
  readonly: true,
};

const validLayout = {
  id: "HorizontalLayout1",
  type: "layout",
  x: 0,
  y: 12,
  width: 300,
  height: 127.8,
  layoutType: 2,
  children: [
    {
      baseProperty: { name: "DockingLayout1", leftTopPt: { x: 11, y: 13 }, width: 278, height: 126 },
      layoutType: 5,
      objectType: 2,
    },
  ],
  panels: [{ region: "center", width: 227, height: 82 }],
};

async function readPageObjects(ws: { path: string }): Promise<Record<string, unknown>[]> {
  const page = JSON.parse(
    await readFile(path.join(ws.path, "1.0.0.1", "project", "page", "Page1.json"), "utf8"),
  );
  return page["objects"];
}

describe("client compiler validation — easyui controls", () => {
  it("compiles a page with easyui controls and serializes the KF envelope", async () => {
    const ws = await compileClientProject(projectWith([validEasyui, validEasyuiTextbox]), build);
    const objects = await readPageObjects(ws);
    const datagrid = objects.find((o) => o["name"] === "Datagrid1");
    expect(datagrid).toBeDefined();
    expect(datagrid!["type"]).toBeUndefined();
    expect(datagrid!["uiModelType"]).toBeUndefined();
    expect(datagrid!["objectType"]).toBe(3);
    expect(datagrid!["uiExtendType"]).toBe(1);
    expect(datagrid!["leftTopPt"]).toEqual({ x: 14, y: 13 });
    expect(datagrid!["width"]).toBe(690);
    expect(datagrid!["height"]).toBe(227);
    expect(datagrid!["striped"]).toBe(false);
    expect(datagrid!["pagination"]).toBe(true);
    // datagrid 白名单不含 value：用户字符串被宽容接收但不序列化
    expect("value" in datagrid!).toBe(false);
    // 模板默认空 data（KF 加载必需），用户传入的 data 内容不序列化
    expect(datagrid!["data"]).toEqual([]);
    // textbox 白名单含 value/readonly：字符串字段正常透传
    const textbox = objects.find((o) => o["name"] === "Textbox1");
    expect(textbox).toBeDefined();
    expect(textbox!["uiExtendType"]).toBe(9);
    expect(textbox!["value"]).toBe("hello");
    expect(textbox!["readonly"]).toBe(true);
  });

  it("rejects an unknown easyui proto", async () => {
    await expect(
      compileClientProject(projectWith([{ ...validEasyui, proto: 99 }]), build),
    ).rejects.toThrow(/proto 99/);
  });

  it("rejects a non-integer easyui proto", async () => {
    await expect(
      compileClientProject(projectWith([{ ...validEasyui, proto: 1.5 }]), build),
    ).rejects.toThrow(/integer/);
  });

  it("rejects a mismatched uiExtendType", async () => {
    await expect(
      compileClientProject(projectWith([{ ...validEasyui, proto: 1, uiExtendType: 2 }]), build),
    ).rejects.toThrow(/equal to proto/);
  });
});

describe("client compiler validation — layout containers", () => {
  it("compiles a page with a layout container (baseProperty/insiderObjects/dPanelsOption)", async () => {
    const ws = await compileClientProject(projectWith([validLayout]), build);
    const objects = await readPageObjects(ws);
    const layout = objects.find((o) => o["layoutType"] === 2);
    expect(layout).toBeDefined();
    expect(layout!["type"]).toBeUndefined();
    expect(layout!["uiModelType"]).toBeUndefined();
    expect(layout!["objectType"]).toBe(2);
    expect(layout!["baseProperty"]).toEqual({
      name: "HorizontalLayout1",
      guid: expect.any(String),
      leftTopPt: { x: 0, y: 12 },
      width: 300,
      height: 127.8,
    });
    // 布局子对象自动补 guid（KF 要求 insiderObjects 子对象有 guid）
    expect(layout!["insiderObjects"]).toEqual([
      {
        ...validLayout.children[0],
        baseProperty: {
          ...(validLayout.children[0]!.baseProperty as Record<string, unknown>),
          guid: expect.any(String),
        },
      },
    ]);
    expect(layout!["dPanelsOption"]).toEqual(validLayout.panels);
  });

  it("accepts negative layout coordinates (KF edge docking x=-1)", async () => {
    const ws = await compileClientProject(
      projectWith([{ ...validLayout, x: -1, y: 59, layoutType: 5, children: [] }]),
      build,
    );
    const objects = await readPageObjects(ws);
    const layout = objects.find((o) => o["layoutType"] === 5);
    expect((layout!["baseProperty"] as { leftTopPt: { x: number } }).leftTopPt.x).toBe(-1);
  });

  it("rejects a non-integer layoutType", async () => {
    await expect(
      compileClientProject(projectWith([{ ...validLayout, layoutType: 2.5 }]), build),
    ).rejects.toThrow(/layoutType must be an integer/);
  });

  it("rejects a non-array children", async () => {
    await expect(
      compileClientProject(projectWith([{ ...validLayout, children: "oops" }]), build),
    ).rejects.toThrow(/children must be an array/);
  });

  it("rejects a non-array panels", async () => {
    await expect(
      compileClientProject(projectWith([{ ...validLayout, panels: {} }]), build),
    ).rejects.toThrow(/panels must be an array/);
  });

  it("rejects layout children whose items are not objects", async () => {
    await expect(
      compileClientProject(projectWith([{ ...validLayout, children: [1, 2] }]), build),
    ).rejects.toThrow(/children\[0\] must be an object/);
  });
});

describe("client compiler determinism — container controls", () => {
  it("compiles the same container IR + seed byte-for-byte", async () => {
    const ir = projectWith([validEasyui, validLayout]);
    const a = await compileClientProject(ir, build);
    const b = await compileClientProject(ir, build);
    expect(await readPageObjects(a)).toEqual(await readPageObjects(b));
  });
});
