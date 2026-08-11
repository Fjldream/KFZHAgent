import { Module } from "@nestjs/common";
import { ArtifactsModule } from "../artifacts/artifacts.module.js";
import { AssetController } from "./asset.controller.js";
import { AssetService } from "./asset.service.js";

@Module({
  imports: [ArtifactsModule],
  controllers: [AssetController],
  providers: [AssetService],
  exports: [AssetService],
})
export class AssetsModule {}
