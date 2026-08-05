import { Module } from "@nestjs/common";
import { WorkspacesController } from "./workspaces.controller.js";
import { WorkspaceService } from "./workspace.service.js";
import { ArtifactsModule } from "../artifacts/artifacts.module.js";

@Module({
  imports: [ArtifactsModule],
  controllers: [WorkspacesController],
  providers: [WorkspaceService],
  exports: [WorkspaceService],
})
export class WorkspacesModule {}
