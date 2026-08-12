import { Module } from "@nestjs/common";
import { ARTIFACT_STORAGE, createArtifactStorage } from "./artifact-storage.js";
import { ArtifactController } from "./artifact.controller.js";
import { ArtifactService } from "./artifact.service.js";
import { DownloadTokenService } from "./download-token.service.js";
import { PreviewService } from "./preview.service.js";
import { DeliveryModule } from "../delivery/delivery.module.js";

@Module({
  imports: [DeliveryModule],
  controllers: [ArtifactController],
  providers: [
    ArtifactService,
    DownloadTokenService,
    PreviewService,
    { provide: ARTIFACT_STORAGE, useFactory: createArtifactStorage },
  ],
  exports: [ArtifactService, ARTIFACT_STORAGE, PreviewService],
})
export class ArtifactsModule {}
