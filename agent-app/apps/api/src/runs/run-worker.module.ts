// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { Module } from "@nestjs/common";
import { ArtifactsModule } from "../artifacts/artifacts.module.js";
import { AssetsModule } from "../assets/assets.module.js";
import { AuditModule } from "../audit/audit.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { ConversationsModule } from "../conversations/conversations.module.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { RevisionsModule } from "../revisions/revisions.module.js";
import { TenantsModule } from "../tenants/tenants.module.js";
import { UsersModule } from "../users/users.module.js";
import { WorkspacesModule } from "../workspaces/workspaces.module.js";

/**
 * worker 专用装配：复用 API 的业务模块，但**不导入 BuildJobsModule**，
 * 因此不会启动 build-job 轮询器；也不绑定任何 HTTP controller。
 * 依赖清单与 AppModule 保持一致，只去掉与 worker 职责无关的部分。
 */
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
    ConversationsModule,
  ],
})
export class AgentWorkerModule {}
// end
