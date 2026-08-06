import { Injectable, NotFoundException } from "@nestjs/common";
import { renderClientProjectPreview } from "@kf/preview-renderer";
import { PrismaService } from "../prisma/prisma.service.js";

const PROJECT_IR_SCHEMA = "kf-client-project-ir/v1";

/**
 * Renders a built artifact's client project as a static HTML preview.
 *
 * Data-source chain: Artifact -> BuildJob -> the latest SolutionRevision for
 * (workspaceId + changePlanId). Tenant ownership is revalidated at every hop
 * (the same scoping DownloadTokenService uses), and only revisions whose
 * state is a `kf-client-project-ir/v1` document are renderable. Upload-mode
 * projects (source revisions with a summary state) are not previewable yet.
 */
@Injectable()
export class PreviewService {
  constructor(private readonly prisma: PrismaService) {}

  async render(tenantId: string, artifactId: string): Promise<string> {
    const artifact = await this.prisma.artifact.findFirst({
      where: { id: artifactId, tenantId },
    });
    if (artifact === null) {
      throw new NotFoundException("artifact not found");
    }
    const job = await this.prisma.buildJob.findFirst({
      where: { id: artifact.buildJobId, tenantId },
    });
    if (job === null) {
      throw new NotFoundException("build job not found");
    }
    const revision = await this.prisma.solutionRevision.findFirst({
      where: { workspaceId: job.workspaceId, changePlanId: job.changePlanId, tenantId },
      orderBy: { revisionNumber: "desc" },
    });
    const state = revision?.state;
    if (
      typeof state !== "object" ||
      state === null ||
      (state as Record<string, unknown>)["schema"] !== PROJECT_IR_SCHEMA
    ) {
      throw new NotFoundException(
        "no renderable project IR for this artifact (upload-mode projects are not previewable yet)",
      );
    }
    return renderClientProjectPreview(state as never);
  }
}
