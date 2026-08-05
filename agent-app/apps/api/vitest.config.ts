import { transform } from "@swc/core";
import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";

// NestJS relies on design:paramtypes emitted by the TypeScript compiler for
// constructor injection. Vite's esbuild transform does not emit decorator
// metadata, so app TypeScript files are re-transformed with SWC, which natively
// supports legacy decorators + decoratorMetadata.
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
    // The integration suites share the kf_agent_test database and truncate
    // tables in beforeEach; run test files sequentially to avoid cross-file
    // TRUNCATE races.
    fileParallelism: false,
  },
});
