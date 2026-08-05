/**
 * 只读 SDB 语料盘点：只统计结构（相对路径、扩展名、大小、JSON 字段路径、推断类型），
 * 绝不返回字段值，绝不写入原始语料。
 *
 * 安全约束：
 *  - 每个条目先 lstat 拒绝 symlink；
 *  - realpath 校验真实路径必须落在 root 内，否则跳过（计入 rejected 计数）；
 *  - 单个条目异常只跳过该项，不中断整个扫描。
 */

import { readdir, lstat, realpath, readFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { collectJsonShape, type PrimitiveType } from "./json-shape.ts";

export interface FileSummary {
  /** 相对 root 的路径，正斜杠分隔 */
  path: string;
  /** 小写扩展名（含点）；无扩展名为空串 */
  extension: string;
  /** 文件字节大小 */
  size: number;
}

export interface JsonFieldSummary {
  /** 点分 JSON 字段路径 */
  path: string;
  /** 推断的原始类型 */
  type: PrimitiveType;
}

export interface ModuleCount {
  /** 模块目录名（工程目录的直接父目录名） */
  module: string;
  /** 该模块下的工程数 */
  projectCount: number;
}

export interface CorpusInventory {
  /** 规范化后的 root 绝对路径 */
  root: string;
  /** 工程总数（含 project.json 且父目录不是工程的目录） */
  projectCount: number;
  /** 按模块分组的工程数（按模块名字母序） */
  modules: ModuleCount[];
  /** 所有文件的结构摘要（不含字段值） */
  files: FileSummary[];
  /** 所有 JSON 字段路径与推断类型（全局去重，按路径排序） */
  jsonFields: JsonFieldSummary[];
  /** 因各类原因被跳过的条目总数 */
  skipped: number;
  /** 被拒绝的 symlink 数 */
  symlinksRejected: number;
  /** 因真实路径在 root 外被拒绝的条目数 */
  outsideRootRejected: number;
  /** 读取或解析失败的 JSON 文件数 */
  unreadableJson: number;
}

interface WalkState {
  files: FileSummary[];
  jsonFieldKeys: Set<string>;
  projectDirs: string[];
  skipped: number;
  symlinksRejected: number;
  outsideRootRejected: number;
  unreadableJson: number;
}

async function recordJsonShape(
  absPath: string,
  fieldKeys: Set<string>,
  state: WalkState,
): Promise<void> {
  let text: string;
  try {
    text = await readFile(absPath, "utf8");
  } catch {
    state.unreadableJson += 1;
    return;
  }
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    state.unreadableJson += 1;
    return;
  }
  for (const field of collectJsonShape(value)) {
    fieldKeys.add(`${field.path}:${field.type}`);
  }
}

async function walk(absDir: string, relDir: string, rootReal: string, state: WalkState): Promise<void> {
  let entries: string[];
  try {
    entries = await readdir(absDir);
  } catch {
    state.skipped += 1;
    return;
  }
  for (const name of entries) {
    const childAbs = join(absDir, name);
    const childRel = relDir === "" ? name : `${relDir}/${name}`;

    let st;
    try {
      st = await lstat(childAbs);
    } catch {
      state.skipped += 1;
      continue;
    }

    if (st.isSymbolicLink()) {
      state.symlinksRejected += 1;
      state.skipped += 1;
      continue;
    }

    let childReal: string;
    try {
      childReal = await realpath(childAbs);
    } catch {
      state.skipped += 1;
      continue;
    }
    if (childReal !== rootReal && !childReal.startsWith(`${rootReal}${sep}`)) {
      state.outsideRootRejected += 1;
      state.skipped += 1;
      continue;
    }

    if (st.isDirectory()) {
      await walk(childAbs, childRel, rootReal, state);
    } else if (st.isFile()) {
      state.files.push({
        path: childRel,
        extension: extname(childAbs).toLowerCase(),
        size: st.size,
      });
      if (name === "project.json") {
        // 含 project.json 的目录即工程候选目录
        state.projectDirs.push(absDir);
      }
      if (extname(childAbs).toLowerCase() === ".json") {
        await recordJsonShape(childAbs, state.jsonFieldKeys, state);
      }
    } else {
      // 设备/fifo/socket 等非常规条目一律跳过
      state.skipped += 1;
    }
  }
}

/**
 * 只读盘点一个工程语料根。返回结构统计，绝不包含字段值。
 */
export async function inventory(root: string): Promise<CorpusInventory> {
  const rootAbs = resolve(root);
  let rootReal: string;
  try {
    rootReal = await realpath(rootAbs);
  } catch {
    throw new Error(`inventory root does not exist: ${rootAbs}`);
  }

  const state: WalkState = {
    files: [],
    jsonFieldKeys: new Set<string>(),
    projectDirs: [],
    skipped: 0,
    symlinksRejected: 0,
    outsideRootRejected: 0,
    unreadableJson: 0,
  };

  await walk(rootAbs, "", rootReal, state);

  // 工程 = 直接含 project.json 的目录，且其父链上不存在其他含 project.json 的目录
  // （避免 project/Common 这类嵌套 project.json 被误计为独立工程）。
  const projectSet = new Set(state.projectDirs);
  const hasProjectAncestor = (dir: string): boolean => {
    let cursor = dirname(dir);
    while (cursor !== dirname(cursor)) {
      if (projectSet.has(cursor)) {
        return true;
      }
      cursor = dirname(cursor);
    }
    return projectSet.has(cursor);
  };
  const projects = state.projectDirs.filter((dir) => !hasProjectAncestor(dir));

  const modules = new Map<string, number>();
  for (const projectDir of projects) {
    const moduleName = projectDir === rootReal ? basename(projectDir) : basename(dirname(projectDir));
    modules.set(moduleName, (modules.get(moduleName) ?? 0) + 1);
  }

  const jsonFields = [...state.jsonFieldKeys]
    .map((entry) => {
      const colon = entry.lastIndexOf(":");
      return {
        path: entry.slice(0, colon),
        type: entry.slice(colon + 1) as PrimitiveType,
      };
    })
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  return {
    root: rootReal,
    projectCount: projects.length,
    modules: [...modules.entries()]
      .map(([module, projectCount]) => ({ module, projectCount }))
      .sort((a, b) => (a.module < b.module ? -1 : a.module > b.module ? 1 : 0)),
    files: state.files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)),
    jsonFields,
    skipped: state.skipped,
    symlinksRejected: state.symlinksRejected,
    outsideRootRejected: state.outsideRootRejected,
    unreadableJson: state.unreadableJson,
  };
}
