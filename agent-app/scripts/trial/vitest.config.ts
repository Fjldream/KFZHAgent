// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { include: ["scripts/trial/**/*.test.ts"], fileParallelism: false } });
// end
