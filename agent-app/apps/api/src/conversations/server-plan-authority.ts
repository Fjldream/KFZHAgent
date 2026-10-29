import {
  createHmacServerPlanAuthority,
  createHmacModuleArtifactAuthority,
  decodeServerPlanHmacKey,
  type ServerPlanAuthority,
  type ModuleArtifactAuthority,
} from "@kf/build-jobs";
import type { CustomerEffectBlueprint } from "@kf/contracts";
import {
  createAcceptedBlueprintArtifactPayload,
  createDefaultModuleRegistry,
  type ModuleRegistry,
} from "@kf/domain-client";

export const SERVER_PLAN_AUTHORITY = Symbol("SERVER_PLAN_AUTHORITY");
export const MODULE_ARTIFACT_AUTHORITY = Symbol("MODULE_ARTIFACT_AUTHORITY");
export const SERVER_PLAN_HMAC_KEY_ENV = "KF_SERVER_PLAN_HMAC_KEY_BASE64";

export function createServerPlanAuthorityFromEnvironment(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): ServerPlanAuthority {
  return createHmacServerPlanAuthority(
    decodeServerPlanHmacKey(environment[SERVER_PLAN_HMAC_KEY_ENV]),
  );
}

export function createModuleArtifactAuthorityFromEnvironment(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): ModuleArtifactAuthority {
  return createHmacModuleArtifactAuthority(decodeServerPlanHmacKey(environment[SERVER_PLAN_HMAC_KEY_ENV]));
}

/** API确认边界：在签署之前，注册事实将模型的种类/类别/行动声明替换。 */
export function signAcceptedBlueprintAtConfirmation(input: {
  readonly authority: ModuleArtifactAuthority;
  readonly blueprint: CustomerEffectBlueprint;
  readonly projectKey: string;
  readonly revisionId: string;
  readonly registry?: ModuleRegistry;
}) {
  return input.authority.signAcceptedBlueprint(createAcceptedBlueprintArtifactPayload({
    blueprint: input.blueprint,
    projectKey: input.projectKey,
    revisionId: input.revisionId,
    registry: input.registry ?? createDefaultModuleRegistry(),
  }));
}
