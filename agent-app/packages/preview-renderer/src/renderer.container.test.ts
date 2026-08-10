// KF 容器对象渲染测试：easyui 控件（proto 分派）+ 布局容器（layoutType 分派）。
// children 按 ContainerChildIR 宽容 JSON（真实 insiderObjects 结构）。
import { describe, expect, it } from "vitest";
import { renderPagePreview } from "./index.js";
import type { PageIR } from "@kf/domain-client";

function pageWith(controls: PageIR["controls"]): PageIR {
  return { id: "p-container", name: "容器页", width: 1440, height: 900, controls };
}

describe("easyui 控件渲染（按 EASYUI_PROTO_TYPES 分派）", () => {
  it("datagrid 渲染成带表头/斑马纹的表格骨架与空态", () => {
    const html = renderPagePreview(
      pageWith([
        {
          id: "Datagrid1", type: "easyui", proto: 1,
          x: 10, y: 10, width: 600, height: 300,
          striped: true, showHeader: true, rownumbers: true,
          columns: [{ title: "姓名", field: "name" }, { title: "工号", field: "no" }],
        },
      ]),
    );
    expect(html).toContain('data-type="easyui"');
    expect(html).toContain('data-proto="1"');
    expect(html).toContain("kf-easyui-table");
    expect(html).toContain("kf-easyui-striped");
    expect(html).toContain("<th>姓名</th>");
    expect(html).toContain("<th>工号</th>");
    expect(html).toContain("暂无数据");
  });

  it("linkbutton 渲染成按钮组", () => {
    const html = renderPagePreview(
      pageWith([
        {
          id: "LB1", type: "easyui", proto: 2, x: 10, y: 10, width: 240, height: 40,
          text: "查询", group: [{ text: "新增" }, { text: "删除" }],
        },
      ]),
    );
    expect(html).toContain('class="kf-easyui kf-easyui-linkbutton"');
    expect(html).toContain("kf-easyui-btn-group");
    expect(html).toContain(">查询</button>");
    expect(html).toContain("新增");
    expect(html).toContain("删除");
  });

  it("textbox/combobox/numberspinner 渲染成输入框", () => {
    const html = renderPagePreview(
      pageWith([
        { id: "T1", type: "easyui", proto: 9, x: 10, y: 10, width: 200, height: 40, value: "abc", prompt: "请输入" },
        { id: "C1", type: "easyui", proto: 0, x: 220, y: 10, width: 200, height: 40, value: "A" },
        { id: "N1", type: "easyui", proto: 4, x: 430, y: 10, width: 160, height: 40, value: 5 },
      ]),
    );
    expect(html).toContain('class="kf-easyui kf-easyui-textbox"');
    expect(html).toContain('value="abc"');
    expect(html).toContain("请输入");
    expect(html).toContain('class="kf-easyui kf-easyui-combobox"');
    expect(html).toContain('class="kf-easyui kf-easyui-numberspinner"');
  });

  it("switchbutton 渲染开关", () => {
    const html = renderPagePreview(
      pageWith([
        { id: "SW1", type: "easyui", proto: 27, x: 10, y: 10, width: 80, height: 32, checked: true, onText: "ON", offText: "OFF" },
      ]),
    );
    expect(html).toContain('class="kf-easyui kf-easyui-switchbutton"');
    expect(html).toContain('class="kf-switch is-on"');
    expect(html).toContain("ON");
    expect(html).toContain("OFF");
  });

  it("tree/treegrid 渲染缩进树列表", () => {
    const html = renderPagePreview(
      pageWith([
        { id: "TR1", type: "easyui", proto: 17, x: 10, y: 10, width: 220, height: 200, checkbox: true },
        { id: "TG1", type: "easyui", proto: 18, x: 240, y: 10, width: 300, height: 200 },
      ]),
    );
    expect(html).toContain('class="kf-easyui kf-easyui-tree"');
    expect(html).toContain('class="kf-easyui kf-easyui-treegrid"');
    expect(html).toContain("kf-easyui-tree-item");
    expect(html).toContain('style="padding-left:0px"');
  });

  it("sidemenu 渲染侧边菜单", () => {
    const html = renderPagePreview(
      pageWith([
        { id: "SM1", type: "easyui", proto: 26, x: 10, y: 10, width: 180, height: 400, menu: [{ text: "首页" }, { text: "数据管理" }] },
      ]),
    );
    expect(html).toContain('class="kf-easyui kf-easyui-sidemenu"');
    expect(html).toContain("kf-easyui-sidemenu-item");
    expect(html).toContain("数据管理");
  });

  it("其余 proto 渲染成通用带标签的控件框", () => {
    const html = renderPagePreview(
      pageWith([
        { id: "PG1", type: "easyui", proto: 22, x: 10, y: 10, width: 300, height: 40 },
      ]),
    );
    expect(html).toContain('class="kf-easyui kf-easyui-pagination"');
    expect(html).toContain("kf-easyui-label");
    expect(html).toContain("pagination");
  });
});

describe("布局容器渲染（按 layoutType 分派，children 递归）", () => {
  it("horizontal 布局 flex-row 递归渲染子 easyui 与嵌套 tab 布局", () => {
    const html = renderPagePreview(
      pageWith([
        {
          id: "H1", type: "layout", layoutType: 2, x: 0, y: 0, width: 1200, height: 600,
          children: [
            { objectType: 3, name: "QBtn", uiExtendType: 2, text: "查询", leftTopPt: { x: 10, y: 10 }, width: 80, height: 30 },
            {
              layoutType: 3, objectType: 2,
              baseProperty: { name: "Tab1", leftTopPt: { x: 100, y: 10 }, width: 600, height: 400 },
              insiderObjects: [
                { objectType: 3, name: "Dg1", uiExtendType: 1, leftTopPt: { x: 0, y: 0 }, width: 560, height: 300, columns: [{ title: "姓名", field: "name" }] },
              ],
            },
          ],
        },
      ]),
    );
    expect(html).toContain('class="kf-control kf-layout kf-layout-horizontal"');
    expect(html).toContain('data-layout-type="2"');
    expect(html).toContain("kf-layout-row"); // flex-row 内层
    expect(html).toContain('data-proto="2"'); // 子 linkbutton
    expect(html).toContain("查询");
    expect(html).toContain('data-layout-type="3"'); // 嵌套 tab
    expect(html).toContain("kf-layout-tabbar");
    expect(html).toContain(">Dg1</span>"); // tab 面板标题 = 子面板名
    expect(html).toContain("<th>姓名</th>"); // 嵌套 datagrid 列
    expect(html).toContain("暂无数据");
  });

  it("vertical 布局 flex-column、flowchart 用 flex", () => {
    const html = renderPagePreview(
      pageWith([
        {
          id: "V1", type: "layout", layoutType: 4, x: 0, y: 0, width: 400, height: 600,
          children: [{ uiModelType: 13, leftTopPt: { x: 0, y: 0 }, width: 100, height: 20 }],
        },
        { id: "F1", type: "layout", layoutType: 6, x: 420, y: 0, width: 400, height: 200, children: [] },
      ]),
    );
    expect(html).toContain('class="kf-control kf-layout kf-layout-vertical"');
    expect(html).toContain("kf-layout-column");
    expect(html).toContain('class="kf-control kf-layout kf-layout-flowchart"');
    expect(html).toContain("kf-layout-row");
  });

  it("tab 布局渲染选项卡 header + 面板", () => {
    const html = renderPagePreview(
      pageWith([
        {
          id: "T1", type: "layout", layoutType: 3, x: 0, y: 0, width: 800, height: 400,
          children: [
            { objectType: 3, name: "页面A", uiExtendType: 9, leftTopPt: { x: 0, y: 0 }, width: 200, height: 40, value: "a" },
            { objectType: 3, name: "页面B", uiExtendType: 27, leftTopPt: { x: 0, y: 0 }, width: 80, height: 32 },
          ],
        },
      ]),
    );
    expect(html).toContain("kf-layout-tabbar");
    expect(html).toContain('class="kf-layout-tab is-active"');
    expect(html).toContain("页面A");
    expect(html).toContain("页面B");
    expect(html).toContain("kf-layout-tabpanel");
  });

  it("docking 布局按 children region 渲染四边区域", () => {
    const html = renderPagePreview(
      pageWith([
        {
          id: "D1", type: "layout", layoutType: 5, x: 0, y: 0, width: 1200, height: 800,
          children: [
            { objectType: 3, name: "Side", uiExtendType: 26, region: "west", leftTopPt: { x: 0, y: 0 }, width: 200, height: 800, menu: [{ text: "菜单" }] },
            { objectType: 3, name: "Main", uiExtendType: 1, region: "center", leftTopPt: { x: 200, y: 0 }, width: 1000, height: 800, columns: [{ title: "编号", field: "id" }] },
            {
              layoutType: 3, objectType: 2, region: "north",
              baseProperty: { name: "TopTab", leftTopPt: { x: 0, y: 0 }, width: 1200, height: 100 },
              insiderObjects: [{ objectType: 3, name: "H", uiExtendType: 9, leftTopPt: { x: 0, y: 0 }, width: 100, height: 30 }],
            },
          ],
        },
      ]),
    );
    expect(html).toContain('data-layout-type="5"');
    expect(html).toContain('class="kf-docking-region kf-docking-west"');
    expect(html).toContain('class="kf-docking-region kf-docking-center"');
    expect(html).toContain('class="kf-docking-region kf-docking-north"');
    expect(html).toContain("<th>编号</th>"); // center 内 datagrid
    expect(html).toContain("kf-layout-tabbar"); // north 内嵌套 tab
  });

  it("accordion 布局渲染折叠面板", () => {
    const html = renderPagePreview(
      pageWith([
        {
          id: "A1", type: "layout", layoutType: 0, x: 0, y: 0, width: 400, height: 300,
          children: [
            { objectType: 3, name: "面板1", uiExtendType: 9, leftTopPt: { x: 0, y: 0 }, width: 100, height: 30 },
          ],
        },
      ]),
    );
    expect(html).toContain("kf-layout-accordion");
    expect(html).toContain("kf-accordion-header");
    expect(html).toContain("面板1");
  });
});
