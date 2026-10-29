// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import { describe, expect, it } from "vitest";
import { validateReferenceImage } from "./image-policy.js";

const valid = { mimeType: "image/png", byteSize: 1024, width: 1440, height: 900, animated: false };
describe("reference image admission policy", () => {
  it("accepts static supported images at exact limits", () => {
    for (const mimeType of ["image/png", "image/jpeg", "image/webp"]) {
      expect(() => validateReferenceImage({ ...valid, mimeType, byteSize: 10 * 1024 * 1024, width: 8000, height: 4000 })).not.toThrow();
    }
    expect(() => validateReferenceImage({ ...valid, width: 8192, height: 1 })).not.toThrow();
  });
  it.each(["image/svg+xml", "image/gif", "text/html", "IMAGE/PNG"])("rejects unsupported format %s", mimeType => {
    expect(() => validateReferenceImage({ ...valid, mimeType })).toThrow("IMAGE_FORMAT_UNSUPPORTED");
  });
  it("rejects animation", () => {
    expect(() => validateReferenceImage({ ...valid, animated: true })).toThrow("IMAGE_FORMAT_UNSUPPORTED");
  });
  it.each([0, -1, 1.5, NaN, Infinity, 10 * 1024 * 1024 + 1])("rejects invalid byte size %s", byteSize => {
    expect(() => validateReferenceImage({ ...valid, byteSize })).toThrow("IMAGE_BYTES_EXCEEDED");
  });
  it.each([{ width: 9000, height: 100 }, { width: 8000, height: 4001 }, { width: 0, height: 100 },
    { width: -1, height: 100 }, { width: 1.5, height: 100 }, { width: NaN, height: 100 }, { width: 100, height: Infinity }])("rejects invalid dimensions %j", dimensions => {
    expect(() => validateReferenceImage({ ...valid, ...dimensions })).toThrow("IMAGE_DIMENSIONS_EXCEEDED");
  });
});
// end
