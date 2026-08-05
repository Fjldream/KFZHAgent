import { transform } from "@swc/core";
import type { Plugin } from "vite";
import { defineConfig } from "vite";

/**
 * E2E 服务进程的 vite 配置：以 SWC 发射 decorator metadata，
 * 使 NestJS 构造器注入在 vite-node 下正常工作（与 apps/api 的 vitest
 * 配置一致）。
 */
function emitDecoratorMetadata(): Plugin {
  return {
    name: "e2e-emit-decorator-metadata",
    enforce: "pre",
    async transform(code, id) {
      if (!id.endsWith(".ts")) return null;
      const result = await transform(code, {
        filename: id,
        sourceMaps: true,
        module: { type: "es6" },
        jsc: {
          parser: { syntax: "typescript", decorators: true },
          transform: { legacyDecorator: true, decoratorMetadata: true },
          target: "es2022",
        },
      });
      return { code: result.code, map: result.map ?? null };
    },
  };
}

export default defineConfig({
  plugins: [emitDecoratorMetadata()],
});
