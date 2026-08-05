# KF Solution Agent 多目标镜像。
# 本机无 Docker，未验证；Dockerfile 与 compose 配置一起随 MVP 提供。
FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-workspace.yaml tsconfig.base.json pnpm-lock.yaml vitest.workspace.ts eslint.config.js ./
COPY prisma prisma
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile
COPY packages packages
COPY apps apps
COPY tests/e2e/vite.e2e.config.ts tests/e2e/vite.e2e.config.ts

FROM base AS api
WORKDIR /app
EXPOSE 3000
CMD ["pnpm", "exec", "vite-node", "-r", "apps/api", "-c", "tests/e2e/vite.e2e.config.ts", "apps/api/src/main.ts"]

FROM base AS worker
WORKDIR /app
CMD ["pnpm", "exec", "vite-node", "-r", "apps/worker", "-c", "tests/e2e/vite.e2e.config.ts", "apps/worker/src/run.ts"]

FROM base AS web
WORKDIR /app/apps/web
EXPOSE 5173
CMD ["pnpm", "exec", "vite", "--host", "0.0.0.0", "--port", "5173", "--strictPort"]
