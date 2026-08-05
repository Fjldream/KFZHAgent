// @ts-check
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["**/node_modules/**", "**/dist/**", "**/coverage/**"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
    },
  },
  {
    files: ["**/*.test.ts"],
    rules: {
      // Test doubles define async method stubs that intentionally lack await.
      "@typescript-eslint/require-await": "off",
      // Brief 逐字测试代码是 JS 风格（无类型标注）；@ts-nocheck 用于保持代码逐字不变。
      "@typescript-eslint/ban-ts-comment": ["error", { "ts-nocheck": "allow-with-description" }],
    },
  },
);
