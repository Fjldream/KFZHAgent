import { defineConfig } from "vitest/config";

// The checkpoint integration suite shares the kf_agent_test database with the
// other workspace integration suites; keep this package's files sequential.
export default defineConfig({
  test: {
    fileParallelism: false,
  },
});
