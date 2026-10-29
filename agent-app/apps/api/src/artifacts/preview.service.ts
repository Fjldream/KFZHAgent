import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { mkdtemp } from "node:fs/promises";
import { importNativeClientPackage } from "@kf/domain-client";
import type { ArtifactStorage } from "@kf/artifact-storage";
import { renderKfProject } from "@kf/preview-renderer";
import { PrismaService } from "../prisma/prisma.service.js";
import { ARTIFACT_STORAGE } from "./artifact-storage.js";
import { DeliverySnapshotService } from "../delivery/delivery-snapshot.service.js";

/**
 * 渲染构建项目的客户端项目为静态的 HTML 预览。
 *
 * 数据源：该 artifact 自身 — 它是解包的，并且其 `project/page/*.json` 文件转换为 IR 形状（KF 自然页面 JSON -> IR 形状）并渲染为一个自包含的 HTML 页面。这覆盖了编译模式构建（仅携带计划/模式元数据，而不是编译的项目）。
 */
@Injectable()
export class PreviewService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ARTIFACT_STORAGE) private readonly storage: ArtifactStorage,
    private readonly deliverySnapshots: DeliverySnapshotService,
  ) {}

  async render(tenantId: string, artifactId: string): Promise<string> {
    // 路由参数是 DB Artifact.id；存储按 storageKey（工件唯一名）寻址。
    const row = await this.prisma.artifact.findFirst({
      where: { id: artifactId, tenantId },
    });
    if (row === null) throw new NotFoundException("artifact not found");
    await this.deliverySnapshots.assertArtifactDeliverable(tenantId, row.id);
    const stream = await this.storage.open(tenantId, row.storageKey).catch(() => {
      throw new NotFoundException("artifact not found");
    });
    const chunks: Buffer[] = [];
    for await (const chunk of stream as AsyncIterable<Buffer | string>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const bytes = Buffer.concat(chunks);
    const destDir = await mkdtemp(path.join(tmpdir(), "kf-preview-"));
    const rootDir = await importNativeClientPackage(bytes, destDir);

    // 扫描 <版本目录>/project/page/*.json（版本目录由解包器校验为唯一）。
    const pageFiles = await collectPageFiles(rootDir);
    if (pageFiles.length === 0) {
      throw new NotFoundException("no renderable pages found in this artifact");
    }
    const pages: unknown[] = [];
    for (const file of pageFiles) {
      pages.push(JSON.parse(await readFile(file, "utf8")));
    }
    return renderKfProject(path.basename(rootDir), pages);
  }
}

/** 在解包目录下定位「版本目录/project/page」下的 JSON 页面文件。 */
async function collectPageFiles(rootDir: string): Promise<string[]> {
  const versionEntries = await readdir(rootDir, { withFileTypes: true });
  const found: string[] = [];
  for (const entry of versionEntries) {
    if (!entry.isDirectory()) continue;
    const pageDir = path.join(rootDir, entry.name, "project", "page");
    try {
      const files = await readdir(pageDir);
      found.push(
        ...files
          .filter(
            (f) => f.endsWith(".json") && f !== "pageGroupManager.json" && f !== "pageManager.json",
          )
          .map((f) => path.join(pageDir, f)),
      );
    } catch {
      // 该版本目录无 page 目录，跳过
    }
  }
  return found;
}
