import { Module } from "@nestjs/common";
import { PG_POOL, createPgPool } from "../conversations/checkpointer.js";
import {
  MODULE_ARTIFACT_AUTHORITY,
  SERVER_PLAN_AUTHORITY,
  createModuleArtifactAuthorityFromEnvironment,
  createServerPlanAuthorityFromEnvironment,
} from "../conversations/server-plan-authority.js";
import { DeliverySnapshotService } from "./delivery-snapshot.service.js";

/** 由会话路由与制品路由共用的持久化交付权限主体。 */
@Module({
  providers: [
    DeliverySnapshotService,
    { provide: PG_POOL, useFactory: createPgPool },
    { provide: SERVER_PLAN_AUTHORITY, useFactory: createServerPlanAuthorityFromEnvironment },
    { provide: MODULE_ARTIFACT_AUTHORITY, useFactory: createModuleArtifactAuthorityFromEnvironment },
  ],
  exports: [DeliverySnapshotService, PG_POOL, SERVER_PLAN_AUTHORITY, MODULE_ARTIFACT_AUTHORITY],
})
export class DeliveryModule {}
