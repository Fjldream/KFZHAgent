import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { TenantGuard, type AuthenticatedRequest } from "../auth/tenant.guard.js";
import { AssetService, type WorkspaceAssetCatalogItem } from "./asset.service.js";

@Controller("api/workspaces/:workspaceId/assets")
@UseGuards(TenantGuard)
export class AssetController {
  constructor(private readonly assets: AssetService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async upload(
    @Param("workspaceId") workspaceId: string,
    @Req() req: AuthenticatedRequest,
    @Query("name") name?: string,
  ): Promise<WorkspaceAssetCatalogItem> {
    const declaredMediaType = req.headers["content-type"];
    return this.assets.upload({
      tenantId: req.principal.tenantId,
      workspaceId,
      stream: req,
      ...(name !== undefined ? { name } : {}),
      ...(typeof declaredMediaType === "string" ? { declaredMediaType } : {}),
    });
  }

  @Get()
  async list(
    @Param("workspaceId") workspaceId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<WorkspaceAssetCatalogItem[]> {
    return this.assets.list({ tenantId: req.principal.tenantId, workspaceId });
  }
}
