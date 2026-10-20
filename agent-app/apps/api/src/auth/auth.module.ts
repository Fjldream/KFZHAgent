import { Global, Module } from "@nestjs/common";
import { UsersModule } from "../users/users.module.js";
import { AuthController } from "./auth.controller.js";
import { PasswordService } from "./password.service.js";
import { RolesGuard } from "./roles.guard.js";
import { SessionService } from "./session.service.js";
import { TenantGuard } from "./tenant.guard.js";

// 全局作用域，使 `UsersService` 和 `TenantsService` 控制器可以注入密码服务和守卫，而不必导入此模块（避免与 `UsersModule` 之间的模块循环，后者 `AuthController` 取决于）。
@Global()
@Module({
  imports: [UsersModule],
  controllers: [AuthController],
  providers: [PasswordService, SessionService, TenantGuard, RolesGuard],
  exports: [PasswordService, SessionService, TenantGuard, RolesGuard],
})
export class AuthModule {}
