import { describe, expect, it } from "vitest";
import { renderClientProjectPreview, renderPagePreview } from "./index.js";
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

describe("preview renderer", () => {
  it("renders a page container with the page size and id", () => {
    const html = renderPagePreview(page);
    expect(html).toContain('class="kf-page"');
    expect(html).toContain('id="page-p1"');
    expect(html).toContain("width:1024px");
    expect(html).toContain("height:768px");
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
  });
  it("renders multi-page tabs with CSS :target and no scripts", () => {
    const html = renderClientProjectPreview(ir);
    expect(html).toContain("首页");
    expect(html).toContain("第二页");
    expect(html).toContain(":target");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<script>");
  });
});
