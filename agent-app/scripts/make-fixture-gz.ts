import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { packageNativeClientProject } from "../packages/domain-client/src/index.js";

/**
 * 为 E2E 生成确定性的 fixture 包：将 client-unknown-field 源码目录打包为
 * `tests/fixtures/client-unknown-field.gz`（ZIP 容器，固定时间戳，字节级可复现）。
 */
async function main(): Promise<void> {
  const fixtureDir = fileURLToPath(
    new URL("../tests/fixtures/client-unknown-field", import.meta.url),
  );
  const pkg = await packageNativeClientProject(fixtureDir);
  const outDir = fileURLToPath(new URL("../tests/fixtures", import.meta.url));
  await mkdir(outDir, { recursive: true });
  const outFile = path.join(outDir, "client-unknown-field.gz");
  await writeFile(outFile, pkg);
  console.log(`[fixture] wrote ${outFile} (${pkg.length} bytes)`);
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
