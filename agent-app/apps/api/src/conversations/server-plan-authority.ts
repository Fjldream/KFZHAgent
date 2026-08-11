import {
  createHmacServerPlanAuthority,
  decodeServerPlanHmacKey,
  type ServerPlanAuthority,
} from "@kf/build-jobs";

export const SERVER_PLAN_AUTHORITY = Symbol("SERVER_PLAN_AUTHORITY");
export const SERVER_PLAN_HMAC_KEY_ENV = "KF_SERVER_PLAN_HMAC_KEY_BASE64";

export function createServerPlanAuthorityFromEnvironment(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): ServerPlanAuthority {
  return createHmacServerPlanAuthority(
    decodeServerPlanHmacKey(environment[SERVER_PLAN_HMAC_KEY_ENV]),
  );
}
