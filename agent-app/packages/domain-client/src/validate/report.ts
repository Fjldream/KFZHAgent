import type { CheckStatus, ValidationChecks, ValidationReport } from "@kf/contracts";

/**
 * 校验报告组装（简要步骤 6）。
 *
 * 每一层都会生成 `CheckOutcome`；`makeReport` 将六个结果折叠为 `@kf/contracts` 的 ValidationReport 结构：
 * - 只要任一必需检查失败，`status` 就为 “fail”；警告绝不会覆盖失败；
 * - 每个失败或警告检查都会把问题加入 `report.warnings`，使调用方始终能看到 pass/fail 背后可读的详细信息。
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
