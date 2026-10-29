// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import { Module } from "@nestjs/common";
import { ArtifactsModule } from "../artifacts/artifacts.module.js";
import { ReferenceAssetController } from "./reference-asset.controller.js";
import { ReferenceAssetService } from "./reference-asset.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { ModelGatewayService } from "../models/model-gateway.js";
import { ModelInvocationService } from "../models/model-invocation.service.js";
import { resolveModelRoutes } from "../models/model-config.js";
import { VisualAnalysisService } from "./visual-analysis.service.js";
import { VisualAnalysisController } from "./visual-analysis.controller.js";
// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
import { bindVisualAnalysisGateway } from "./visual-analysis-protocol.js";
// end
// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
import { VisualEgressPolicyController } from "./visual-egress-policy.controller.js";
import { VisualEgressPolicyService } from "./visual-egress-policy.service.js";
import { VisualRunAdmissionService } from "./visual-run-admission.js";
import { VISUAL_PLANNING_RUNTIME, createVisualPlanningRuntime } from "./visual-blueprint-runtime.js";
// end

@Module({
  // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
  imports: [ArtifactsModule], controllers: [ReferenceAssetController, VisualAnalysisController, VisualEgressPolicyController],
  providers: [ReferenceAssetService, VisualEgressPolicyService, {
    provide: VISUAL_PLANNING_RUNTIME, inject: [PrismaService],
    useFactory: (prisma: PrismaService) => createVisualPlanningRuntime(prisma, process.env),
  }, {
  // end
    provide: VisualAnalysisService, inject: [PrismaService, ReferenceAssetService],
    useFactory: (prisma: PrismaService, references: ReferenceAssetService) => {
      const key = process.env.DEEPSEEK_API_KEY?.trim() ?? "";
      const route = resolveModelRoutes(process.env).vision;
      // Budget enforcement is explicitly deferred; usage still goes through the shared gateway/ledger.
      // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
      const effectiveRoute = { ...route, supportsVision: route.supportsVision && key.length > 0 };
      const gateway = bindVisualAnalysisGateway(new ModelGatewayService(new ModelInvocationService(prisma), fetch, key), effectiveRoute);
      return new VisualAnalysisService(prisma, references, gateway, effectiveRoute);
      // end
    },
  // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
  }, {
    provide: VisualRunAdmissionService,
    useFactory: () => {
      const route = resolveModelRoutes(process.env).vision;
      return new VisualRunAdmissionService({ ...route, supportsVision: route.supportsVision && Boolean(process.env.DEEPSEEK_API_KEY?.trim()) });
    },
  }], exports: [ReferenceAssetService, VisualAnalysisService, VisualRunAdmissionService, VISUAL_PLANNING_RUNTIME],
  // end
})
export class ReferenceAssetsModule {}
// end
