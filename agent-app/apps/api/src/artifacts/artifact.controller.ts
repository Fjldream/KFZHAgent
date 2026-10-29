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
 * Artifact 下载流程。
 *
 * 步骤 6 的简短路径 `GET /api/artifacts/:id/download` 通过一个两步令牌流（一个故意的、文档化的偏离）替换：
 *
 *   POST /api/artifacts/:id/download-token -> 短期一次性令牌
 *   GET /api/artifacts/download/:token -> 重新验证所有绑定和
 *                                              活跃会话，并然后流式传输
 *                                              该文件的文件字节。
 *
 * 为什么偏离：直接 `GET /:id/download` 会将文件字节通过单个请求/响应，这将 URL 生命周期与文件生命周期耦合，并给长生命周期、可重播的下载链接。两步流将暴露限制为与调用者 userId + tenantId + artifactId（简短的单次使用下载令牌）绑定的 10 分钟一次性令牌。任务 12 的 web 客户端消费此协议。简短路径的直接路径被明确映射到 404，以确保它永远不会无害地解析到其他端点。
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
 * 原简短的直接下载路线。故意未实现:
 * 下载通过上述两步令牌流传递。这种明确的映射确保了 `GET /api/artifacts/:id/download` 返回一个明确的 404 错误，指向当前协议，而不是默默地匹配到其他地方。
 */
  @Get(":id/download")
  downloadDirect(@Param("id") _id: string): never {
    void _id;
    throw new NotFoundException(
      "direct artifact downloads are not supported; use POST /api/artifacts/:id/download-token then GET /api/artifacts/download/:token",
    );
  }

  /**
 * Artifact 客户端项目静态 HTML 预览（浏览器可视化预览）。租户所有权在每次数据源跳转（Artifact -> BuildJob -> SolutionRevision）时重新验证；没有渲染的 ClientProjectIR 状态的上传模式项目返回 404。
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
