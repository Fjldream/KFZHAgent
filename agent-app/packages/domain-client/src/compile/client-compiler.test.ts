// @ts-nocheck -- 测试含 brief 逐字代码（JS 风格、无类型标注）；运行时行为由 vitest 断言验证。
/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compileClientProject, deriveGuid } from "./client-compiler.js";
import { packageNativeClientProject } from "../package/native-client-package.js";
import { importNativeClientPackage } from "../package/native-client-package.js";
import { inspectClientProject } from "../inspect/client-inspector.js";

const minimalIrPath = fileURLToPath(
  new URL("../../../../tests/fixtures/client-ir/minimal.json", import.meta.url),
);
const ir = JSON.parse(await readFile(minimalIrPath, "utf8"));

async function hashDirectory(dir) {
  const files = [];
  async function walk(p, rel) {
    const entries = await readdir(p, { withFileTypes: true });
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of entries) {
      const full = path.join(p, e.name);
      const next = rel === "" ? e.name : `${rel}/${e.name}`;
      if (e.isDirectory()) await walk(full, next);
      else files.push([next, createHash("sha256").update(await readFile(full)).digest("hex")]);
    }
  }
  await walk(dir, "");
  const h = createHash("sha256");
  for (const [rel, digest] of files) h.update(rel).update("\0").update(digest).update("\0");
  return h.digest("hex");
}

async function findJsonValue(dir, key) {
  let found;
  function search(node) {
    if (found !== undefined) return;
    if (Array.isArray(node)) {
      node.forEach(search);
      return;
    }
    if (node !== null && typeof node === "object") {
      for (const [k, v] of Object.entries(node)) {
        if (k === key) {
          found = v;
          return;
        }
        search(v);
        if (found !== undefined) return;
      }
    }
  }
  async function walk(p) {
    const entries = await readdir(p, { withFileTypes: true });
    for (const e of entries) {
      if (found !== undefined) return;
      const full = path.join(p, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.name.toLowerCase().endsWith(".json")) {
        search(JSON.parse(await readFile(full, "utf8")));
        if (found !== undefined) return;
      }
    }
  }
  await walk(dir);
  return found;
}

const irWithInjectedRawField = {
  ...ir,
  pages: ir.pages.map((page) => ({
    ...page,
    controls: page.controls.map((control, ci) =>
      ci === 0 ? { ...control, arbitraryRawField: { keep: true } } : control,
    ),
  })),
};

describe("client compiler", () => {
  it("compiles the same IR and seed byte-for-byte", async () => {
    const first = await compileClientProject(ir, { seed: "build-1" });
    const second = await compileClientProject(ir, { seed: "build-1" });
    expect(await hashDirectory(first.path)).toBe(await hashDirectory(second.path));
  });

  it("uses reviewed templates rather than model-provided raw fields", async () => {
    const result = await compileClientProject(irWithInjectedRawField, { seed: "build-2" });
    expect(await findJsonValue(result.path, "arbitraryRawField")).toBeUndefined();
  });

  it("derives RFC 4122 v5 GUIDs from seed plus semantic id", () => {
    const g1 = deriveGuid({ seed: "build-1" }, "page-1");
    expect(g1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(deriveGuid({ seed: "build-1" }, "page-1")).toBe(g1);
  });

  it("produces different GUIDs for different seeds", async () => {
    const a = await compileClientProject(ir, { seed: "seed-a" });
    const b = await compileClientProject(ir, { seed: "seed-b" });
    const readPageGuid = async (ws) => {
      const page = JSON.parse(
        await readFile(
          path.join(ws.path, "1.0.0.1", "project", "page", "Page1.json"),
          "utf8",
        ),
      );
      return page.guid;
    };
    expect(await readPageGuid(a)).not.toBe(await readPageGuid(b));
    expect(await readPageGuid(a)).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("rejects duplicate semantic page ids", async () => {
    const dup = {
      ...ir,
      pages: [...ir.pages, { ...ir.pages[0], id: "page-1", name: "Page1" }],
    };
    await expect(compileClientProject(dup, { seed: "s" })).rejects.toThrow(/MODEL_OUTPUT_INVALID/);
  });

  it("rejects duplicate semantic control ids within a page", async () => {
    const dup = {
      ...ir,
      pages: [
        {
          ...ir.pages[0],
          controls: [
            ...ir.pages[0].controls,
            { id: "Text1", type: "text", x: 0, y: 0, width: 10, height: 10, text: "dup" },
          ],
        },
      ],
    };
    await expect(compileClientProject(dup, { seed: "s" })).rejects.toThrow(/MODEL_OUTPUT_INVALID/);
  });

  it("rejects duplicate semantic variable ids", async () => {
    const dup = {
      ...ir,
      variables: [
        ...ir.variables,
        { id: "var-other", name: "$Temp", dataType: 1, defaultValue: 1 },
      ],
    };
    await expect(compileClientProject(dup, { seed: "s" })).rejects.toThrow(/MODEL_OUTPUT_INVALID/);
  });

  it("rejects raw JavaScript strings injected into controls with MODEL_OUTPUT_INVALID", async () => {
    const irWithJs = {
      ...ir,
      pages: ir.pages.map((page) => ({
        ...page,
        controls: page.controls.map((control) => ({ ...control, configureData: "alert(1)" })),
      })),
    };
    await expect(compileClientProject(irWithJs, { seed: "build-3" }))
      .rejects.toThrow(/MODEL_OUTPUT_INVALID/);
  });

  it("compiles a setVariable action as a restricted DSL command with the semantic variable id", async () => {
    const result = await compileClientProject(ir, { seed: "build-1" });
    const page = JSON.parse(
      await readFile(path.join(result.path, "1.0.0.1", "project", "page", "Page1.json"), "utf8"),
    );
    const button = page.objects.find((o) => o.name === "Button1");
    expect(button.linkMng.linkList).toHaveLength(1);
    expect(button.linkMng.linkList[0]).toMatchObject({
      action: "setVariable",
      variableId: "$Temp",
      value: 1,
    });
  });

  it("resolves navigate.pageId semantic ids to page KF GUIDs", async () => {
    const irWithNavigate = {
      ...ir,
      pages: [
        {
          ...ir.pages[0],
          controls: ir.pages[0].controls.map((control) =>
            control.type === "button"
              ? { ...control, action: { kind: "navigate", pageId: "Page1" } }
              : control,
          ),
        },
      ],
    };
    const result = await compileClientProject(irWithNavigate, { seed: "build-nav" });
    const page = JSON.parse(
      await readFile(path.join(result.path, "1.0.0.1", "project", "page", "Page1.json"), "utf8"),
    );
    const button = page.objects.find((o) => o.name === "Button1");
    expect(button.linkMng.linkList[0]).toMatchObject({
      action: "navigatePage",
      pageId: page.guid,
    });
  });

  it("rejects actions referencing unknown semantic ids", async () => {
    const badNav = {
      ...ir,
      pages: [
        {
          ...ir.pages[0],
          controls: ir.pages[0].controls.map((control) =>
            control.type === "button"
              ? { ...control, action: { kind: "navigate", pageId: "NoSuchPage" } }
              : control,
          ),
        },
      ],
    };
    await expect(compileClientProject(badNav, { seed: "s" })).rejects.toThrow(/MODEL_OUTPUT_INVALID/);

    const badVar = {
      ...ir,
      pages: [
        {
          ...ir.pages[0],
          controls: ir.pages[0].controls.map((control) =>
            control.type === "button"
              ? { ...control, action: { kind: "setVariable", variableId: "$Nope", value: 0 } }
              : control,
          ),
        },
      ],
    };
    await expect(compileClientProject(badVar, { seed: "s" })).rejects.toThrow(/MODEL_OUTPUT_INVALID/);
  });

  it("rejects control types without a reviewed template", async () => {
    const irWithSwitch = {
      ...ir,
      pages: [
        {
          ...ir.pages[0],
          controls: [
            { id: "Sw1", type: "switch", x: 0, y: 0, width: 50, height: 30, value: false },
          ],
        },
      ],
    };
    await expect(compileClientProject(irWithSwitch, { seed: "s" }))
      .rejects.toThrow(/MODEL_OUTPUT_INVALID/);
  });

  it("round-trips through importNativeClientPackage and inspects cleanly", async () => {
    const result = await compileClientProject(ir, { seed: "build-rt" });
    const gz = await packageNativeClientProject(result.path);
    const unpacked = await importNativeClientPackage(gz, tmpdir());
    const inspected = await inspectClientProject(unpacked);
    expect(inspected.summary.pageCount).toBe(1);
    expect(inspected.summary.pages[0].name).toBe("Page1");
    expect(inspected.summary.pages[0].guid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(inspected.summary.pages[0].controls).toHaveLength(3);
    expect(inspected.summary.pages[0].controls.map((c) => c.type).sort()).toEqual([
      "button",
      "inputnumber",
      "text",
    ]);
    expect(inspected.index.variables["1"].name).toBe("$Temp");
  });
});
