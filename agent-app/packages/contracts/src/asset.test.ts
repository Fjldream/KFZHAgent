import { describe, expect, it } from "vitest";
import { AssetRecordSchema, ResolvedAssetSchema } from "./asset.js";

describe("module asset contracts", () => {
  it("accepts registered logical asset metadata", () => {
    expect(AssetRecordSchema.safeParse({
      id: "brand-mark",
      kind: "image",
      name: "品牌标识",
      mimeType: "image/svg+xml",
      description: "门户页头使用的品牌标识",
    }).success).toBe(true);
  });

  it("rejects raw paths, storage keys, scripts, and unknown keys", () => {
    const asset = { id: "brand-mark", kind: "image", name: "品牌标识", mimeType: "image/svg+xml", description: "品牌标识" };
    expect(AssetRecordSchema.safeParse({ ...asset, path: "/tmp/logo.svg" }).success).toBe(false);
    expect(AssetRecordSchema.safeParse({ ...asset, storageKey: "assets/logo.svg" }).success).toBe(false);
    expect(AssetRecordSchema.safeParse({ ...asset, script: "alert(1)" }).success).toBe(false);
  });

  it("keeps resolution results logical and non-executable", () => {
    expect(ResolvedAssetSchema.safeParse({
      assetId: "brand-mark",
      status: "resolved",
      resolvedName: "品牌标识",
    }).success).toBe(true);
    expect(ResolvedAssetSchema.safeParse({
      assetId: "brand-mark",
      status: "resolved",
      resolvedName: "品牌标识",
      path: "/tmp/logo.svg",
    }).success).toBe(false);
  });
});
