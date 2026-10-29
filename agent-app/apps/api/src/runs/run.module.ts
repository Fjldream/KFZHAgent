// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { RunController } from "./run.controller.js";
// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import { WorkbenchConfigController } from "./workbench-config.controller.js";
import { RunEventStreamService } from "./run-event-stream.service.js";
import { SessionService } from "../auth/session.service.js";
// end
import { PrismaRunQueries } from "./run-query.service.js";
import { RunService } from "./run.service.js";
import { RunControlService } from "./run-control.service.js";
import { PrismaRunStore, type RunStore } from "./run-store.js";
// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
import { ReferenceAssetsModule } from "../vision/reference-assets.module.js";
import { VisualRunAdmissionService } from "../vision/visual-run-admission.js";
import { resolveWorkbenchConfig } from "./feature-policy.js";
import { VISUAL_PLANNING_RUNTIME, type VisualPlanningRuntime } from "../vision/visual-blueprint-runtime.js";
// end

export const RUN_STORE = Symbol("RUN_STORE");

@Module({
  // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
  imports: [PrismaModule, ReferenceAssetsModule],
  // end
  // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
  controllers: [RunController, WorkbenchConfigController],
  // end
  providers: [
    // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
    {
      provide: RunEventStreamService,
      inject: [RunService, PrismaRunQueries, SessionService],
      useFactory: (runs: RunService, queries: PrismaRunQueries, sessions: SessionService) => new RunEventStreamService(runs, queries, sessions),
    },
    // end
    {
      provide: RunControlService,
      inject: [PrismaService, RUN_STORE, PrismaRunQueries],
      useFactory: (prisma: PrismaService, store: RunStore, queries: PrismaRunQueries) => new RunControlService(prisma, store, queries),
    },
    {
      // PrismaClient 是 type-only 参数，直接声明 provider 会让 Nest 注入 undefined。
      provide: PrismaRunQueries,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new PrismaRunQueries(prisma),
    },
    {
      provide: RUN_STORE,
      // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
      inject: [PrismaService, VisualRunAdmissionService, VISUAL_PLANNING_RUNTIME],
      useFactory: (prisma: PrismaService, admission: VisualRunAdmissionService, visual: VisualPlanningRuntime): RunStore =>
        new PrismaRunStore(prisma, Number(process.env.AGENT_RUN_LEASE_MS ?? 30_000), resolveWorkbenchConfig, admission,
          // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
          visual.blueprints && visual.reviews ? visual.reviews : undefined,
          visual.blueprints && visual.semantics && visual.reviews ? visual.reviews : undefined),
          // end
      // end
    },
    {
      provide: RunService,
      // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
      inject: [RUN_STORE, PrismaRunQueries, VISUAL_PLANNING_RUNTIME],
      useFactory: (store: RunStore, queries: PrismaRunQueries, visual: VisualPlanningRuntime) => new RunService(store, queries, visual.reviews ?? undefined),
      // end
    },
  ],
  exports: [RunService, PrismaRunQueries],
})
export class RunsModule {}
// end
