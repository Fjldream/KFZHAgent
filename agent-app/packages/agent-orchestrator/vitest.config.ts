import { defineConfig } from "vitest/config";

// 检查点集成套件与其他工作区集成套件共享 kf_agent_test 数据库；请将此包的文件保持顺序。
export default defineConfig({
  test: {
    fileParallelism: false,
  },
});
