// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import { Controller, ForbiddenException, Get, Param, PayloadTooLargeException, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { TenantGuard, type AuthenticatedRequest } from "../auth/tenant.guard.js";
import { MutationOriginGuard } from "../auth/mutation-origin.guard.js";
import { resolveWorkbenchConfig } from "../runs/feature-policy.js";
import { MAX_REFERENCE_BYTES } from "./image-policy.js";
import { ReferenceAssetService } from "./reference-asset.service.js";

@Controller("api/v2/workspaces/:workspaceId/reference-assets")
@UseGuards(TenantGuard)
export class ReferenceAssetController {
  constructor(private readonly references: ReferenceAssetService) {}

  @Post()
  @UseGuards(MutationOriginGuard)
  async upload(@Param("workspaceId") workspaceId: string, @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response, @Query("name") name?: string) {
    // Local storage admission is not permission to send an image to a model.
    if (process.env.AGENT_REFERENCE_UPLOADS_V1 !== "true" || !resolveWorkbenchConfig(req.principal.tenantId).flags.agentWorkbenchV2) {
      throw new ForbiddenException("REFERENCE_UPLOAD_NOT_ENABLED");
    }
    if (Number(req.headers["content-length"] ?? 0) > MAX_REFERENCE_BYTES) throw new PayloadTooLargeException("IMAGE_BYTES_EXCEEDED");
    const controller = new AbortController();
    const abort = () => controller.abort();
    const close = () => { if (!res.writableEnded) controller.abort(); };
    req.once("aborted", abort);
    res.once("close", close);
    try {
      return await this.references.upload({ tenantId: req.principal.tenantId, workspaceId, stream: req, signal: controller.signal,
        ...(name === undefined ? {} : { name }), ...(req.headers["content-type"] === undefined ? {} : { declaredMimeType: req.headers["content-type"] }) });
    } finally { req.off("aborted", abort); res.off("close", close); }
  }

  @Get(":assetId/image")
  async image(@Param("workspaceId") workspaceId: string, @Param("assetId") assetId: string,
    @Req() req: AuthenticatedRequest, @Res() res: Response): Promise<void> {
    const image = await this.references.resolve(req.principal.tenantId, workspaceId, assetId);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Vary", "Cookie");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.type(image.mimeType).send(Buffer.from(image.bytes));
  }
}
// end
