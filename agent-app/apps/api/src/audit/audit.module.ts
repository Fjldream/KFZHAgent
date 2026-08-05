import { Global, Module } from "@nestjs/common";
import { AuditService } from "./audit.service.js";

// Global so auth/tenants/workspaces/artifacts/conversations can record audit
// events without forming import cycles between modules.
@Global()
@Module({
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
