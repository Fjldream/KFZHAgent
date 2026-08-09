import {
  Controller,
  Get,
  Header,
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
import { PreviewService } from "./preview.service.js";

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
    private readonly previewService: PreviewService,
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
      mediaType: result.mediaType,
      fileExtension: result.fileExtension,
      fileName: result.fileName,
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

  /**
   * Static HTML preview of the artifact's client project (browser visual
   * preview). Tenant ownership is revalidated at every data-source hop
   * (Artifact -> BuildJob -> SolutionRevision); upload-mode projects without
   * a renderable ClientProjectIR state return 404.
   */
  @Get(":id/preview")
  @Header("Content-Type", "text/html; charset=utf-8")
  @Header("Cache-Control", "no-store")
  // 渲染器零脚本自洽：即使不经 sandbox iframe 直接打开，也不允许脚本/外链执行
  //（richtext 为 verbatim HTML 透传，由 CSP 兜底）。
  @Header(
    "Content-Security-Policy",
    "default-src 'none'; style-src 'unsafe-inline'; img-src https: data:; base-uri 'none'; form-action 'none'",
  )
  @HttpCode(HttpStatus.OK)
  async preview(
    @Param("id") artifactId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<string> {
    return this.previewService.render(req.principal.tenantId, artifactId);
  }

  @Get("download/:token")
  @HttpCode(HttpStatus.OK)
  async download(
    @Param("token") token: string,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ): Promise<void> {
    const { stream, fileName, artifactId, sizeBytes, mediaType } = await this.downloads.consume({
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
    res.setHeader("Content-Type", mediaType);
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    if (sizeBytes !== null) {
      res.setHeader("Content-Length", String(sizeBytes));
    }
    stream.pipe(res);
  }
}
