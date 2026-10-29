// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import { canonicalServerHash, type ModelRoute } from "@kf/contracts";
import { createHash } from "node:crypto";
import { serializeJsonModelBody, type JsonModelRequest } from "../models/deepseek-transport.js";
import { validateModelRoute } from "../models/model-config.js";
import { PROMPT_VERSIONS, VISUAL_ANALYSIS_SYSTEM_PROMPT } from "../models/task-prompts.js";
import type { TrustedReferenceImage } from "./reference-asset.service.js";

export const VISUAL_ANALYSIS_VERSION = "visual-analysis@1";
// Also keep a persisted spec + PATCH envelope below Nest's existing 100KiB JSON parser limit.
export const VISUAL_RESPONSE_BYTES = 80 * 1024;
export function visualModelConfigHash(route: ModelRoute): string {
  return canonicalServerHash({ route, prompt: VISUAL_ANALYSIS_SYSTEM_PROMPT, promptVersion: PROMPT_VERSIONS.vision,
    schemaVersion: "visual-reference@1", maxOutputTokens: 8192, thinking: false, maxResponseBytes: VISUAL_RESPONSE_BYTES });
}
export function buildVisualAnalysisRequest(input: { tenantId: string; workspaceId: string; conversationId: string; runId: string;
  instruction: string; image: TrustedReferenceImage; route: ModelRoute }): JsonModelRequest {
  validateModelRoute(input.route, "vision");
  const { image } = input;
  if (image.tenantId !== input.tenantId || image.workspaceId !== input.workspaceId) throw new Error("REFERENCE_SCOPE_MISMATCH");
  if (Buffer.byteLength(input.instruction, "utf8") > 16 * 1024) throw new Error("VISUAL_TEXT_TOO_LARGE");
  if (image.bytes.byteLength === 0 || image.bytes.byteLength > 10 * 1024 * 1024) throw new Error("VISUAL_IMAGE_TOO_LARGE");
  if (createHash("sha256").update(image.bytes).digest("hex") !== image.derivativeHash) throw new Error("REFERENCE_INTEGRITY_FAILED");
  const prefixHash = canonicalServerHash({ prompt: VISUAL_ANALYSIS_SYSTEM_PROMPT, version: PROMPT_VERSIONS.vision });
  const request: JsonModelRequest = {
    route: structuredClone(input.route), thinking: false, maxOutputTokens: 8192, maxResponseBytes: VISUAL_RESPONSE_BYTES,
    scope: { tenantId: input.tenantId, workspaceId: input.workspaceId, conversationId: input.conversationId, runId: input.runId,
      task: "vision", provider: input.route.provider, requestedModel: input.route.model, promptVersion: PROMPT_VERSIONS.vision,
      schemaVersion: "visual-reference@1", prefixHash, attempt: 1,
      inputHash: canonicalServerHash({ sourceHash: image.sourceHash, derivativeHash: image.derivativeHash, instruction: input.instruction,
        assetId: image.assetId, modelConfigHash: visualModelConfigHash(input.route) }) },
    messages: [{ role: "system", content: VISUAL_ANALYSIS_SYSTEM_PROMPT }, { role: "user", content: [
      { type: "text", text: input.instruction },
      { type: "image_url", image_url: { url: `data:${image.mimeType};base64,${Buffer.from(image.bytes).toString("base64")}`, detail: "high" } },
    ] }],
  };
  if (Buffer.byteLength(serializeJsonModelBody(request), "utf8") > 16 * 1024 * 1024) throw new Error("VISUAL_REQUEST_TOO_LARGE");
  return request;
}
// end
