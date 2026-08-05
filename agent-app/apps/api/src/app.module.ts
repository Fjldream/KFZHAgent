import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { TenantsModule } from "./tenants/tenants.module.js";
import { UsersModule } from "./users/users.module.js";
import { WorkspacesModule } from "./workspaces/workspaces.module.js";
import { RevisionsModule } from "./revisions/revisions.module.js";
import { ArtifactsModule } from "./artifacts/artifacts.module.js";
import { BuildJobsModule } from "./build-jobs/build-jobs.module.js";

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UsersModule,
    TenantsModule,
    WorkspacesModule,
    RevisionsModule,
    ArtifactsModule,
    BuildJobsModule,
  ],
})
export class AppModule {}
