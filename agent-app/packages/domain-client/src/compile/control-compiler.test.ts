// KF 容器对象（easyui / layout）编译层测试：IR → KF 工程 JSON 序列化结构。
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ControlIR } from "../ir/client-project-ir.js";
import { compileControl, ModelOutputInvalidError, type CompileContext } from "./control-compiler.js";

const build = { seed: "test-seed" };
const ctx: CompileContext = {
  variableGroupGuid: "kvariables",
  pageGroupGuid: "kpagegroup",
  resolvePageGuid: (name) => `k${name}`,
  resolveVariableName: (id) => id,
};

function easyui(overrides: Record<string, unknown> = {}): ControlIR {
  return {
    id: "Datagrid1",
    type: "easyui",
    x: 10,
    y: 20,
    width: 300,
    height: 200,
    proto: 1,
    ...overrides,
  } as unknown as ControlIR;
}

describe("control compiler — easyui controls (objectType=3)", () => {
  it("serializes the KF datagrid envelope (objectType/uiExtendType)", () => {
    const out = compileControl(build, easyui(), ctx);
    expect(out["type"]).toBeUndefined();
    expect(out["uiModelType"]).toBeUndefined();
    expect(out["objectType"]).toBe(3);
    expect(out["uiExtendType"]).toBe(1);
    expect(out["leftTopPt"]).toEqual({ x: 10, y: 20 });
    expect(out["width"]).toBe(300);
    expect(out["height"]).toBe(200);
    expect(out["name"]).toBe("Datagrid1");
    expect(out["guid"]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("carries proto whitelist fields from the IR and template defaults", () => {
    const out = compileControl(build, easyui({ striped: true, pagination: true }), ctx);
    // 用户字段（白名单内）透传
    expect(out["striped"]).toBe(true);
    expect(out["pagination"]).toBe(true);
    // 模板静态默认值保留
    expect(out["pageSize"]).toBe(5);
    expect(out["pageList"]).toEqual([10, 20, 30, 40, 50]);
    expect(out["method"]).toBe("post");
    expect(out["version"]).toBe("2.0.0.1");
    expect(out["linkMng"]).toEqual({ linkList: [] });
  });

  it("never serializes complex data/columns content (configureData territory)", () => {
    const out = compileControl(
      build,
      easyui({ data: [{ id: 1, name: "x" }], columns: [[{ title: "A" }]] }),
      ctx,
    );
    // 模板默认空 data/queryParams（KF 加载必需，sidemenu/accordion 对 undefined data 崩溃），
    // 但用户传入的复杂内容（data 行/columns 定义）绝不序列化——走 configureData 脚本。
    expect(out["data"]).toEqual([]);
    expect(out["queryParams"]).toEqual({});
    expect("columns" in out).toBe(false);
    expect(out["data"]).not.toEqual([{ id: 1, name: "x" }]);
  });

  it("rejects unknown protos without a compiled template", () => {
    expect(() => compileControl(build, easyui({ proto: 99 }), ctx)).toThrow(ModelOutputInvalidError);
  });

  it("serializes a linkbutton with its string text field", () => {
    const out = compileControl(
      build,
      easyui({ id: "LinkButton1", proto: 2, width: 151, height: 50, text: "Go", toggle: false }),
      ctx,
    );
    expect(out["uiExtendType"]).toBe(2);
    expect(out["text"]).toBe("Go");
    expect(out["toggle"]).toBe(false);
    expect(out["plain"]).toBe(false);
  });

  it("serializes every proto with a template registered (coverage)", () => {
    const protos = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 24, 25, 26, 27, 28, 29];
    for (const proto of protos) {
      const out = compileControl(
        build,
        easyui({ id: `E${proto}`, proto, width: 100, height: 50, x: 0, y: 0 }),
        ctx,
      );
      expect(out["uiExtendType"]).toBe(proto);
      expect(out["objectType"]).toBe(3);
      expect(out["uiModelType"]).toBeUndefined();
    }
  });
});

describe("control compiler — layout containers (objectType=2)", () => {
  it("serializes a horizontal layout with baseProperty geometry", () => {
    const layout = {
      id: "HorizontalLayout1",
      type: "layout",
      x: 0,
      y: 12,
      width: 300,
      height: 127.8,
      layoutType: 2,
    } as unknown as ControlIR;
    const out = compileControl(build, layout, ctx);
    expect(out["type"]).toBeUndefined();
    expect(out["uiModelType"]).toBeUndefined();
    expect(out["objectType"]).toBe(2);
    expect(out["layoutType"]).toBe(2);
    expect(out["baseProperty"]).toEqual({
      name: "HorizontalLayout1",
      guid: expect.stringMatching(/^[0-9a-f-]+$/),
      leftTopPt: { x: 0, y: 12 },
      width: 300,
      height: 127.8,
    });
    // 布局不合并 control 级 base-fields（comment/lock/visible 等在 baseProperty 内）
    expect("comment" in out).toBe(false);
    expect(out["version"]).toBe("2.0.0.1");
    expect(out["sizePolicy"]).toEqual([3, 3, 0, 0]);
  });

  it("carries nested children verbatim into insiderObjects and panels into dPanelsOption", () => {
    const child = {
      borderStyle: "",
      baseProperty: { name: "DockingLayout1", leftTopPt: { x: 11, y: 13 }, width: 278, height: 126 },
      layoutType: 5,
      objectType: 2,
    };
    const panel = { region: "center", width: 227, height: 82, split: false };
    const layout = {
      id: "HorizontalLayout1",
      type: "layout",
      x: 0,
      y: 12,
      width: 300,
      height: 127.8,
      layoutType: 2,
      children: [child],
      panels: [panel],
    } as unknown as ControlIR;
    const out = compileControl(build, layout, ctx);
    expect(out["insiderObjects"]).toEqual([child]);
    expect(out["dPanelsOption"]).toEqual([panel]);
  });

  it("supports negative coordinates (KF Docking edge docking, x=-1)", () => {
    const layout = {
      id: "DockingLayout1",
      type: "layout",
      x: -1,
      y: 59,
      width: 1920,
      height: 1080,
      layoutType: 5,
    } as unknown as ControlIR;
    const out = compileControl(build, layout, ctx);
    expect((out["baseProperty"] as { leftTopPt: { x: number } }).leftTopPt.x).toBe(-1);
  });

  it("keeps child raw string fields untouched (no injection rejection inside nested JSON)", () => {
    const child = { styleDataNew: "#domId { color: red }", baseProperty: { name: "C" }, layoutType: 5 };
    const layout = {
      id: "L1",
      type: "layout",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      layoutType: 5,
      children: [child],
    } as unknown as ControlIR;
    const out = compileControl(build, layout, ctx);
    expect(out["insiderObjects"]).toEqual([child]);
  });
});

// ---------------------------------------------------------------------------
// Golden alignment: compile IR derived from REAL reference-project objects and
// assert the serialized KF structure matches the reference layout.
// ---------------------------------------------------------------------------
const REF_DIR = "/tmp/kf_ref/1.0.0.1/project/page";

describe.skipIf(!existsSync(REF_DIR))("golden alignment with the reference project (/tmp/kf_ref)", () => {
  async function loadReferenceObject(pageFile: string, predicate: (o: Record<string, any>) => boolean) {
    const page = JSON.parse(await readFile(path.join(REF_DIR, pageFile), "utf8"));
    return page["objects"].find(predicate);
  }

  it("round-trips a real datagrid (数据列表3.json / Datagrid1)", async () => {
    const ref = await loadReferenceObject("数据列表3.json", (o) => o.name === "Datagrid1");
    expect(ref, "reference datagrid not found").toBeDefined();
    const ir = {
      id: ref.name,
      type: "easyui",
      x: ref.leftTopPt.x,
      y: ref.leftTopPt.y,
      width: ref.width,
      height: ref.height,
      proto: ref.uiExtendType,
      striped: ref.striped,
      pagination: ref.pagination,
      pageSize: ref.pageSize,
      pageList: ref.pageList,
      sortOrder: ref.sortOrder,
    } as unknown as ControlIR;
    const out = compileControl(build, ir, ctx);
    // 结构对齐：契约枚举 + 几何 + name/guid 推导
    expect(out["objectType"]).toBe(ref.objectType);
    expect(out["uiExtendType"]).toBe(ref.uiExtendType);
    expect(out["leftTopPt"]).toEqual(ref.leftTopPt);
    expect(out["width"]).toBe(ref.width);
    expect(out["height"]).toBe(ref.height);
    expect(out["name"]).toBe(ref.name);
    // 白名单用户字段与参考对象一致
    expect(out["striped"]).toBe(ref.striped);
    expect(out["pagination"]).toBe(ref.pagination);
    expect(out["pageSize"]).toBe(ref.pageSize);
    expect(out["pageList"]).toEqual(ref.pageList);
    expect(out["sortOrder"]).toBe(ref.sortOrder);
    expect(out["method"]).toBe(ref.method);
    // 参考对象字段集中除了任务契约新增的 type/uiModelType 之外都来自模板
    const allowedExtra = new Set(["type", "uiModelType"]);
    for (const key of Object.keys(out)) {
      if (key in ref || allowedExtra.has(key)) continue;
      expect.fail(`compiled datagrid carries unexpected field "${key}"`);
    }
  });

  it("round-trips a real layout container (区域布局.json / HorizontalLayout1)", async () => {
    const ref = await loadReferenceObject("区域布局.json", (o) => o.layoutType === 2 && o.baseProperty?.name === "HorizontalLayout1");
    expect(ref, "reference horizontal layout not found").toBeDefined();
    const ir = {
      id: ref.baseProperty.name,
      type: "layout",
      x: ref.baseProperty.leftTopPt.x,
      y: ref.baseProperty.leftTopPt.y,
      width: ref.baseProperty.width,
      height: ref.baseProperty.height,
      layoutType: ref.layoutType,
      children: ref.insiderObjects,
      panels: ref.dPanelsOption,
    } as unknown as ControlIR;
    const out = compileControl(build, ir, ctx);
    expect(out["objectType"]).toBe(ref.objectType);
    expect(out["layoutType"]).toBe(ref.layoutType);
    expect(out["baseProperty"]).toEqual({
      name: ref.baseProperty.name,
      guid: expect.stringMatching(/^k?[0-9a-f-]+$/),
      leftTopPt: ref.baseProperty.leftTopPt,
      width: ref.baseProperty.width,
      height: ref.baseProperty.height,
    });
    // children 原样保留（含嵌套 DockingLayout 的 region/dPanelsOption/字符串样式）
    expect(out["insiderObjects"]).toEqual(ref.insiderObjects);
    expect(out["dPanelsOption"]).toEqual(ref.dPanelsOption);
    expect(out["version"]).toBe(ref.version);
  });
});
