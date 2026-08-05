import { Module } from "@nestjs/common";
import { ArtifactsModule } from "../artifacts/artifacts.module.js";
import { BuildJobController } from "./build-job.controller.js";
import { BuildJobService } from "./build-job.service.js";

@Module({
  imports: [ArtifactsModule],
  controllers: [BuildJobController],
  providers: [BuildJobService],
  exports: [BuildJobService],
})
export class BuildJobsModule {}
