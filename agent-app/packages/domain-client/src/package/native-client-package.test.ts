import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { strToU8, zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { importNativeClientPackage, packageNativeClientProject } from "./native-client-package.js";
import { DEFAULT_UNZIP_LIMITS, safeUnzip } from "./safe-unzip.js";

const FIXED_MTIME = new Date("2020-01-01T00:00:00.000Z");

const minimalProjectDir = fileURLToPath(
  new URL("../../../../tests/fixtures/client-minimal", import.meta.url),
);

function tempDir(): string {
  return mkdtempSync(path.join(tmpdir(), "kf-client-pkg-"));
}

function sha256(data: Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

type ZipEntryInput = { path: string; content?: string; attrs?: number };

function makeZip(entries: ZipEntryInput[]): Uint8Array {
  const data: Record<string, Uint8Array | [Uint8Array, { attrs: number }]> = {};
  for (const e of entries) {
    const payload = strToU8(e.content ?? "");
    data[e.path] = e.attrs !== undefined ? [payload, { attrs: e.attrs }] : payload;
  }
  return zipSync(data, { mtime: FIXED_MTIME, os: 3, level: 6 });
}

function makeMinimalProjectZip(extraTopLevel: Array<[string, string]> = []): Uint8Array {
  const entries: ZipEntryInput[] = [
    { path: "1.0.0.1/project.json", content: JSON.stringify({ name: "Minimal", version: "1.0.0.1" }) },
  ];
  for (const [p, c] of extraTopLevel) entries.push({ path: p, content: c });
  return makeZip(entries);
}

async function dirFiles(dir: string): Promise<Map<string, Buffer>> {
  const out = new Map<string, Buffer>();
  async function walk(p: string, rel: string): Promise<void> {
    const entries = await readdir(p, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(p, e.name);
      const nextRel = rel === "" ? e.name : `${rel}/${e.name}`;
      if (e.isDirectory()) await walk(full, nextRel);
      else out.set(nextRel, await readFile(full));
    }
  }
  await walk(dir, "");
  return out;
}

async function expectDirsEqual(a: string, b: string): Promise<void> {
  const [fa, fb] = await Promise.all([dirFiles(a), dirFiles(b)]);
  expect([...fa.keys()].sort()).toEqual([...fb.keys()].sort());
  for (const [k, v] of fa) expect(fb.get(k)).toEqual(v);
}

describe("native client package IO", () => {
  it("round-trips a minimal native client package", async () => {
    const gz = await packageNativeClientProject(minimalProjectDir);
    const unpacked = await importNativeClientPackage(gz, tempDir());
    const project = JSON.parse(
      await readFile(path.join(unpacked, "1.0.0.1/project.json"), "utf8"),
    ) as { name?: string };
    expect(project).toMatchObject({ name: "Minimal" });
  });

  it("produces a ZIP container with a .gz-capable signature", async () => {
    const gz = await packageNativeClientProject(minimalProjectDir);
    // ZIP local file header magic PK\x03\x04 — the .gz extension still wraps a ZIP container.
    expect([...gz.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
  });

  it("rejects path traversal entries", async () => {
    const maliciousGz = makeZip([{ path: "../../outside.txt", content: "blocked" }]);
    await expect(importNativeClientPackage(maliciousGz, tempDir()))
      .rejects.toThrow("PACKAGE_UNPACK_FAILED: unsafe entry path");
  });

  it("rejects backslash traversal entries", async () => {
    const maliciousGz = makeZip([{ path: "..\\outside.txt", content: "blocked" }]);
    await expect(importNativeClientPackage(maliciousGz, tempDir()))
      .rejects.toThrow("PACKAGE_UNPACK_FAILED: unsafe entry path");
  });

  it("rejects absolute paths", async () => {
    const gz = makeZip([{ path: "/etc/passwd", content: "root:x:0:0" }]);
    await expect(importNativeClientPackage(gz, tempDir()))
      .rejects.toThrow("PACKAGE_UNPACK_FAILED: unsafe entry path");

    const gzWin = makeZip([{ path: "C:\\windows\\system32\\evil.dll", content: "x" }]);
    await expect(importNativeClientPackage(gzWin, tempDir()))
      .rejects.toThrow("PACKAGE_UNPACK_FAILED: unsafe entry path");
  });

  it("rejects symlink entries", async () => {
    const gz = makeZip([
      { path: "1.0.0.1/project.json", content: JSON.stringify({ name: "Minimal" }) },
      { path: "1.0.0.1/evil-link", content: "project.json", attrs: 0o120777 << 16 },
    ]);
    await expect(importNativeClientPackage(gz, tempDir()))
      .rejects.toThrow(/PACKAGE_UNPACK_FAILED.*(symlink|unsafe)/i);
  });

  it("rejects filenames containing NUL bytes", async () => {
    const gz = makeZip([{ path: "1.0.0.1/\0project.json", content: "x" }]);
    await expect(importNativeClientPackage(gz, tempDir()))
      .rejects.toThrow(/PACKAGE_UNPACK_FAILED/);
  });

  it("accepts exactly one version directory with allowed top-level metadata", async () => {
    const gz = makeMinimalProjectZip([["readme.md", "docs"]]);
    const unpacked = await importNativeClientPackage(gz, tempDir());
    await expect(readFile(path.join(unpacked, "readme.md"), "utf8")).resolves.toBe("docs");
  });

  it("rejects multiple version directories", async () => {
    const gz = makeZip([
      { path: "1.0.0.1/project.json", content: "{}" },
      { path: "2.0.0.0/project.json", content: "{}" },
    ]);
    await expect(importNativeClientPackage(gz, tempDir()))
      .rejects.toThrow(/PACKAGE_UNPACK_FAILED.*version/i);
  });

  it("rejects packages with no version directory", async () => {
    const gz = makeZip([{ path: "readme.md", content: "no version here" }]);
    await expect(importNativeClientPackage(gz, tempDir()))
      .rejects.toThrow(/PACKAGE_UNPACK_FAILED.*version/i);
  });

  it("rejects disallowed top-level metadata", async () => {
    const gz = makeZip([
      { path: "1.0.0.1/project.json", content: "{}" },
      { path: "evil.exe", content: "x" },
    ]);
    await expect(importNativeClientPackage(gz, tempDir()))
      .rejects.toThrow(/PACKAGE_UNPACK_FAILED.*(metadata|top-level|unsafe)/i);
  });

  it("rejects an oversized compressed input", async () => {
    const gz = makeZip([{ path: "1.0.0.1/a.txt", content: "x" }]);
    await expect(
      importNativeClientPackage(gz, tempDir(), { limits: { maxCompressedBytes: 4 } }),
    ).rejects.toThrow(/compressed size exceeds/i);
  });

  it("rejects an expanded-size zip bomb", async () => {
    const gz = makeZip([{ path: "1.0.0.1/big.txt", content: "A".repeat(1_000_000) }]);
    await expect(
      importNativeClientPackage(gz, tempDir(), {
        limits: { maxExpandedBytes: 10_000, maxCompressionRatio: 1_000_000 },
      }),
    ).rejects.toThrow(/expanded size exceeds/i);
  });

  it("rejects entries with an extreme compression ratio", async () => {
    const gz = makeZip([{ path: "1.0.0.1/big.txt", content: "A".repeat(1_000_000) }]);
    await expect(
      importNativeClientPackage(gz, tempDir(), { limits: { maxCompressionRatio: 10 } }),
    ).rejects.toThrow(/compression ratio exceeds/i);
  });

  it("rejects too many files", async () => {
    const entries: ZipEntryInput[] = [];
    for (let i = 0; i < 20; i += 1) {
      entries.push({ path: `1.0.0.1/f${i}.txt`, content: "x" });
    }
    const gz = makeZip(entries);
    await expect(
      importNativeClientPackage(gz, tempDir(), { limits: { maxFileCount: 5 } }),
    ).rejects.toThrow(/file count exceeds/i);
  });

  it("rejects overly long entry paths", async () => {
    const gz = makeZip([{ path: `1.0.0.1/${"x".repeat(200)}.txt`, content: "x" }]);
    await expect(
      importNativeClientPackage(gz, tempDir(), { limits: { maxPathLength: 100 } }),
    ).rejects.toThrow(/path length exceeds/i);
  });

  it("packages the same fixture deterministically (SHA-256 and byte-identical unpack)", async () => {
    const gz1 = await packageNativeClientProject(minimalProjectDir);
    const gz2 = await packageNativeClientProject(minimalProjectDir);
    expect(sha256(gz1)).toBe(sha256(gz2));

    const unpacked1 = await importNativeClientPackage(gz1, tempDir());
    const unpacked2 = await importNativeClientPackage(gz2, tempDir());
    await expectDirsEqual(unpacked1, unpacked2);
  });

  it("excludes agent-private metadata and pagerecord record content from packages", async () => {
    const src = await mkdtemp(path.join(tmpdir(), "kf-client-src-"));
    await mkdir(path.join(src, "1.0.0.1", "pagerecord", "recordpages"), { recursive: true });
    await writeFile(path.join(src, "1.0.0.1", "project.json"), JSON.stringify({ name: "Minimal" }));
    await writeFile(path.join(src, "1.0.0.1", "pagerecord", "recordpages", "secret.page"), "top-secret");
    await mkdir(path.join(src, ".kf-agent"));
    await writeFile(path.join(src, ".kf-agent", "state.json"), "{}");

    const gz = await packageNativeClientProject(src);
    const unpacked = await importNativeClientPackage(gz, tempDir());

    // 编译产物里的 pagerecord 骨架（pageRecordManager.json + 空目录）KF 打开必需，
    // 但用户历史记录内容（secret.page 等）仍被排除。
    await expect(readFile(path.join(unpacked, "1.0.0.1/pagerecord/recordpages/secret.page"), "utf8")).rejects.toThrow();
    await expect(readFile(path.join(unpacked, ".kf-agent/state.json"), "utf8")).rejects.toThrow();
    await expect(readFile(path.join(unpacked, "1.0.0.1/project.json"), "utf8")).resolves.toBe(
      JSON.stringify({ name: "Minimal" }),
    );
  });

  it("preserves empty directories as directory entries", async () => {
    const src = await mkdtemp(path.join(tmpdir(), "kf-client-empty-dir-"));
    await mkdir(path.join(src, "1.0.0.1", "empty", "nested"), { recursive: true });
    await writeFile(path.join(src, "1.0.0.1", "project.json"), JSON.stringify({ name: "Minimal" }));

    const gz = await packageNativeClientProject(src);
    const unpacked = await importNativeClientPackage(gz, tempDir());
    const nestedStat = await stat(path.join(unpacked, "1.0.0.1/empty/nested"));
    expect(nestedStat.isDirectory()).toBe(true);
  });

  it("rejects non-ZIP garbage input", async () => {
    const garbage = new Uint8Array(64).fill(0x41);
    await expect(importNativeClientPackage(garbage, tempDir()))
      .rejects.toThrow(/PACKAGE_UNPACK_FAILED/);
  });

  it("produces byte-identical packages across time zones", async () => {
    // fflate encodes DOS timestamps using the host's local time zone; the
    // byte-level normalization must make the archive independent of TZ.
    const prevTz = process.env.TZ;
    try {
      process.env.TZ = "UTC";
      const gzUtc = await packageNativeClientProject(minimalProjectDir);
      process.env.TZ = "Asia/Shanghai";
      const gzShanghai = await packageNativeClientProject(minimalProjectDir);
      process.env.TZ = "America/New_York";
      const gzNewYork = await packageNativeClientProject(minimalProjectDir);

      expect(gzUtc).toEqual(gzShanghai);
      expect(gzUtc).toEqual(gzNewYork);
    } finally {
      if (prevTz === undefined) delete process.env.TZ;
      else process.env.TZ = prevTz;
    }
  });

  it("rejects writes that would traverse a pre-existing symlink directory", async () => {
    const dest = tempDir();
    const outside = await mkdtemp(path.join(tmpdir(), "kf-outside-"));
    await symlink(outside, path.join(dest, "sub"));

    // The entry path passes exactly through the pre-seeded symlink directory.
    const gz = makeZip([
      { path: "1.0.0.1/project.json", content: "{}" },
      { path: "sub/evil.txt", content: "x" },
    ]);

    await expect(safeUnzip(gz, dest, DEFAULT_UNZIP_LIMITS)).rejects.toThrow(/symlink/i);
    // The symlink target must not have received any bytes.
    await expect(readFile(path.join(outside, "evil.txt"), "utf8")).rejects.toThrow();
  });

  it("extracts every entry of a multi-entry package to disk", async () => {
    const dest = tempDir();
    const gz = makeZip([
      { path: "1.0.0.1/project.json", content: '{"name":"Minimal"}' },
      { path: "1.0.0.1/pages/p1.json", content: '{"page":1}' },
      { path: "1.0.0.1/pages/p2.json", content: '{"page":2}' },
      { path: "readme.md", content: "docs" },
    ]);

    await safeUnzip(gz, dest, DEFAULT_UNZIP_LIMITS);

    await expect(readFile(path.join(dest, "1.0.0.1/project.json"), "utf8")).resolves.toBe(
      '{"name":"Minimal"}',
    );
    await expect(readFile(path.join(dest, "1.0.0.1/pages/p1.json"), "utf8")).resolves.toBe(
      '{"page":1}',
    );
    await expect(readFile(path.join(dest, "1.0.0.1/pages/p2.json"), "utf8")).resolves.toBe(
      '{"page":2}',
    );
    await expect(readFile(path.join(dest, "readme.md"), "utf8")).resolves.toBe("docs");
  });
});
