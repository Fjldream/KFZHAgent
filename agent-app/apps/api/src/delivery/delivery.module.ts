import { Module } from "@nestjs/common";
import { PG_POOL, createPgPool } from "../conversations/checkpointer.js";
import {
  CREATIVE_BUILD_FACADE,
  MODULE_ARTIFACT_AUTHORITY,
  SERVER_PLAN_AUTHORITY,
  createCreativeBuildFacadeFromEnvironment,
  createModuleArtifactAuthorityFromEnvironment,
} from "../conversations/server-plan-authority.js";
import type { ServerCreativeBuildFacade } from "@kf/build-jobs";
import type { CreativeUIImplementationV2CompilerBundle } from "@kf/domain-client";
import { DeliverySnapshotService } from "./delivery-snapshot.service.js";

/** Shared persisted delivery authority used by conversations and artifact routes. */
@Module({
  providers: [
    DeliverySnapshotService,
    { provide: PG_POOL, useFactory: createPgPool },
    { provide: CREATIVE_BUILD_FACADE, useFactory: createCreativeBuildFacadeFromEnvironment },
    {
      provide: SERVER_PLAN_AUTHORITY,
      inject: [CREATIVE_BUILD_FACADE],
      useFactory: (facade: ServerCreativeBuildFacade<CreativeUIImplementationV2CompilerBundle>) => facade.authority,
    },
    { provide: MODULE_ARTIFACT_AUTHORITY, useFactory: createModuleArtifactAuthorityFromEnvironment },
  ],
  exports: [DeliverySnapshotService, PG_POOL, SERVER_PLAN_AUTHORITY, MODULE_ARTIFACT_AUTHORITY, CREATIVE_BUILD_FACADE],
})
export class DeliveryModule {}
