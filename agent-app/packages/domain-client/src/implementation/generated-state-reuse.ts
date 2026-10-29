// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import { canonicalCreativeBuildArtifactHash, canonicalTrustedNativeMaterializationHash, canonicalServerHash,
  type ExistingGeneratedStateEvidence, type SolutionImplementationPlan, type TrustedNativeMaterialization } from "@kf/contracts";
import { readVerifiedCreativeMaterialization, type VerifiedCreativeMaterialization } from "@kf/build-jobs";
import { serverOwnedRuntimeIdentitySnapshot, type InspectResult } from "../inspect/client-inspector.js";
import { runtimeVariableName } from "./runtime-correlation.js";

type MaterializedState = NonNullable<TrustedNativeMaterialization["states"]>[number];
type ReusedState = { semanticStateId: string; variableName: string; existing: ExistingGeneratedStateEvidence };
declare const generatedStateReuseBrand: unique symbol;
export interface VerifiedGeneratedStateReuseHandle { readonly [generatedStateReuseBrand]: true }
const proofs = new WeakMap<object, Readonly<{ workspaceId: string; baseRevisionId: string; states: readonly ReusedState[] }>>();
const invalid = (): never => { throw new Error("CREATIVE_EXISTING_STATE_PROVENANCE_INVALID"); };

function matchingVariable(inspection: InspectResult, variableName: string) {
  const snapshot = serverOwnedRuntimeIdentitySnapshot(inspection);
  if (!snapshot) return invalid();
  const folded = variableName.toLowerCase();
  const matches = snapshot.variables.filter(variable => [variable.record["name"], variable.record["id"], variable.record["guid"]]
    .some(identity => typeof identity === "string" && identity.toLowerCase() === folded));
  if (matches.length !== 1 || matches[0]!.record["name"] !== variableName) return invalid();
  if (snapshot.variables.filter(variable => variable.file === matches[0]!.file && variable.record["id"] === matches[0]!.record["id"]).length !== 1) return invalid();
  return matches[0]!;
}
function assertKnownStateRecord(record: Readonly<Record<string, unknown>>, state: Pick<MaterializedState, "dataType" | "defaultValue" | "comment">): void {
  const basic = record["basicItem"];
  if (!Object.hasOwn(record, "defaultValue") || record["dataType"] !== state.dataType || canonicalServerHash(record["defaultValue"]) !== canonicalServerHash(state.defaultValue)
    || record["comment"] !== state.comment || record["isMap"] !== false || basic === null || typeof basic !== "object" || Array.isArray(basic)
    || !Object.hasOwn(basic, "defaultValue") || canonicalServerHash((basic as Record<string, unknown>)["defaultValue"]) !== canonicalServerHash(state.defaultValue)) return invalid();
}

/** Caller must first bind this old verified generation to the exact successful published base package. */
export function verifyGeneratedStateReuse(input: { workspaceId: string; baseRevisionId: string; inspection: InspectResult;
  previous: VerifiedCreativeMaterialization }): VerifiedGeneratedStateReuseHandle {
  const snapshot = serverOwnedRuntimeIdentitySnapshot(input.inspection);
  if (!snapshot || snapshot.runtimeBinding?.workspaceId !== input.workspaceId || snapshot.runtimeBinding.baseRevisionId !== input.baseRevisionId) return invalid();
  const previous = readVerifiedCreativeMaterialization(input.previous);
  if (previous.materialization.workspaceId !== input.workspaceId || previous.artifact.implementation.compatibility !== "native"
    || previous.artifact.compilerVersion !== "1.0.0" || previous.artifact.evidenceVersion !== "1.0.0") return invalid();
  const priorStates = new Map(previous.artifact.semanticPlan.localState.map(state => [state.id, state]));
  const correlations = new Map((previous.artifact.implementation.runtimeCorrelation?.states ?? []).map(state => [state.semanticStateId, state.variableName]));
  const states = (previous.materialization.states ?? []).map(state => {
    const semantic = priorStates.get(state.semanticStateId);
    if (!semantic || semantic.type !== state.stateType || correlations.get(state.semanticStateId) !== state.variableName
      || state.variableName !== runtimeVariableName(input.workspaceId, state.semanticStateId)) return invalid();
    const variable = matchingVariable(input.inspection, state.variableName);
    assertKnownStateRecord(variable.record, state);
    const nativeId = variable.record["id"];
    if (typeof nativeId !== "number" || !Number.isSafeInteger(nativeId) || nativeId < 1) return invalid();
    const existing: ExistingGeneratedStateEvidence = Object.freeze({ baseRevisionId: input.baseRevisionId, scope: "workspace-generated-local",
      nativeId, file: variable.file, recordHash: variable.recordHash,
      previousArtifactHash: canonicalCreativeBuildArtifactHash(previous.artifact), previousMaterializationHash: canonicalTrustedNativeMaterializationHash(previous.materialization),
      stateType: state.stateType, dataType: state.dataType, defaultValue: state.defaultValue, comment: state.comment,
      ...(semantic.mockDataId === undefined ? {} : { recordScope: Object.freeze({ mockDataId: semantic.mockDataId, keyField: semantic.keyField! }) }) });
    return Object.freeze({ semanticStateId: state.semanticStateId, variableName: state.variableName, existing });
  });
  if (states.length !== priorStates.size) return invalid();
  const handle = Object.freeze(Object.create(null)) as VerifiedGeneratedStateReuseHandle;
  proofs.set(handle, Object.freeze({ workspaceId: input.workspaceId, baseRevisionId: input.baseRevisionId, states: Object.freeze(states) }));
  return handle;
}

export function readVerifiedGeneratedStateReuse(handle: VerifiedGeneratedStateReuseHandle, workspaceId: string, baseRevisionId: string,
  plan: SolutionImplementationPlan): readonly ReusedState[] {
  const proof = handle !== null && typeof handle === "object" ? proofs.get(handle) : undefined;
  if (!proof || proof.workspaceId !== workspaceId || proof.baseRevisionId !== baseRevisionId) return invalid();
  for (const old of proof.states) {
    const next = plan.localState.find(state => state.id === old.semanticStateId);
    if (!next || next.type !== old.existing.stateType || next.mockDataId !== old.existing.recordScope?.mockDataId
      || next.keyField !== old.existing.recordScope?.keyField) return invalid();
  }
  return proof.states;
}

/** Worker independently checks the signed reuse projection against the actual inspected base. */
export function assertExistingGeneratedStateMatches(input: { workspaceId: string; baseRevisionId: string; inspection: InspectResult; state: MaterializedState }): void {
  const { state } = input; const evidence = state.existing;
  const snapshot = serverOwnedRuntimeIdentitySnapshot(input.inspection);
  if (!evidence || !snapshot || snapshot.runtimeBinding?.workspaceId !== input.workspaceId || snapshot.runtimeBinding.baseRevisionId !== input.baseRevisionId
    || evidence.baseRevisionId !== input.baseRevisionId || state.variableName !== runtimeVariableName(input.workspaceId, state.semanticStateId)
    || evidence.stateType !== state.stateType || evidence.dataType !== state.dataType) return invalid();
  const variable = matchingVariable(input.inspection, state.variableName);
  if (variable.file !== evidence.file || variable.record["id"] !== evidence.nativeId || variable.recordHash !== evidence.recordHash) return invalid();
  assertKnownStateRecord(variable.record, evidence);
}
// end
