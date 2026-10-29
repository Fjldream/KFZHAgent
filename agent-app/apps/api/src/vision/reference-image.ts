// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import { createHash } from "node:crypto";
import sharp from "sharp";
import { inspectImage } from "../assets/asset.service.js";
import { DERIVATIVE_EDGE, MAX_REFERENCE_BYTES, MAX_REFERENCE_PIXELS, validateReferenceImage } from "./image-policy.js";

export type PreparedReferenceImage = {
  sourceHash: string; sourceMimeType: "image/png" | "image/jpeg" | "image/webp";
  derivativeHash: string; mimeType: "image/webp"; width: number; height: number; bytes: Buffer; scale: number;
  transform: { version: 1; autoOrient: true; sourceWidth: number; sourceHeight: number;
    orientedWidth: number; orientedHeight: number; scaleX: number; scaleY: number; scale: number };
};

/** Buffer only: no URL/path loader, no provider call, no metadata/base64 logging. */
export async function prepareReferenceImage(bytes: Buffer, declaredMimeType?: string): Promise<PreparedReferenceImage> {
  if (bytes.length === 0 || bytes.length > MAX_REFERENCE_BYTES) throw new Error("IMAGE_BYTES_EXCEEDED");
  // Existing material validation only admits static WebP; classify animation before that validator.
  if ((bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && hasPngAnimation(bytes)) ||
    (bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP" && hasWebpAnimation(bytes))) {
    throw new Error("IMAGE_FORMAT_UNSUPPORTED");
  }
  let source: ReturnType<typeof inspectImage>;
  try { source = inspectImage(bytes, bytes.length); } catch (error) {
    if (error instanceof Error && error.message === "ASSET_UNSUPPORTED_MEDIA") throw new Error("IMAGE_FORMAT_UNSUPPORTED");
    throw new Error("IMAGE_INVALID");
  }
  const declared = declaredMimeType?.split(";")[0]?.trim().toLowerCase();
  if (declared && declared !== "application/octet-stream" && declared !== source.mediaType) throw new Error("IMAGE_MIME_MISMATCH");
  validateReferenceImage({ mimeType: source.mediaType, byteSize: bytes.length, ...source, animated: false });
  try {
    const pipeline = sharp(bytes, { limitInputPixels: MAX_REFERENCE_PIXELS, failOn: "warning" });
    const metadata = await pipeline.metadata();
    if ((metadata.pages ?? 1) !== 1 || (source.mediaType === "image/webp" && hasWebpAnimation(bytes))) {
      throw new Error("IMAGE_FORMAT_UNSUPPORTED");
    }
    const swap = metadata.orientation !== undefined && metadata.orientation >= 5;
    const orientedWidth = swap ? source.height : source.width;
    const orientedHeight = swap ? source.width : source.height;
    // Re-encoding forces pixel decode. Default sharp output strips EXIF/ICC/XMP/IPTC.
    const { data, info } = await pipeline.rotate().resize({ width: DERIVATIVE_EDGE, height: DERIVATIVE_EDGE, fit: "inside", withoutEnlargement: true })
      .webp({ lossless: true }).timeout({ seconds: 10 }).toBuffer({ resolveWithObject: true });
    if (data.length > MAX_REFERENCE_BYTES) throw new Error("IMAGE_BYTES_EXCEEDED");
    const scale = Math.min(1, DERIVATIVE_EDGE / Math.max(orientedWidth, orientedHeight));
    return {
      sourceHash: hash(bytes), sourceMimeType: source.mediaType, derivativeHash: hash(data), mimeType: "image/webp",
      width: info.width, height: info.height, bytes: data, scale,
      transform: { version: 1, autoOrient: true, sourceWidth: source.width, sourceHeight: source.height,
        orientedWidth, orientedHeight, scaleX: info.width / orientedWidth, scaleY: info.height / orientedHeight, scale },
    };
  } catch (error) {
    if (error instanceof Error && ["IMAGE_FORMAT_UNSUPPORTED", "IMAGE_BYTES_EXCEEDED"].includes(error.message)) throw error;
    throw new Error("IMAGE_INVALID");
  }
}
function hash(bytes: Uint8Array): string { return createHash("sha256").update(bytes).digest("hex"); }
function hasPngAnimation(bytes: Buffer): boolean {
  for (let offset = 8; offset + 12 <= bytes.length; offset += bytes.readUInt32BE(offset) + 12) {
    if (bytes.toString("ascii", offset + 4, offset + 8) === "acTL") return true;
  }
  return false;
}
function hasWebpAnimation(bytes: Buffer): boolean {
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const kind = bytes.toString("ascii", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    if (kind === "ANIM" || kind === "ANMF" || (kind === "VP8X" && (bytes[offset + 8]! & 0x02) !== 0)) return true;
    offset += 8 + size + (size % 2);
  }
  return false;
}
// end
