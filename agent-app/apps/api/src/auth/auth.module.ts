import { Global, Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module.js";
import { AuthController } from "./auth.controller.js";
import { PasswordService } from "./password.service.js";
import { RolesGuard } from "./roles.guard.js";
import { SessionService } from "./session.service.js";
import { TenantGuard } from "./tenant.guard.js";

// Global so that UsersService/TenantsService/controllers can inject the
// password service and guards without importing this module (avoids a module
// cycle with UsersModule, which AuthController depends on).
@Global()
@Module({
  imports: [UsersModule],
  controllers: [AuthController],
  providers: [PasswordService, SessionService, TenantGuard, RolesGuard],
  exports: [PasswordService, SessionService, TenantGuard, RolesGuard],
})
export class AuthModule {}
