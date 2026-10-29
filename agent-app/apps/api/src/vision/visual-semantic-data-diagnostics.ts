// modified by jinlong.feng at 2026-10-26 Agent工作台迭代
import { assertVisualSemanticGraphPayloadDepth, canonicalServerHash, MockDataSetSchema } from "@kf/contracts";
import type { SemanticOutputIssue } from "./visual-semantic-output.js";

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

/** Feedback only. The original schema and full native preflight remain the authority. */
export function inspectVisualSemanticMockValues(raw: unknown): SemanticOutputIssue[] {
  try {
    if (Buffer.byteLength(JSON.stringify(raw), "utf8") > 65536) return [];
    assertVisualSemanticGraphPayloadDepth(raw);
    if (!record(raw) || !record(raw.plan) || !Array.isArray(raw.plan.mockData) || raw.plan.mockData.length > 32) return [];
    const issues: SemanticOutputIssue[] = [];
    for (const [dataSetIndex, dataSet] of raw.plan.mockData.entries()) {
      const parsed = MockDataSetSchema.safeParse(dataSet);
      if (parsed.success || !record(dataSet) || !Array.isArray(dataSet.records)) continue;
      for (const issue of parsed.error.issues) {
        if (issue.code !== "custom" || issue.message !== "technical placeholder mock content is not allowed" || issue.path.length !== 5) continue;
        const [records, recordIndex, values, valueIndex, valueName] = issue.path;
        if (records !== "records" || values !== "values" || valueName !== "value"
          || typeof recordIndex !== "number" || typeof valueIndex !== "number") continue;
        const row: unknown = dataSet.records[recordIndex];
        const entry: unknown = record(row) && Array.isArray(row.values) ? row.values[valueIndex] : null;
        if (!record(entry) || typeof entry.value !== "string") continue;
        issues.push({ code: "SEMANTIC_MOCK_VALUE_INVALID", path: `plan.mockData.${dataSetIndex}.records.${recordIndex}.values.${valueIndex}.value`,
          rule: "technical-placeholder", rejectedValueHash: canonicalServerHash(entry.value),
          detail: "The exact value at this failedDraft path is invalid, including symbolic row keys. Use business content or explicitly remove only an unused data set and its unused dependencies; do not resend the same value. No value is supplied by the server." });
        if (issues.length === 4) return issues;
      }
    }
    return issues;
  } catch { return []; }
}
// end
