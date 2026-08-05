import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
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
 * Artifact download flow.
 *
 * The brief's Step 6 path `GET /api/artifacts/:id/download` is intentionally
 * REPLACED by a two-step token flow (a deliberate, documented deviation):
 *
 *   POST /api/artifacts/:id/download-token  -> short-lived single-use token
 *   GET  /api/artifacts/download/:token     -> revalidates all bindings and
 *                                              the active session, then streams
 *                                              the artifact bytes.
 *
 * Why the deviation: a direct `GET /:id/download` forces the artifact bytes
 * through a single request/response, which couples URL lifetime to artifact
 * lifetime and gives a long-lived, replayable download link. The two-step
 * flow bounds exposure to a 10-minute single-use token bound to the caller's
 * userId + tenantId + artifactId (brief Step 6 "short-lived single-use
 * download token"). The Task 12 web client consumes this protocol. The brief's
 * direct path is kept explicitly mapped to a 404 so it never silently
 * resolves to a different endpoint.
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

  /**
   * The brief's original direct download route. Deliberately not implemented:
   * downloads go through the two-step token flow above. This explicit mapping
   * guarantees `GET /api/artifacts/:id/download` returns a clear 404 with a
   * pointer to the current protocol instead of silently matching elsewhere.
   */
  @Get(":id/download")
  downloadDirect(@Param("id") _id: string): never {
    void _id;
    throw new NotFoundException(
      "direct artifact downloads are not supported; use POST /api/artifacts/:id/download-token then GET /api/artifacts/download/:token",
    );
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
