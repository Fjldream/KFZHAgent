import { Global, Module } from "@nestjs/common";
import { AuditService } from "./audit.service.js";

// 全局，因此认证/tenants/workspaces/artifacts/conversations可以记录审计事件，而不会形成模块之间的导入循环。
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
