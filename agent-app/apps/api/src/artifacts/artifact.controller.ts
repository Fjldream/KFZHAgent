import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { AUDIT_ACTIONS, AuditService } from "../audit/audit.service.js";
import { TenantGuard, type AuthenticatedRequest } from "../auth/tenant.guard.js";
import { DownloadTokenService } from "./download-token.service.js";

/**
 * Artifact download flow (brief Step 6):
 *   POST /api/artifacts/:id/download-token  -> short-lived single-use token
 *   GET  /api/artifacts/download/:token     -> revalidates all bindings and
 *                                              the active session, then streams
 *                                              the artifact bytes.
 */
@Controller("api/artifacts")
@UseGuards(TenantGuard)
export class ArtifactController {
  constructor(
    private readonly downloads: DownloadTokenService,
    private readonly audit: AuditService,
  ) {}

  @Post(":id/download-token")
  @HttpCode(HttpStatus.OK)
  async createDownloadToken(
    @Param("id") artifactId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<Record<string, unknown>> {
    const result = await this.downloads.createToken({
      tenantId: req.principal.tenantId,
      userId: req.principal.userId,
      artifactId,
    });
    return {
      token: result.token,
      expiresAt: result.expiresAt.toISOString(),
      artifactId: result.artifactId,
    };
  }

  @Get("download/:token")
  @HttpCode(HttpStatus.OK)
  async download(
    @Param("token") token: string,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ): Promise<void> {
    const { stream, fileName, artifactId, sizeBytes } = await this.downloads.consume({
      token,
      tenantId: req.principal.tenantId,
      userId: req.principal.userId,
    });
    await this.audit.record({
      tenantId: req.principal.tenantId,
      actorUserId: req.principal.userId,
      action: AUDIT_ACTIONS.DOWNLOAD,
      resourceType: "ARTIFACT",
      resourceId: artifactId,
      detail: { fileName },
    });
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    if (sizeBytes !== null) {
      res.setHeader("Content-Length", String(sizeBytes));
    }
    stream.pipe(res);
  }
}
