// @ts-nocheck -- 测试含 brief 逐字代码（JS 风格、无类型标注）；运行时行为由 vitest 断言验证。
/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access */
import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectClientProject } from "./client-inspector.js";
import { ClientProjectIR, CONTROL_TYPE_BY_UIMODEL_TYPE } from "../ir/client-project-ir.js";

const pkgDir = fileURLToPath(new URL(".", import.meta.url));
const fixturesRoot = join(pkgDir, "../../../../tests/fixtures");
const fixture = (name) => join(fixturesRoot, name);

async function makeBigPageFixture(controlCount) {
  const root = await mkdtemp(join(tmpdir(), "kf-inspect-big-"));
  const versionDir = join(root, "1.0.0.1");
  await mkdir(join(versionDir, "project", "page"), { recursive: true });
  await writeFile(join(versionDir, "project.json"), JSON.stringify({ name: "Big", version: "1.0.0.1" }));
  const page = {
    pageProperty: { name: "BigPage" },
    version: "2.0.0.1",
    guid: "page-guid-big",
    objectType: 6,
    objects: Array.from({ length: controlCount }, (_, i) => ({
      name: `Button${i}`,
      uiModelType: 35,
      guid: `button-big-${i}`,
      leftTopPt: { x: i, y: 0 },
      width: 90,
      height: 60,
      text: `b${i}`,
    })),
  };
  await writeFile(join(versionDir, "project", "page", "BigPage.json"), JSON.stringify(page));
  return root;
}

describe("client inspector", () => {
  it("indexes pages and controls by GUID without dropping unknown fields", async () => {
    const result = await inspectClientProject(fixture("client-unknown-field"));
    expect(result.index.controls["button-guid-1"].pageGuid).toBe("page-guid-1");
    expect(result.raw.pages["page-guid-1"].customFutureField).toEqual({ keep: true });
    expect(result.summary.pages[0].controls[0]).toMatchObject({
      guid: "button-guid-1",
      type: "button"
    });
  });

  it("keeps control-level unknown fields and the full raw page tree", async () => {
    const result = await inspectClientProject(fixture("client-unknown-field"));
    const rawPage = result.raw.pages["page-guid-1"];
    expect(rawPage.objects[0].customFutureField).toEqual({ keep: true });
    expect(rawPage.objects[0].name).toBe("Button1");
    expect(rawPage.pageProperty.name).toBe("Page1");
    expect(rawPage.guid).toBe("page-guid-1");
  });

  it("keeps semantic IR ids separate from KF GUIDs", async () => {
    const result = await inspectClientProject(fixture("client-unknown-field"));
    const control = result.summary.pages[0].controls[0];
    expect(control.guid).toBe("button-guid-1");
    expect(control.id).toBe("Button1");
    expect(control.guid).not.toBe(control.id);
    expect(result.provenance.controls["button-guid-1"].mappedType).toBe("button");
    expect(result.provenance.controls["button-guid-1"].kfType).toBe(35);
  });

  it("records unknown fields at page and control level", async () => {
    const result = await inspectClientProject(fixture("client-unknown-field"));
    expect(result.index.pages["page-guid-1"].unknownFields).toContain("customFutureField");
    expect(result.index.controls["button-guid-1"].unknownFields).toContain("customFutureField");
    expect(result.summary.pages[0].unknownFields).toContain("customFutureField");
  });

  it("indexes variables and keeps their raw JSON", async () => {
    const result = await inspectClientProject(fixture("client-unknown-field"));
    const varIndex = result.index.variables["1"];
    expect(varIndex).toBeDefined();
    expect(varIndex.name).toBe("$TestVar");
    expect(result.raw.variables["group-guid-1"].Variables[0].name).toBe("$TestVar");
  });

  it("indexes global scripts and keeps their text", async () => {
    const result = await inspectClientProject(fixture("client-unknown-field"));
    expect(result.index.scripts.length).toBeGreaterThan(0);
    expect(result.raw.scripts["km_global_script.js"]).toContain("onSystemStart");
  });

  it("caps summary controls while preserving every raw control", async () => {
    const root = await makeBigPageFixture(10000);
    const result = await inspectClientProject(root);
    expect(result.summary.pages[0].controlCount).toBe(10000);
    expect(result.summary.pages[0].controls.length).toBe(50);
    expect(result.summary.pages[0].controls[0]).toMatchObject({ guid: "button-big-0", type: "button" });
    expect(result.raw.pages["page-guid-big"].objects.length).toBe(10000);
    expect(result.index.controls["button-big-9999"].pageGuid).toBe("page-guid-big");
  });

  it("honours configurable summary limits", async () => {
    const root = await makeBigPageFixture(1000);
    const result = await inspectClientProject(root, { summaryLimits: { controlsPerPage: 10 } });
    expect(result.summary.pages[0].controls.length).toBe(10);
    const uncapped = await inspectClientProject(root, { summaryLimits: { controlsPerPage: 5000 } });
    expect(uncapped.summary.pages[0].controls.length).toBe(1000);
  });

  it("maps every known KF uiModelType to an IR control type", async () => {
    expect(CONTROL_TYPE_BY_UIMODEL_TYPE[6]).toBe("text");
    expect(CONTROL_TYPE_BY_UIMODEL_TYPE[35]).toBe("button");
    expect(CONTROL_TYPE_BY_UIMODEL_TYPE[49]).toBe("inputnumber");
    expect(CONTROL_TYPE_BY_UIMODEL_TYPE[48]).toBe("switch");
    expect(CONTROL_TYPE_BY_UIMODEL_TYPE[44]).toBe("select");
    expect(Object.keys(CONTROL_TYPE_BY_UIMODEL_TYPE).length).toBe(13);
  });
});

describe("ClientProjectIR schema", () => {
  it("parses the three reviewed control variants", () => {
    const ir = ClientProjectIR.parse({
      schema: "kf-client-project-ir/v1",
      id: "project-1",
      name: "Demo",
      pages: [
        {
          id: "page-1",
          name: "Page1",
          width: 1280,
          height: 720,
          controls: [
            { id: "c1", type: "text", x: 0, y: 0, width: 100, height: 30, text: "hi" },
            { id: "c2", type: "button", x: 0, y: 40, width: 90, height: 60, text: "Go", action: { kind: "navigate", pageId: "page-2" } },
            { id: "c3", type: "inputnumber", x: 0, y: 110, width: 170, height: 50, variableId: "$v", decimals: 2 },
          ],
        },
      ],
    });
    expect(ir.pages[0].controls).toHaveLength(3);
    expect(ir.pages[0].controls[1]).toMatchObject({ type: "button", action: { kind: "navigate" } });
  });

  it("rejects a variant carrying an arbitrary property bag", () => {
    const bad = {
      schema: "kf-client-project-ir/v1",
      id: "project-1",
      name: "Demo",
      pages: [
        {
          id: "page-1",
          name: "Page1",
          controls: [
            { id: "c1", type: "text", x: 0, y: 0, width: 100, height: 30, text: "hi", rawKfObject: { anything: true } },
          ],
        },
      ],
    };
    expect(ClientProjectIR.safeParse(bad).success).toBe(false);
  });

  it("rejects invalid base geometry", () => {
    const bad = {
      schema: "kf-client-project-ir/v1",
      id: "project-1",
      name: "Demo",
      pages: [
        {
          id: "page-1",
          name: "Page1",
          controls: [{ id: "c1", type: "text", x: -1, y: 0, width: 0, height: 30, text: "hi" }],
        },
      ],
    };
    expect(ClientProjectIR.safeParse(bad).success).toBe(false);
  });
});
