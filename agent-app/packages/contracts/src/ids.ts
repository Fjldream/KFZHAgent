export type SolutionId = string & { readonly __brand: "SolutionId" };

export function solutionId(value: string): SolutionId {
  if (value.trim().length === 0) throw new Error("solution id is required");
  return value as SolutionId;
}
