// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
export const MAX_REFERENCE_BYTES = 10 * 1024 * 1024;
export const MAX_REFERENCE_PIXELS = 32_000_000;
export const MAX_REFERENCE_EDGE = 8192;
export const DERIVATIVE_EDGE = 2048;
export type ReferenceImageFacts = {
  mimeType: string; byteSize: number; width: number; height: number; animated: boolean;
};
export function validateReferenceImage(facts: ReferenceImageFacts): void {
  if (!["image/png", "image/jpeg", "image/webp"].includes(facts.mimeType) || facts.animated) {
    throw new Error("IMAGE_FORMAT_UNSUPPORTED");
  }
  if (!Number.isSafeInteger(facts.byteSize) || facts.byteSize <= 0 || facts.byteSize > MAX_REFERENCE_BYTES) {
    throw new Error("IMAGE_BYTES_EXCEEDED");
  }
  if (!Number.isSafeInteger(facts.width) || !Number.isSafeInteger(facts.height) || facts.width <= 0 || facts.height <= 0 ||
    Math.max(facts.width, facts.height) > MAX_REFERENCE_EDGE || facts.width * facts.height > MAX_REFERENCE_PIXELS) {
    throw new Error("IMAGE_DIMENSIONS_EXCEEDED");
  }
}
// end
