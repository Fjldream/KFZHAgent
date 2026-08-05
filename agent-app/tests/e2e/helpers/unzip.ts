import { mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { importNativeClientPackage } from "../../../packages/domain-client/src/package/native-client-package.js";

/**
 * E2E 解包工具：直接复用 @kf/domain-client 的安全解包（相对源码导入，
 * Playwright 的 TS loader 已支持 .js → .ts 映射）。
 */

const E2E_DIR = fileURLToPath(new URL("..", import.meta.url));

/** 解包到 destRoot 下的新目录，返回解包根路径。 */
export async function unzipPackageToDir(data: Uint8Array, destRoot: string): Promise<string> {
  await mkdir(destRoot, { recursive: true });
  return importNativeClientPackage(data, destRoot);
}

/** 递归读取目录树，返回相对路径 → 原始字节。 */
export async function readFileTree(root: string): Promise<Map<string, Buffer>> {
  const out = new Map<string, Buffer>();
  async function walk(dir: string, rel: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const relPath = rel === "" ? entry.name : `${rel}/${entry.name}`;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full, relPath);
      } else if (entry.isFile()) {
        out.set(relPath, await readFile(full));
      }
    }
  }
  await walk(root, "");
  return out;
}

/** fixture 文件绝对路径。 */
export function fixturePath(name: string): string {
  return path.resolve(E2E_DIR, "..", "fixtures", name);
}

export { readFile };
