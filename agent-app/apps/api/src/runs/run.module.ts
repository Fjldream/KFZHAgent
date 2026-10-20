// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { RunController } from "./run.controller.js";
import { PrismaRunQueries } from "./run-query.service.js";
import { RunService } from "./run.service.js";
import { PrismaRunStore, type RunStore } from "./run-store.js";

export const RUN_STORE = Symbol("RUN_STORE");

@Module({
  imports: [PrismaModule],
  controllers: [RunController],
  providers: [
    {
      // PrismaClient 是 type-only 参数，直接声明 provider 会让 Nest 注入 undefined。
      provide: PrismaRunQueries,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaRunQueries(prisma),
    },
    {
      provide: RUN_STORE,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService): RunStore =>
        new PrismaRunStore(prisma, Number(process.env.AGENT_RUN_LEASE_MS ?? 30_000)),
    },
    {
      provide: RunService,
      inject: [RUN_STORE, PrismaRunQueries],
      useFactory: (store: RunStore, queries: PrismaRunQueries) => new RunService(store, queries),
    },
  ],
  exports: [RunService, PrismaRunQueries],
})
export class RunsModule {}
// end
