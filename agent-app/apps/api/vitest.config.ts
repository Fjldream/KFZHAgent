import { transform } from "@swc/core";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

// NestJS 依赖 TypeScript 编译器生成的 design:paramtypes 进行构造函数注入。Vite 的 esbuild 转译不会生成 decorator metadata，因此应用 TypeScript 文件会由 SWC 再次转译；SWC 原生支持旧版装饰器和 decoratorMetadata。
function emitDecoratorMetadata(): Plugin {
  return {
    name: "emit-decorator-metadata",
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
  test: {
    // 集成套件共享 kf_agent_test 数据库，并在 beforeEach 中清空表；按顺序运行测试文件以避免跨文件 TRUNCATE 资源。
    fileParallelism: false,
  },
});
