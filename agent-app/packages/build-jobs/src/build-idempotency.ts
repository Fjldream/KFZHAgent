import type { BuildJob } from "@prisma/client";

export interface GraphBuildIdentity {
  conversationId: string;
  projectKey: string;
  domainKind: string;
  changePlanId: string;
  planHash: string;
}

export function graphBuildIdempotencyKey(identity: GraphBuildIdentity): string {
  const legacyDefaultProject = identity.domainKind === "kingclient" && identity.projectKey === "kingclient";
  return legacyDefaultProject
    ? `${identity.conversationId}:${identity.changePlanId}:${identity.planHash}`
    : `${identity.conversationId}:${identity.projectKey}:${identity.changePlanId}:${identity.planHash}`;
}

export function buildJobBelongsToConversation(job: BuildJob, conversationId: string): boolean {
  return job.idempotencyKey === graphBuildIdempotencyKey({
    conversationId,
    projectKey: job.projectKey,
    domainKind: job.domainKind,
    changePlanId: job.changePlanId,
    planHash: job.planHash,
  });
}
