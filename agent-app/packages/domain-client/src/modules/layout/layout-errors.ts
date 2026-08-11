export type PageLayoutIssueCode = "LAYOUT_OVERFLOW" | "MODULE_TOO_SMALL" | "INVALID_REGION";

/** A deterministic, repairable layout failure. No issue implies an invented fallback. */
export interface PageLayoutIssue {
  readonly code: PageLayoutIssueCode;
  readonly moduleId: string;
}
