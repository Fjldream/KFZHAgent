// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import { createHash } from "node:crypto";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { prepareReferenceImage } from "./reference-image.js";

const png = (width = 32, height = 16) => sharp({ create: { width, height, channels: 4, background: "#306090" } }).png().toBuffer();
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
describe("trusted reference derivative pixels", () => {
  it.each(["png", "jpeg", "webp"] as const)("fully decodes %s and records separate source and derivative hashes", async format => {
    const source = await sharp(await png()).toFormat(format).toBuffer();
    const prepared = await prepareReferenceImage(source, `image/${format}`);
    expect(prepared.sourceHash).toBe(hash(source));
    expect(prepared.derivativeHash).toBe(hash(prepared.bytes));
    expect(prepared).toMatchObject({ width: 32, height: 16, mimeType: "image/webp", scale: 1 });
    expect(await sharp(prepared.bytes).metadata()).toMatchObject({ format: "webp", width: 32, height: 16 });
    expect(prepared.derivativeHash).not.toBe(prepared.sourceHash);
  });
  it("maintains aspect ratio, bounds the long edge, and strips metadata", async () => {
    const source = await sharp(await png(4096, 2048)).withExif({ IFD0: { Copyright: "private location" } }).png().toBuffer();
    const result = await prepareReferenceImage(source);
    expect(result).toMatchObject({ width: 2048, height: 1024, scale: 0.5 });
    expect((await sharp(result.bytes).metadata()).exif).toBeUndefined();
    expect(result.transform).toMatchObject({ version: 1, sourceWidth: 4096, sourceHeight: 2048, scaleX: 0.5, scaleY: 0.5 });
  });
  it("normalizes EXIF orientation before measuring scale and strips GPS/EXIF", async () => {
    const source = await sharp(await png(100, 200)).withMetadata({ orientation: 6 }).jpeg().toBuffer();
    const result = await prepareReferenceImage(source);
    expect(result).toMatchObject({ width: 200, height: 100, scale: 1 });
    expect(result.transform).toMatchObject({ sourceWidth: 100, sourceHeight: 200, orientedWidth: 200, orientedHeight: 100 });
    expect((await sharp(result.bytes).metadata()).orientation).toBeUndefined();
  });
  it("rejects spoofed MIME, malformed containers, trailing payload and invalid compressed pixels", async () => {
    const source = await png();
    await expect(prepareReferenceImage(source, "image/jpeg")).rejects.toThrow("IMAGE_MIME_MISMATCH");
    await expect(prepareReferenceImage(Buffer.from("<svg onload='x'/>") )).rejects.toThrow("IMAGE_FORMAT_UNSUPPORTED");
    await expect(prepareReferenceImage(source.subarray(0, source.length - 4))).rejects.toThrow("IMAGE_INVALID");
    await expect(prepareReferenceImage(Buffer.concat([source, Buffer.from("<script/>")]))).rejects.toThrow("IMAGE_INVALID");
    // Structurally sized JPEG: header inspection alone is insufficient; the pixel decoder must reject it.
    const noEntropy = Buffer.from("ffd8ffc0000b080001000101011100ffda0008010100003f0001ffd9", "hex");
    await expect(prepareReferenceImage(noEntropy)).rejects.toThrow("IMAGE_INVALID");
  });
  it("rejects decompression bombs before decoding pixels", async () => {
    const source = await png(8000, 4001);
    await expect(prepareReferenceImage(source)).rejects.toThrow("IMAGE_DIMENSIONS_EXCEEDED");
  });
  it("rejects animated WebP rather than silently extracting its first frame", async () => {
    const pixels = Buffer.alloc(16 * 32 * 4);
    pixels.fill(255, 0, 16 * 16 * 4);
    const source = await sharp(pixels, { raw: { width: 16, height: 32, channels: 4, pageHeight: 16 } })
      .webp({ loop: 0, delay: [100, 100] }).toBuffer();
    expect((await sharp(source, { animated: true }).metadata()).pages).toBe(2);
    await expect(prepareReferenceImage(source)).rejects.toThrow("IMAGE_FORMAT_UNSUPPORTED");
  });
});
// end
