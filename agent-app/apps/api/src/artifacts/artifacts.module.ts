import { Module } from "@nestjs/common";
import { ARTIFACT_STORAGE, createArtifactStorage } from "./artifact-storage.js";
import { ArtifactController } from "./artifact.controller.js";
import { ArtifactService } from "./artifact.service.js";
import { DownloadTokenService } from "./download-token.service.js";

@Module({
  controllers: [ArtifactController],
  providers: [
    ArtifactService,
    DownloadTokenService,
    { provide: ARTIFACT_STORAGE, useFactory: createArtifactStorage },
  ],
  exports: [ArtifactService, ARTIFACT_STORAGE],
})
export class ArtifactsModule {}
