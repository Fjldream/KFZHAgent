import "reflect-metadata";
import cookieParser from "cookie-parser";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";

/**
 * API 服务入口（Task 12 本地/E2E 运行用）。
 * 生产部署与 docker-compose 使用同一入口；端口由 PORT 环境变量控制。
 * CORS 仅对显式白名单的来源放行（凭据模式），用于 web 开发服务器。
 */
async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();

  const originList = (process.env.CORS_ORIGINS ?? "http://localhost:5173,http://localhost:4173")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  app.enableCors({ origin: originList, credentials: true });
  app.use(cookieParser());

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  console.log(`[api] KF Solution Agent API listening on http://localhost:${port}`);
}

void bootstrap().catch((error) => {
  console.error("[api] failed to start:", error);
  process.exit(1);
});
