// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { defineConfig } from "vitest/config";

// 只跑 tests/helpers 下的纯单元测试，避免误触发任何需要数据库的集成套件。
export default defineConfig({
  test: {
    include: ["tests/helpers/*.test.ts"],
  },
});
// end
