import { describe, expect, it } from "vitest";
import { AssetRecordSchema } from "@kf/contracts";
import { fromModelAssetId, toModelAssetId } from "./model-asset-id.js";

describe("model asset ids", () => {
  it("round-trips a canonical UUID through a stable non-GUID AssetId", () => {
    const uuid = "12345678-90ab-4cde-8fab-1234567890ab";
    const publicId = toModelAssetId(uuid);
    expect(publicId).toBe("asset-1234567890ab4cde8fab1234567890ab");
    expect(AssetRecordSchema.shape.id.parse(publicId)).toBe(publicId);
    expect(fromModelAssetId(publicId)).toBe(uuid);
  });

  it.each([
    "12345678-90ab-4cde-8fab-1234567890ab",
    "asset-12345678-90ab-4cde-8fab-1234567890ab",
    "asset-1234567890AB4cde8fab1234567890ab",
    "asset-short",
  ])("rejects a non-canonical public id: %s", (value) => {
    expect(() => fromModelAssetId(value)).toThrow("invalid model asset id");
  });
});
