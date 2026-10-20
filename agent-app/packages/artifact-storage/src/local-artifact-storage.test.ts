import { mkdtemp, readdir, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { LocalArtifactStorage } from "./local-artifact-storage.js";

const KIND = "calculation-package" as const;

async function tempRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "kf-artifact-storage-"));
}

async function readAll(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readBytes(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  for (;;) {
    try {
      if (await predicate()) return;
    } catch (err) {
      // put() 创建租户目录异步；在那个 mkdir 之前 readdir 解析会返回 ENOENT 并必须重试，而不是失败。
      if (!(err instanceof Error) || (err as { code?: string }).code !== "ENOENT") {
        throw err;
      }
    }
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe("LocalArtifactStorage", () => {
  it("preserves an opaque sliced Uint8Array at the maxBytes boundary", async () => {
    const root = await tempRoot();
    const storage = new LocalArtifactStorage(root);
    const backing = new Uint8Array([0xff, 0x00, 0x80, 0x50, 0x4b, 0x03, 0x04, 0xee]);
    const bytes = backing.subarray(1, 7);

    const stored = await storage.put({
      tenantId: "tenant-a",
      kind: KIND,
      stream: Readable.from([bytes]),
      maxBytes: bytes.byteLength,
    });

    expect(stored.size).toBe(6);
    expect(stored.sha256).toBe("baf3a6277cc7a9ce2cfd382cf6011839b5fbf46b2517419ab4cbe83eeb67a4b3");
    await expect(readBytes(await storage.open("tenant-a", stored.artifactId)))
      .resolves.toEqual(Buffer.from([0x00, 0x80, 0x50, 0x4b, 0x03, 0x04]));
  });

  it("rejects an opaque sliced Uint8Array one byte above maxBytes", async () => {
    const root = await tempRoot();
    const storage = new LocalArtifactStorage(root);
    const backing = new Uint8Array([0xff, 0x00, 0x80, 0x50, 0x4b, 0x03, 0x04, 0xee]);
    const bytes = backing.subarray(1, 7);

    await expect(storage.put({
      tenantId: "tenant-a",
      kind: KIND,
      stream: Readable.from([bytes]),
      maxBytes: bytes.byteLength - 1,
    })).rejects.toThrow("ARTIFACT_TOO_LARGE");

    expect(await readdir(path.join(root, "tenant-a"))).toEqual([]);
  });

  it("isolates artifacts by tenant", async () => {
    const root = await tempRoot();
    const storage = new LocalArtifactStorage(root);
    const { artifactId } = await storage.put({
      tenantId: "tenant-a",
      kind: KIND,
      stream: Readable.from(["hello-a"]),
      maxBytes: 1024,
    });

    // 租户 b 无法看到租户 a 的 artifact。
    await expect(storage.open("tenant-b", artifactId)).rejects.toThrow();
    await expect(storage.delete("tenant-b", artifactId)).rejects.toThrow();

    // 租户 a 可以读回自己的 artifact。
    const stream = await storage.open("tenant-a", artifactId);
    await expect(readAll(stream)).resolves.toBe("hello-a");
  });

  it("idempotently adopts a trusted artifact id without overwriting different bytes", async () => {
    const root = await tempRoot();
    const storage = new LocalArtifactStorage(root);
    const artifactId = "11111111-2222-4333-8444-555555555555";

    const first = await storage.put({
      tenantId: "tenant-a",
      kind: KIND,
      artifactId,
      stream: Readable.from(["deterministic-package"]),
      maxBytes: 1024,
    });
    const adopted = await storage.put({
      tenantId: "tenant-a",
      kind: KIND,
      artifactId,
      stream: Readable.from(["deterministic-package"]),
      maxBytes: 1024,
    });

    expect(adopted).toEqual(first);
    expect((await readdir(path.join(root, "tenant-a"))).filter((name) => !name.startsWith(".put-")))
      .toEqual([artifactId]);

    await expect(storage.put({
      tenantId: "tenant-a",
      kind: KIND,
      artifactId,
      stream: Readable.from(["different-package"]),
      maxBytes: 1024,
    })).rejects.toThrow("ARTIFACT_ID_CONFLICT");
    await expect(readAll(await storage.open("tenant-a", artifactId))).resolves.toBe("deterministic-package");
  });

  it("rejects path components containing .. in tenantId and artifactId", async () => {
    const root = await tempRoot();
    const storage = new LocalArtifactStorage(root);

    await expect(
      storage.put({ tenantId: "../evil", kind: KIND, stream: Readable.from(["x"]), maxBytes: 1024 }),
    ).rejects.toThrow();
    await expect(
      storage.put({ tenantId: "a/../b", kind: KIND, stream: Readable.from(["x"]), maxBytes: 1024 }),
    ).rejects.toThrow();
    await expect(storage.open("tenant-a", "../outside")).rejects.toThrow();
    await expect(storage.open("tenant-a", "a/../b")).rejects.toThrow();
    await expect(storage.delete("tenant-a", "../outside")).rejects.toThrow();
  });

  it("writes via a temporary file and atomically renames", async () => {
    const root = await tempRoot();
    const storage = new LocalArtifactStorage(root);

    const stream = new Readable({ read() {} });
    const putPromise = storage.put({
      tenantId: "tenant-a",
      kind: KIND,
      stream,
      maxBytes: 4096,
    });

    // 写入仍在进行时，临时文件必须存在，最终制品必须尚未存在。
    await waitFor(async () => {
      const entries = await readdir(path.join(root, "tenant-a"));
      return entries.some((e) => e.startsWith(".put-") && e.endsWith(".tmp"));
    });

    const duringEntries = await readdir(path.join(root, "tenant-a"));
    expect(duringEntries.some((e) => e.startsWith(".put-"))).toBe(true);
    expect(duringEntries.every((e) => e.startsWith(".put-"))).toBe(true); // 只有临时文件，没有最终 artifact 了。

    stream.push("part-1-");
    await new Promise((r) => setTimeout(r, 20));
    stream.push("part-2");
    stream.push(null);

    const result = await putPromise;
    expect(result.size).toBe("part-1-part-2".length);
    expect(result.artifactId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.sha256).toMatch(/^[0-9a-f]{64}$/);

    const afterEntries = await readdir(path.join(root, "tenant-a"));
    expect(afterEntries).toContain(result.artifactId);
    expect(afterEntries.some((e) => e.startsWith(".put-"))).toBe(false);

    const finalStat = await stat(path.join(root, "tenant-a", result.artifactId));
    expect(finalStat.isFile()).toBe(true);
    const stream2 = await storage.open("tenant-a", result.artifactId);
    await expect(readAll(stream2)).resolves.toBe("part-1-part-2");
  });

  it("respects maxBytes and leaves no temp residue", async () => {
    const root = await tempRoot();
    const storage = new LocalArtifactStorage(root);

    const stream = Readable.from([Buffer.alloc(2048, 0x61)]);
    await expect(
      storage.put({ tenantId: "tenant-a", kind: KIND, stream, maxBytes: 1024 }),
    ).rejects.toThrow("ARTIFACT_TOO_LARGE");

    const entries = await readdir(path.join(root, "tenant-a"));
    expect(entries).toEqual([]);
  });

  it("keeps stored artifacts below the configured root", async () => {
    const root = await tempRoot();
    const storage = new LocalArtifactStorage(root);
    const { artifactId } = await storage.put({
      tenantId: "tenant-a",
      kind: KIND,
      stream: Readable.from(["below-root"]),
      maxBytes: 1024,
    });

    // 磁盘布局必须保持为 <root>/<tenantId>/<artifactId>，并且公共返回类型必须不暴露任何路径。
    const resolved = path.resolve(root, "tenant-a", artifactId);
    expect(resolved.startsWith(path.resolve(root) + path.sep)).toBe(true);

    const projectJson = await readFile(resolved, "utf8");
    expect(projectJson).toBe("below-root");
  });

  it("deletes an artifact", async () => {
    const root = await tempRoot();
    const storage = new LocalArtifactStorage(root);
    const { artifactId } = await storage.put({
      tenantId: "tenant-a",
      kind: KIND,
      stream: Readable.from(["to-delete"]),
      maxBytes: 1024,
    });

    await storage.delete("tenant-a", artifactId);
    await expect(storage.open("tenant-a", artifactId)).rejects.toThrow(
      /ARTIFACT_NOT_FOUND/,
    );
    const entries = await readdir(path.join(root, "tenant-a"));
    expect(entries).toEqual([]);
  });

  it("fails cleanly when the source stream errors", async () => {
    const root = await tempRoot();
    const storage = new LocalArtifactStorage(root);

    const stream = new Readable({
      read() {
        this.destroy(new Error("boom"));
      },
    });
    await expect(
      storage.put({ tenantId: "tenant-a", kind: KIND, stream, maxBytes: 1024 }),
    ).rejects.toThrow("boom");

    const entries = await readdir(path.join(root, "tenant-a"));
    expect(entries).toEqual([]);
  });

  it("cleans up the temp file when maxBytes is exceeded mid-stream", async () => {
    const root = await tempRoot();
    const storage = new LocalArtifactStorage(root);

    const stream = new Readable({ read() {} });
    const putPromise = storage.put({
      tenantId: "tenant-a",
      kind: KIND,
      stream,
      maxBytes: 32,
    });

    await waitFor(async () => {
      const entries = await readdir(path.join(root, "tenant-a"));
      return entries.some((e) => e.startsWith(".put-"));
    });

    stream.push(Buffer.alloc(64, 0x62));
    await expect(putPromise).rejects.toThrow("ARTIFACT_TOO_LARGE");
    stream.destroy();

    await waitFor(async () => {
      const entries = await readdir(path.join(root, "tenant-a"));
      return entries.length === 0;
    });
  });
});
