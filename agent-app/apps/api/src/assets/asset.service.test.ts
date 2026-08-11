import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import type { ArtifactStorage, StoredArtifact } from "@kf/artifact-storage";
import { AssetService } from "./asset.service.js";

const T_A = "tenant-a";
const T_B = "tenant-b";
const W_A = "workspace-a";
const W_B = "workspace-b";

// Hand-checked valid 1×1 images. Tests intentionally give false HTTP MIME
// headers: the service must derive media type from bytes, not client claims.
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/mXPo5QAAAABJRU5ErkJggg==",
  "base64",
);
// Minimal structurally complete 1×1 sequential/progressive fixtures. The
// asset service validates container grammar and metadata, not JPEG entropy
// decoding, so the deliberately tiny entropy payload is sufficient here.
const JPEG_1X1 = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
  0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00,
  0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x01, 0xff, 0xd9,
]);
const PROGRESSIVE_JPEG_1X1 = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
  0xff, 0xc2, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00,
  0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x01, 0xff, 0xd9,
]);
const WEBP_1X1 = Buffer.from(
  "UklGRiIAAABXRUJQVlA4IBYAAABwAQCdASoBAAEAAUAmJaQAA3AA/vuU",
  "base64",
);
const HEADER_ONLY_JPEG = Buffer.from("ffd8ffe00002ffc000080001000100ffd9", "hex");
const STRUCTURALLY_SIZED_HEADER_ONLY_JPEG = Buffer.from("ffd8ffc0000b080001000101011100ffd9", "hex");
const SOS_INDEX = JPEG_1X1.indexOf(Buffer.from([0xff, 0xda]));
const INCOMPLETE_SOS_JPEG = JPEG_1X1.subarray(0, SOS_INDEX + 2 + JPEG_1X1.readUInt16BE(SOS_INDEX + 2));
const INVALID_VERTICAL_SAMPLING_JPEG = Buffer.from(JPEG_1X1);
INVALID_VERTICAL_SAMPLING_JPEG[31] = 0x10;
const INVALID_BASELINE_SOS_JPEG = Buffer.from(JPEG_1X1);
INVALID_BASELINE_SOS_JPEG[42] = 0x01;
const INVALID_PROGRESSIVE_SOS_JPEG = Buffer.from(PROGRESSIVE_JPEG_1X1);
INVALID_PROGRESSIVE_SOS_JPEG[41] = 0x01;

type ProgressiveScanFixture = {
  components: number[];
  spectralStart: number;
  spectralEnd: number;
  successiveHigh: number;
  successiveLow: number;
};

function progressiveJpeg(scans: ProgressiveScanFixture[], frameComponents = [1, 2]): Buffer {
  const bytes = [
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xff, 0xc2, 0x00, 8 + frameComponents.length * 3, 0x08, 0x00, 0x01, 0x00, 0x01, frameComponents.length,
  ];
  for (const component of frameComponents) bytes.push(component, 0x11, 0x00);
  for (const scan of scans) {
    bytes.push(0xff, 0xda, 0x00, 6 + scan.components.length * 2, scan.components.length);
    for (const component of scan.components) bytes.push(component, 0x00);
    bytes.push(scan.spectralStart, scan.spectralEnd, (scan.successiveHigh << 4) | scan.successiveLow, 0x01);
  }
  bytes.push(0xff, 0xd9);
  return Buffer.from(bytes);
}

const VALID_PROGRESSIVE_MULTI_SCAN = progressiveJpeg([
  { components: [1, 2], spectralStart: 0, spectralEnd: 0, successiveHigh: 0, successiveLow: 1 },
  { components: [1, 2], spectralStart: 0, spectralEnd: 0, successiveHigh: 1, successiveLow: 0 },
  { components: [1], spectralStart: 1, spectralEnd: 2, successiveHigh: 0, successiveLow: 0 },
]);
const PROGRESSIVE_AC_TWO_COMPONENTS = progressiveJpeg([
  { components: [1, 2], spectralStart: 1, spectralEnd: 1, successiveHigh: 0, successiveLow: 0 },
]);
const PROGRESSIVE_REFINE_WITHOUT_INITIAL = progressiveJpeg([
  { components: [1], spectralStart: 0, spectralEnd: 0, successiveHigh: 1, successiveLow: 0 },
]);
const PROGRESSIVE_DUPLICATE_INITIAL = progressiveJpeg([
  { components: [1], spectralStart: 0, spectralEnd: 0, successiveHigh: 0, successiveLow: 0 },
  { components: [1], spectralStart: 0, spectralEnd: 0, successiveHigh: 0, successiveLow: 0 },
]);
const PROGRESSIVE_SKIPPED_REFINEMENT = progressiveJpeg([
  { components: [1], spectralStart: 0, spectralEnd: 0, successiveHigh: 0, successiveLow: 2 },
  { components: [1], spectralStart: 0, spectralEnd: 0, successiveHigh: 1, successiveLow: 0 },
]);
const PROGRESSIVE_OVERLAPPING_INITIAL = progressiveJpeg([
  { components: [1], spectralStart: 1, spectralEnd: 3, successiveHigh: 0, successiveLow: 0 },
  { components: [1], spectralStart: 3, spectralEnd: 4, successiveHigh: 0, successiveLow: 0 },
]);

class MemoryStorage implements ArtifactStorage {
  readonly bytes = new Map<string, Buffer>();
  failPut = false;
  private sequence = 0;

  async put(input: {
    tenantId: string;
    kind: string;
    stream: NodeJS.ReadableStream;
    maxBytes: number;
  }): Promise<StoredArtifact> {
    if (this.failPut) throw new Error("storage unavailable");
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of input.stream as AsyncIterable<Buffer | string>) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += bytes.length;
      if (size > input.maxBytes) throw new Error("ARTIFACT_TOO_LARGE");
      chunks.push(bytes);
    }
    const body = Buffer.concat(chunks);
    const artifactId = `blob-${++this.sequence}`;
    this.bytes.set(`${input.tenantId}/${artifactId}`, body);
    return { artifactId, size: body.length, sha256: createHash("sha256").update(body).digest("hex") };
  }

  async open(tenantId: string, artifactId: string): Promise<NodeJS.ReadableStream> {
    const body = this.bytes.get(`${tenantId}/${artifactId}`);
    if (body === undefined) throw new Error("not found");
    return Readable.from([body]);
  }

  async delete(tenantId: string, artifactId: string): Promise<void> {
    this.bytes.delete(`${tenantId}/${artifactId}`);
  }
}

type AssetRow = {
  id: string;
  tenantId: string;
  workspaceId: string;
  type: string;
  name: string;
  mediaType: string;
  storageKey: string;
  sha256: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
  tags: unknown;
  createdAt: Date;
};

function fakePrisma(options: { dbFailure?: "unreferenced" | "adopted" | "unknown" } = {}) {
  const rows: AssetRow[] = [];
  const workspaceIds = new Set([`${T_A}/${W_A}`, `${T_B}/${W_B}`]);
  let rowId = 0;
  const workspaceLock = async <T>(
    _strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T> => {
    const [workspaceId, tenantId] = values;
    return (typeof workspaceId === "string" && typeof tenantId === "string" &&
      workspaceIds.has(`${tenantId}/${workspaceId}`) ? [{ id: workspaceId }] : []) as T;
  };
  const client = {
    rows,
    solutionWorkspace: {
      findFirst: async ({ where }: { where: { id: string; tenantId: string } }) =>
        workspaceIds.has(`${where.tenantId}/${where.id}`) ? { id: where.id } : null,
    },
    workspaceAsset: {
      findFirst: async ({ where }: { where: { tenantId: string; workspaceId: string; sha256?: string; storageKey?: string } }) => {
        if (where.storageKey !== undefined && options.dbFailure === "unknown") throw new Error("database unavailable");
        return rows.find((row) => row.tenantId === where.tenantId && row.workspaceId === where.workspaceId &&
          (where.sha256 === undefined || row.sha256 === where.sha256) &&
          (where.storageKey === undefined || row.storageKey === where.storageKey)) ?? null;
      },
      create: async ({ data }: { data: Omit<AssetRow, "id" | "createdAt"> }) => {
        const row: AssetRow = { ...data, id: `asset-${++rowId}`, createdAt: new Date(0) };
        if (options.dbFailure === "adopted") {
          rows.push(row);
          throw new Error("commit acknowledgement lost");
        }
        if (options.dbFailure !== undefined) throw new Error("db write failed");
        rows.push(row);
        return row;
      },
      findMany: async ({ where, orderBy }: { where: { tenantId: string; workspaceId: string; id?: { in: string[] } }; orderBy?: unknown }) => {
        void orderBy;
        return rows.filter((row) => row.tenantId === where.tenantId && row.workspaceId === where.workspaceId &&
          (where.id === undefined || where.id.in.includes(row.id)));
      },
      deleteMany: async ({ where }: { where: { tenantId: string; workspaceId: string } }) => {
        const before = rows.length;
        for (let index = rows.length - 1; index >= 0; index -= 1) {
          if (rows[index]!.tenantId === where.tenantId && rows[index]!.workspaceId === where.workspaceId) rows.splice(index, 1);
        }
        return { count: before - rows.length };
      },
    },
    $queryRaw: workspaceLock,
  };
  return {
    ...client,
    $transaction: async <T>(callback: (tx: typeof client) => Promise<T>): Promise<T> => callback(client),
  };
}

function service(options: { dbFailure?: "unreferenced" | "adopted" | "unknown" } = {}) {
  const prisma = fakePrisma(options);
  const storage = new MemoryStorage();
  return { prisma, storage, service: new AssetService(prisma as never, storage) };
}

describe("AssetService", () => {
  it.each([
    ["PNG", PNG_1X1, "image/png"],
    ["JPEG", JPEG_1X1, "image/jpeg"],
    ["WebP", WEBP_1X1, "image/webp"],
  ])("accepts a valid %s based on file bytes rather than declared MIME", async (_label, bytes, mediaType) => {
    const { service: assets } = service();
    const result = await assets.upload({
      tenantId: T_A,
      workspaceId: W_A,
      name: "profile-image",
      declaredMediaType: "text/html",
      stream: Readable.from([bytes]),
    });

    expect(result).toMatchObject({ name: "profile-image", mediaType, width: 1, height: 1, type: "image" });
    expect(result).not.toHaveProperty("storageKey");
  });

  it("accepts a valid progressive JPEG scan", async () => {
    const { service: assets } = service();
    await expect(assets.upload({
      tenantId: T_A,
      workspaceId: W_A,
      name: "progressive.jpg",
      stream: Readable.from([PROGRESSIVE_JPEG_1X1]),
    })).resolves.toMatchObject({ mediaType: "image/jpeg", width: 1, height: 1 });
  });

  it("accepts valid multi-component DC and single-component AC progressive scans", async () => {
    const { service: assets } = service();
    await expect(assets.upload({
      tenantId: T_A,
      workspaceId: W_A,
      name: "multi-progressive.jpg",
      stream: Readable.from([VALID_PROGRESSIVE_MULTI_SCAN]),
    })).resolves.toMatchObject({ mediaType: "image/jpeg", width: 1, height: 1 });
  });

  it.each([
    ["PNG", PNG_1X1],
    ["JPEG", JPEG_1X1],
    ["WebP", WEBP_1X1],
  ])("rejects a structurally complete-looking %s with trailing executable bytes before database adoption", async (_label, bytes) => {
    const { service: assets, prisma, storage } = service();
    await expect(assets.upload({
      tenantId: T_A,
      workspaceId: W_A,
      name: "trailing-image",
      stream: Readable.from([Buffer.concat([bytes, Buffer.from("<script>alert(1)</script>")])]),
    })).rejects.toThrow("ASSET_INVALID_CONTAINER");
    expect(prisma.rows).toHaveLength(0);
    expect(storage.bytes.size).toBe(0);
  });

  it("rejects a truncated PNG that still declares dimensions before database adoption", async () => {
    const { service: assets, prisma, storage } = service();
    await expect(assets.upload({
      tenantId: T_A,
      workspaceId: W_A,
      name: "truncated.png",
      stream: Readable.from([PNG_1X1.subarray(0, PNG_1X1.length - 4)]),
    })).rejects.toThrow("ASSET_INVALID_CONTAINER");
    expect(prisma.rows).toHaveLength(0);
    expect(storage.bytes.size).toBe(0);
  });

  it.each([
    ["header-only pseudo JPEG", HEADER_ONLY_JPEG],
    ["structurally sized header-only JPEG", STRUCTURALLY_SIZED_HEADER_ONLY_JPEG],
    ["incomplete SOS JPEG", INCOMPLETE_SOS_JPEG],
  ])("rejects %s before database adoption", async (_label, bytes) => {
    const { service: assets, prisma, storage } = service();
    await expect(assets.upload({
      tenantId: T_A,
      workspaceId: W_A,
      name: "invalid.jpg",
      stream: Readable.from([bytes]),
    })).rejects.toThrow("ASSET_INVALID_CONTAINER");
    expect(prisma.rows).toHaveLength(0);
    expect(storage.bytes.size).toBe(0);
  });

  it.each([
    ["a two-component progressive AC scan", PROGRESSIVE_AC_TWO_COMPONENTS],
    ["a progressive refinement without initial coefficients", PROGRESSIVE_REFINE_WITHOUT_INITIAL],
    ["a duplicate progressive initial scan", PROGRESSIVE_DUPLICATE_INITIAL],
    ["a skipped progressive refinement", PROGRESSIVE_SKIPPED_REFINEMENT],
    ["an overlapping progressive initial band", PROGRESSIVE_OVERLAPPING_INITIAL],
  ])("rejects %s before database adoption", async (_label, bytes) => {
    const { service: assets, prisma, storage } = service();
    await expect(assets.upload({
      tenantId: T_A,
      workspaceId: W_A,
      name: "invalid-progressive.jpg",
      stream: Readable.from([bytes]),
    })).rejects.toThrow("ASSET_INVALID_CONTAINER");
    expect(prisma.rows).toHaveLength(0);
    expect(storage.bytes.size).toBe(0);
  });

  it.each([
    ["a vertical sampling factor of zero", INVALID_VERTICAL_SAMPLING_JPEG],
    ["baseline SOS successive approximation", INVALID_BASELINE_SOS_JPEG],
    ["progressive DC spectral range", INVALID_PROGRESSIVE_SOS_JPEG],
  ])("rejects %s before database adoption", async (_label, bytes) => {
    const { service: assets, prisma, storage } = service();
    await expect(assets.upload({
      tenantId: T_A,
      workspaceId: W_A,
      name: "invalid-structure.jpg",
      stream: Readable.from([bytes]),
    })).rejects.toThrow("ASSET_INVALID_CONTAINER");
    expect(prisma.rows).toHaveLength(0);
    expect(storage.bytes.size).toBe(0);
  });

  it("rejects non-image, empty, dimensionless, and oversized upload bodies", async () => {
    const { service: assets } = service();
    await expect(assets.upload({ tenantId: T_A, workspaceId: W_A, name: "evil.svg", stream: Readable.from(["<svg onload=alert(1) />"]) }))
      .rejects.toThrow("ASSET_UNSUPPORTED_MEDIA");
    await expect(assets.upload({ tenantId: T_A, workspaceId: W_A, name: "empty", stream: Readable.from([]) }))
      .rejects.toThrow("ASSET_EMPTY");
    await expect(assets.upload({ tenantId: T_A, workspaceId: W_A, name: "dimensionless", stream: Readable.from([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])]) }))
      .rejects.toThrow("ASSET_INVALID_CONTAINER");
    await expect(assets.upload({ tenantId: T_A, workspaceId: W_A, name: "large", maxBytes: 20, stream: Readable.from([PNG_1X1]) }))
      .rejects.toThrow("ASSET_TOO_LARGE");
  });

  it("deduplicates identical bytes within a workspace without leaking storage keys", async () => {
    const { service: assets, storage, prisma } = service();
    const one = await assets.upload({ tenantId: T_A, workspaceId: W_A, name: "first.png", stream: Readable.from([PNG_1X1]) });
    const two = await assets.upload({ tenantId: T_A, workspaceId: W_A, name: "renamed.png", stream: Readable.from([PNG_1X1]) });

    expect(two).toEqual(one);
    expect(prisma.rows).toHaveLength(1);
    expect(storage.bytes.size).toBe(1);
  });

  it("enforces exact tenant and workspace scope for upload, list, and resolution", async () => {
    const { service: assets } = service();
    const asset = await assets.upload({ tenantId: T_A, workspaceId: W_A, name: "private.png", stream: Readable.from([PNG_1X1]) });

    await expect(assets.list({ tenantId: T_B, workspaceId: W_A })).rejects.toThrow("workspace");
    await expect(assets.resolveMany({ tenantId: T_B, workspaceId: W_B, assetIds: [asset.id] }))
      .rejects.toMatchObject({ missingAssetIds: [asset.id] });
    expect(await assets.list({ tenantId: T_A, workspaceId: W_A })).toEqual([asset]);
  });

  it("resolves unique ids with stable requested ordering and exact missing ids", async () => {
    const { service: assets } = service();
    const first = await assets.upload({ tenantId: T_A, workspaceId: W_A, name: "first.png", stream: Readable.from([PNG_1X1]) });
    const second = await assets.upload({ tenantId: T_A, workspaceId: W_A, name: "second.jpg", stream: Readable.from([JPEG_1X1]) });

    await expect(assets.resolveMany({ tenantId: T_A, workspaceId: W_A, assetIds: [second.id, "missing", first.id, "missing"] }))
      .rejects.toMatchObject({ missingAssetIds: ["missing"] });
    await expect(assets.resolveMany({ tenantId: T_A, workspaceId: W_A, assetIds: [second.id, first.id] }))
      .resolves.toEqual([
        { id: second.id, kind: "image", name: "second.jpg", mimeType: "image/jpeg", description: "Uploaded workspace image" },
        { id: first.id, kind: "image", name: "first.png", mimeType: "image/png", description: "Uploaded workspace image" },
      ]);
  });

  it("cleans a proven-unreferenced blob after a database failure", async () => {
    const { service: failingAssets, storage } = service({ dbFailure: "unreferenced" });
    await expect(failingAssets.upload({ tenantId: T_A, workspaceId: W_A, name: "rollback.png", stream: Readable.from([PNG_1X1]) }))
      .rejects.toThrow("db write failed");
    expect(storage.bytes.size).toBe(0);
  });

  it("retains a blob when the failed database commit may already have adopted it", async () => {
    const { service: failingAssets, storage, prisma } = service({ dbFailure: "adopted" });
    await expect(failingAssets.upload({ tenantId: T_A, workspaceId: W_A, name: "adopted.png", stream: Readable.from([PNG_1X1]) }))
      .rejects.toThrow("commit acknowledgement lost");
    expect(prisma.rows).toHaveLength(1);
    expect(storage.bytes.size).toBe(1);
  });

  it("retains a blob when adoption lookup is unavailable", async () => {
    const { service: failingAssets, storage } = service({ dbFailure: "unknown" });
    await expect(failingAssets.upload({ tenantId: T_A, workspaceId: W_A, name: "unknown.png", stream: Readable.from([PNG_1X1]) }))
      .rejects.toThrow("db write failed");
    expect(storage.bytes.size).toBe(1);
  });
});
