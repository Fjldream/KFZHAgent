import pageSkeleton from "../templates/page-skeleton.json" with { type: "json" };
import type { PageIR } from "../ir/client-project-ir.js";
import type { TemplateJson } from "../templates/merge-template.js";
import { deriveGuid, type BuildSeed } from "./guid-factory.js";
import { compileControl, ModelOutputInvalidError, type CompileContext } from "./control-compiler.js";

/**
 * Per-page compilation (brief Step 5).
 *
 * Starts from the REVIEWED `page-skeleton.json` (deep-cloned), applies only
 * schema-approved overrides (guid, page name, page size, objects, prototype),
 * and produces both the page JSON and its pageManager entry.
 */

/** Fallback page size when the IR omits width/height (page-skeleton default). */
export const SKELETON_DEFAULT_WIDTH = 1280;
export const SKELETON_DEFAULT_HEIGHT = 720;

export interface CompiledPage {
  /** KF file name for the page under `project/page/` (e.g. `Page1.json`). */
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
