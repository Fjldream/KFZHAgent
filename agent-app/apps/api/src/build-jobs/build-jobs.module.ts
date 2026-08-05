import { Module } from "@nestjs/common";
import { BuildJobController } from "./build-job.controller.js";
import { BuildJobService } from "./build-job.service.js";

@Module({
  controllers: [BuildJobController],
  providers: [BuildJobService],
  exports: [BuildJobService],
})
export class BuildJobsModule {}
