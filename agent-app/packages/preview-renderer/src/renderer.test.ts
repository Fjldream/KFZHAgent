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

// Note: `dependencies`/`globalScripts` from the task brief are not fields of
// ClientProjectIR, so the literal is asserted (runtime shape is unaffected).
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
    expect(html).toContain("开始运行"); // button text
    expect(html).toContain("开"); // switch activeText
    expect(html).toContain("关");
    expect(html).toContain("A"); // select options
    expect(html).toContain("B");
    expect(html).toContain("启用"); // checkbox label
    expect(html).toContain("高"); // radio options
    expect(html).toContain("<b>富文本</b>"); // richtext html passthrough
    expect(html).toContain('value="0.0" disabled'); // inputnumber
    expect(html).toContain('src="http://x/y.png"'); // image src
    expect(html).toContain('class="kf-tab is-active"'); // tabs active highlight
    expect(html).toContain("<th>列1</th>"); // table header
    expect(html).toContain('class="kf-spacer"'); // spacer
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
