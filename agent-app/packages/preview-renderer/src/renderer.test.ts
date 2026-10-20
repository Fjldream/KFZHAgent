import { describe, expect, it } from "vitest";
import { kfPageToPageIR, renderClientProjectPreview, renderKfProject, renderPagePreview } from "./index.js";
import type { ClientProjectIR, PageIR } from "@kf/domain-client";

const page: PageIR = {
  id: "p1", name: "首页", width: 1024, height: 768,
  controls: [
    { id: "c1", type: "text", x: 20, y: 30, width: 300, height: 40, text: "标题" },
    { id: "c2", type: "button", x: 20, y: 90, width: 120, height: 40, text: "开始运行" },
    { id: "c3", type: "switch", x: 200, y: 90, width: 80, height: 40, value: true, activeText: "开", inactiveText: "关" },
    { id: "c4", type: "select", x: 20, y: 150, width: 160, height: 40, options: [{ label: "A", value: "a" }, { label: "B", value: "b" }], value: "b" },
    { id: "c5", type: "inputnumber", x: 20, y: 210, width: 120, height: 40, variableId: "$Temp", decimals: 1 },
    { id: "c6", type: "checkbox", x: 200, y: 150, width: 120, height: 40, label: "启用", checked: true },
    { id: "c7", type: "radio", x: 20, y: 270, width: 200, height: 40, options: [{ label: "高", value: "h" }, { label: "低", value: "l" }], value: "h" },
    { id: "c8", type: "image", x: 400, y: 30, width: 120, height: 80, src: "http://x/y.png", alt: "logo" },
    { id: "c9", type: "tabs", x: 400, y: 130, width: 300, height: 40, tabs: [{ id: "t1", label: "趋势" }, { id: "t2", label: "明细" }], activeId: "t1" },
    { id: "c10", type: "table", x: 400, y: 190, width: 300, height: 120 },
    { id: "c11", type: "richtext", x: 20, y: 330, width: 300, height: 60, text: "<b>富文本</b>" },
    { id: "c12", type: "spacer", x: 20, y: 410, width: 300, height: 20, axis: "horizontal" },
  ],
};

// 注意：`dependencies`/`globalScripts` 从任务简要中不被视为ClientProjectIR 的字段，因此其实际值（运行时形状不受影响）被断言（运行时形状不受影响）。
const ir = {
  schema: "kf-client-project-ir/v1", id: "w1", name: "监控大屏",
  pages: [page, { ...page, id: "p2", name: "第二页", controls: [] }],
  dependencies: [], variables: [], globalScripts: [],
} as ClientProjectIR;

describe("KF page conversion", () => {
  const kfPage = {
    name: "Page1",
    width: 1024,
    height: 768,
    objects: [
      {
        name: "Text1", uiModelType: 6,
        leftTopPt: { x: 20, y: 30 }, width: 300, height: 40,
        text: "生产车间实时监控",
      },
      {
        name: "Sw1", uiModelType: 48,
        leftTopPt: { x: 20, y: 90 }, width: 80, height: 40,
        value: true, activeText: "开", inactiveText: "关",
      },
      {
        name: "Sel1", uiModelType: 44,
        leftTopPt: { x: 200, y: 90 }, width: 160, height: 40,
        options: [{ label: "A", value: "a" }], value: "a",
      },
    ],
  };

  it("maps KF uiModelType and geometry to IR controls", () => {
    const page = kfPageToPageIR(kfPage);
    expect(page.id).toBe("Page1");
    expect(page.width).toBe(1024);
    expect(page.height).toBe(768);
    expect(page.controls).toHaveLength(3);
    expect(page.controls[0]).toMatchObject({ id: "Text1", type: "text", x: 20, y: 30, width: 300, height: 40, text: "生产车间实时监控" });
    expect(page.controls[1]).toMatchObject({ type: "switch", value: true, activeText: "开", inactiveText: "关" });
    expect(page.controls[2]).toMatchObject({ type: "select", options: [{ label: "A", value: "a" }] });
  });

  it("renderKfProject emits the full preview with page and controls", () => {
    const html = renderKfProject("监控大屏", [kfPage]);
    expect(html).toContain("生产车间实时监控");
    expect(html).toContain('data-type="switch"');
    expect(html).toContain("开");
    expect(html).not.toContain("<script");
  });
});

describe("preview renderer", () => {
  it("renders a page container with the page size and id", () => {
    const html = renderPagePreview(page);
    expect(html).toContain('class="kf-page"');
    expect(html).toContain('id="page-p1"');
    expect(html).toContain("width:1024px");
    expect(html).toContain("height:768px");
  });
  it("grows the page canvas to keep out-of-bounds controls visible", () => {
    const html = renderPagePreview({
      ...page,
      height: 768,
      controls: [
        { id: "c-btn", type: "button", x: 60, y: 800, width: 150, height: 40, text: "刷新数据" },
      ],
    });
    // 按钮 bottom=840 → 容器高度至少 840+40=880；宽度至少 60+150+40=250 → 取声明 1024
    expect(html).toContain("height:880px");
    expect(html).toContain("刷新数据");
  });

  it("positions each control absolutely and renders its type", () => {
    const html = renderPagePreview(page);
    expect(html).toContain('data-type="text"');
    expect(html).toContain("left:20px;top:30px;width:300px;height:40px");
    expect(html).toContain("标题");
  });
  it("renders per-type payloads", () => {
    const html = renderPagePreview(page);
    expect(html).toContain("开始运行"); // 按钮文本
    expect(html).toContain("开"); // 开关 activeText
    expect(html).toContain("关");
    expect(html).toContain("A"); // 选择器选项
    expect(html).toContain("B");
    expect(html).toContain("启用"); // 复选框标签
    expect(html).toContain("高"); // 单选框选项
    expect(html).toContain("<b>富文本</b>"); // 富文本 HTML 透传
    expect(html).toContain('value="0.0" disabled'); // 数字输入框
    expect(html).toContain('src="http://x/y.png"'); // 图片 src
    expect(html).toContain('class="kf-tab is-active"'); // 标签页活动项高亮
    expect(html).toContain("<th>列1</th>"); // 表头
    expect(html).toContain('class="kf-spacer"'); // 间隔
  });
  it("renders the new control types", () => {
    const page = {
      id: "p1",
      name: "新控件页",
      width: 1440,
      height: 900,
      controls: [
        { id: "c1", type: "input", x: 10, y: 10, width: 200, height: 40, value: "abc", placeholder: "请输入", inputType: "text" },
        { id: "c2", type: "tag", x: 10, y: 60, width: 120, height: 30, effect: "light", closable: true },
        { id: "c3", type: "steps", x: 10, y: 100, width: 400, height: 60, active: 1, direction: "horizontal" },
        { id: "c4", type: "tree", x: 10, y: 170, width: 200, height: 200, showCheckbox: true, indent: 16 },
        { id: "c5", type: "cascader", x: 10, y: 380, width: 200, height: 40, placeholder: "请选择" },
        { id: "c6", type: "datetimepicker", x: 10, y: 430, width: 200, height: 40, value: "2025-01-01" },
        { id: "c7", type: "dropdown", x: 10, y: 480, width: 150, height: 40, text: "操作", options: [{ label: "A", value: "a" }] },
        { id: "c8", type: "upload", x: 10, y: 530, width: 150, height: 40, multiple: true },
        { id: "c9", type: "scale", x: 10, y: 580, width: 300, height: 40, min: 0, max: 100, value: 42 },
        { id: "c10", type: "timeline", x: 10, y: 630, width: 300, height: 120, items: [{ title: "事件1" }, { title: "事件2" }] },
        { id: "c11", type: "webcontainer", x: 10, y: 760, width: 400, height: 120, url: "https://example.com" },
        { id: "c12", type: "radiolegacy", x: 420, y: 10, width: 200, height: 40, options: [{ label: "高", value: "high" }], value: "high" },
      ],
    };
    const html = renderPagePreview(page as never);
    expect(html).toContain('data-type="input"');
    expect(html).toContain('value="abc"');
    expect(html).toContain("请输入");
    expect(html).toContain('class="kf-tag kf-tag-light"');
    expect(html).toContain("× 标签");
    expect(html).toContain('class="kf-step is-active"');
    expect(html).toContain("步骤2");
    expect(html).toContain("kf-tree-check"); // 树形复选框图标
    expect(html).toContain("请选择"); // 级联选择器占位文本
    expect(html).toContain("2025-01-01"); // 日期时间选择器值
    expect(html).toContain("操作"); // 下拉菜单文本
    expect(html).toContain("多文件"); // 多文件上传
    expect(html).toContain("kf-scale-fill"); // 刻度
    expect(html).toContain("事件1"); // 时间线项
    expect(html).toContain("example.com"); // Web 容器 iframe
    expect(html).toContain("● 高"); // 旧版单选框已选状态
  });
  it("renders multi-page tabs with CSS :target and no scripts", () => {
    const html = renderClientProjectPreview(ir);
    expect(html).toContain("首页");
    expect(html).toContain("第二页");
    expect(html).toContain(":target");
    expect(html).toContain(":has(section.kf-page:target)");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<script>");
  });
});
