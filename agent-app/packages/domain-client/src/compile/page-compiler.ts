import pageSkeleton from "../templates/page-skeleton.json" with { type: "json" };
import type { PageIR } from "../ir/client-project-ir.js";
import type { TemplateJson } from "../templates/merge-template.js";
import { deriveGuid, type BuildSeed } from "./guid-factory.js";
import { compileControl, ModelOutputInvalidError, type CompileContext } from "./control-compiler.js";

/**
 * 逐页面编译（简要步骤 5）。
 *
 * 从已审查的 `page-skeleton.json` 开始（深拷贝），只应用 schema 批准的覆盖项（guid、页面名称、页面尺寸、objects、prototype），并同时生成页面 JSON 和对应的 pageManager 条目。
 */

/** 当IR不提供宽度/高度时，页面大小的备用页面大小。 */
export const SKELETON_DEFAULT_WIDTH = 1280;
export const SKELETON_DEFAULT_HEIGHT = 720;

export interface CompiledPage {
  /** 项目中`project/page/`下的页面文件名（例如，`Page1.json`）。 */
  fileName: string;
  pageGuid: string;
  width: number;
  height: number;
  json: TemplateJson;
  managerEntry: TemplateJson;
}

const UNSAFE_FILE_NAME_RE = /[\\/]/;

export function compilePage(
  build: BuildSeed,
  page: PageIR,
  ctx: CompileContext,
): CompiledPage {
  if (page.name === "" || UNSAFE_FILE_NAME_RE.test(page.name) || page.name.includes("\0")) {
    throw new ModelOutputInvalidError(
      `unsafe page name ${JSON.stringify(page.name)} (must be non-empty and contain no path separators)`,
    );
  }
  const pageGuid = "k" + deriveGuid(build, page.name);
  const width = page.width ?? SKELETON_DEFAULT_WIDTH;
  const height = page.height ?? SKELETON_DEFAULT_HEIGHT;

  const json: TemplateJson = structuredClone(pageSkeleton);
  json["guid"] = pageGuid;
  // KF 页面 JSON 顶层需要 pageViewWidth/pageViewHeight（KF 客户端打开页面时读取）。
  json["pageViewWidth"] = width;
  json["pageViewHeight"] = height;
  const pageProperty = json["pageProperty"] as Record<string, unknown>;
  pageProperty["name"] = page.name;
  pageProperty["pageSize"] = { width, height };
  pageProperty["windowSize"] = { width, height };
  json["objects"] = page.controls.map((control) => compileControl(build, control, ctx));
  json["pagePrototype"] = {
    name: page.name,
    guid: pageGuid,
    version: json["version"],
    type: json["objectType"],
  };

  const managerEntry: TemplateJson = {
    name: page.name,
    description: "",
    height,
    width,
    positionX: 0,
    positionY: 0,
    pageType: 0,
    state: true,
    resolution: `${width} * ${height}`,
    id: pageGuid,
    groupId: ctx.pageGroupGuid,
    security: "",
    createtime: "",
    priority: "",
    securitySection: "",
    user: "admin",
    resourceGroup: "",
    resourceGroupMsg: "",
  };

  return { fileName: `${page.name}.json`, pageGuid, width, height, json, managerEntry };
}
