import { Module } from "@nestjs/common";
import { ArtifactsModule } from "./artifacts/artifacts.module.js";
import { AssetsModule } from "./assets/assets.module.js";
import { AuditModule } from "./audit/audit.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { BuildJobsModule } from "./build-jobs/build-jobs.module.js";
import { ConversationsModule } from "./conversations/conversations.module.js";
import { RunsModule } from "./runs/run.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { RevisionsModule } from "./revisions/revisions.module.js";
import { TenantsModule } from "./tenants/tenants.module.js";
import { UsersModule } from "./users/users.module.js";
import { WorkspacesModule } from "./workspaces/workspaces.module.js";
// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import { ReferenceAssetsModule } from "./vision/reference-assets.module.js";
// end

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    AuditModule,
    UsersModule,
    TenantsModule,
    WorkspacesModule,
    RevisionsModule,
    ArtifactsModule,
    AssetsModule,
    // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
    ReferenceAssetsModule,
    // end
    BuildJobsModule,
    ConversationsModule,
    RunsModule,
  ],
})
export class AppModule {}
