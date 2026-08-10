// @ts-nocheck -- 测试含 brief 逐字代码（JS 风格、无类型标注）；运行时行为由 vitest 断言验证。
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderClientPreview } from "./client-preview.js";

const minimalIrPath = fileURLToPath(
  new URL("../../../../tests/fixtures/client-ir/minimal.json", import.meta.url),
);
const ir = JSON.parse(await readFile(minimalIrPath, "utf8"));

const irWithStyledButton = {
  ...ir,
  pages: [
    {
      ...ir.pages[0],
      controls: ir.pages[0].controls.map((control: { type: string }) => (
        control.type === "button"
          ? {
              ...control,
              style: {
                declarations: {
                  backgroundColor: "{theme.primary}",
                  borderRadius: 8,
                },
                states: {},
              },
            }
          : control
      )),
    },
  ],
};

describe("client preview", () => {
  it("renders approved style intent without exposing raw KF CSS", () => {
    const html = renderClientPreview(irWithStyledButton);

    expect(html).toContain("background-color:#2563eb");
    expect(html).toContain("border-radius:8px");
    expect(html).not.toContain("styleDataNew");
  });

  it("keeps the preview inert when rendering approved style intent", () => {
    const html = renderClientPreview(irWithStyledButton);

    expect(html).not.toContain("<script");
    expect(html).not.toMatch(/https?:\/\//i);
    expect(html).toContain("default-src 'none'");
  });

  it("escapes all control text and never emits a script tag", () => {
    const irWithXss = {
      ...ir,
      pages: [
        {
          ...ir.pages[0],
          controls: [
            {
              id: "Text1",
              type: "text",
              x: 0,
              y: 0,
              width: 100,
              height: 30,
              text: '<script>alert("xss")</script>',
            },
          ],
        },
      ],
    };
    const html = renderClientPreview(irWithXss);
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&quot;xss&quot;");
  });

  it("renders a self-contained document without remote resources", () => {
    const html = renderClientPreview(ir);
    expect(html).not.toMatch(/https?:\/\//i);
    expect(html).not.toContain("<script");
    expect(html).not.toMatch(/<link[^>]+href=/i);
  });

  it("applies a Content Security Policy suitable for iframe srcdoc", () => {
    const html = renderClientPreview(ir);
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("img-src data:");
    expect(html).toContain("style-src 'unsafe-inline'");
    expect(html).toMatch(/<meta[^>]+http-equiv=["']Content-Security-Policy["']/i);
  });

  it("is deterministic for the same IR", () => {
    expect(renderClientPreview(ir)).toBe(renderClientPreview(ir));
  });

  it("renders every page and control of the fixture", () => {
    const html = renderClientPreview(ir);
    expect(html).toContain("Page1");
    expect(html).toContain("Hello KF");
    expect(html).toContain("Go");
  });
});
