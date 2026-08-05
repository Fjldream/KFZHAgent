import { Module } from "@nestjs/common";
import { ARTIFACT_STORAGE, createArtifactStorage } from "./artifact-storage.js";
import { ArtifactService } from "./artifact.service.js";

@Module({
  providers: [
    ArtifactService,
    { provide: ARTIFACT_STORAGE, useFactory: createArtifactStorage },
  ],
  exports: [ArtifactService, ARTIFACT_STORAGE],
})
export class ArtifactsModule {}
