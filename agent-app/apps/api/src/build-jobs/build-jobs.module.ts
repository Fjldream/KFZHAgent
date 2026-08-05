import { Module } from "@nestjs/common";
import { BuildJobService } from "./build-job.service.js";

@Module({
  providers: [BuildJobService],
  exports: [BuildJobService],
})
export class BuildJobsModule {}
