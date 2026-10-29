import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";

// modified by jinlong.feng at 0901 冗余功能开发
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    port: 4176,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:12000",
        ws: true,
      },
      "/getPublicKey": "http://127.0.0.1:12000",
      "/login": "http://127.0.0.1:12000",
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vue: ["vue", "vue-router", "pinia"],
          "element-plus": ["element-plus", "@element-plus/icons-vue"],
          transport: ["axios"],
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.spec.ts"],
  },
});
// end
