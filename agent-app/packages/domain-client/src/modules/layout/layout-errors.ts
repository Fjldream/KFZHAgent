export type PageLayoutIssueCode = "LAYOUT_OVERFLOW" | "MODULE_TOO_SMALL" | "INVALID_REGION";

/** 一个确定的、可修复的布局失败。没有问题意味着发明了备用方案。 */
export interface PageLayoutIssue {
  readonly code: PageLayoutIssueCode;
  readonly moduleId: string;
}
