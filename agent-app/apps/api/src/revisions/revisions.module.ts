import { Module } from "@nestjs/common";
import { RevisionService } from "./revision.service.js";

@Module({
  providers: [RevisionService],
  exports: [RevisionService],
})
export class RevisionsModule {}
