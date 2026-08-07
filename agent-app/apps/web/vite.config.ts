import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
  },
  server: {
    // 同源代理：前端所有 /api 请求由 vite 转发到后端，消除 CORS 与
    // SameSite cookie 跨 host 问题（页面从 localhost / 127.0.0.1 打开均可）。
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
