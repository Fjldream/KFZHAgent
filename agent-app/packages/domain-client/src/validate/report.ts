import type { CheckStatus, ValidationChecks, ValidationReport } from "@kf/contracts";

/**
 * Validation report assembly (brief Step 6).
 *
 * Every layer produces a `CheckOutcome`; `makeReport` folds the six outcomes
 * into the `@kf/contracts` ValidationReport shape:
 * - `status` is "fail" whenever ANY required check fails — warnings never
 *   override failures,
 * - each failed/warned check contributes its issues to `report.warnings` so a
 *   caller always has the human-readable detail behind a pass/fail.
 */

export interface CheckOutcome {
  status: CheckStatus;
  issues: string[];
}

export type CheckKey = keyof ValidationChecks;

export function pass(issues: string[] = []): CheckOutcome {
  return { status: "pass", issues };
}

export function warn(issues: string[]): CheckOutcome {
  return { status: "warn", issues };
}

export function fail(issues: string[]): CheckOutcome {
  return { status: "fail", issues };
}

export const CHECK_KEYS: CheckKey[] = [
  "packageStructure",
  "jsonSchema",
  "references",
  "businessRules",
  "changeScope",
  "roundTrip",
];

export function makeReport(
  outcomes: Record<CheckKey, CheckOutcome>,
  extraWarnings: string[] = [],
): ValidationReport {
  const checks = {} as ValidationChecks;
  const warnings = [...extraWarnings];
  for (const key of CHECK_KEYS) {
    const outcome = outcomes[key];
    checks[key] = outcome.status;
    if (outcome.status === "fail") {
      warnings.push(`[${key}] ${outcome.issues.join("; ")}`);
    } else if (outcome.status === "warn" && outcome.issues.length > 0) {
      warnings.push(...outcome.issues.map((issue) => `[${key}] ${issue}`));
    }
  }
  const failed = CHECK_KEYS.some((key) => checks[key] === "fail");
  return {
    status: failed ? "fail" : "pass",
    checks,
    warnings,
  };
}
