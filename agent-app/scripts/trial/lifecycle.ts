// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
export interface TrialDatabaseClaim {
  exists(): Promise<boolean>;
  create(): Promise<void>;
  recordMarker(): Promise<void>;
  verifyMarker(): Promise<void>;
  persistConfig(): Promise<void>;
}
export async function claimTrialDatabase(claim: TrialDatabaseClaim, resuming: boolean): Promise<void> {
  if (resuming) { if (!await claim.exists()) throw new Error("TRIAL_OWNED_DATABASE_MISSING"); await claim.verifyMarker(); return; }
  if (await claim.exists()) throw new Error("TRIAL_DATABASE_ALREADY_EXISTS_WITHOUT_OWNERSHIP");
  await claim.create();
  await claim.recordMarker();
  await claim.persistConfig();
}
export function supervisorExitCode(stopping: boolean, currentCode: number | undefined): number {
  return stopping ? currentCode ?? 0 : 1;
}
// end
