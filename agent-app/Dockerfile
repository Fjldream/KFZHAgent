# KF Solution Agent 多目标镜像。
# 本机无 Docker，未在本地跑过容器；配置随 MVP 提供，按“文档部署不失败”门槛
# 保证：base 阶段生成 Prisma Client，api/worker 启动前先 `prisma migrate deploy`
# （空库启动不再崩），compose 用一次性 migrate 服务串行化迁移。
#
# 运行方式说明：api/worker 以 vite-node 运行 TS 源码（与本地开发一致，MVP
# 阶段 workspace 包 exports 指向 src）。生产构建产物化（tsc build 每个包 +
# dist 映射）留待 Phase 3，届时仅需替换 CMD 而不改迁移机制。
FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-workspace.yaml tsconfig.base.json pnpm-lock.yaml vitest.workspace.ts eslint.config.js ./
COPY prisma prisma
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile
# 生成 Prisma Client（api/worker/migrate 运行时都需要）。
RUN pnpm exec prisma generate
COPY packages packages
COPY apps apps
COPY tests/e2e/vite.e2e.config.ts tests/e2e/vite.e2e.config.ts

FROM base AS migrate
WORKDIR /app
# 一次性迁移入口：compose 的 migrate 服务与 api/worker 的启动命令共用。
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]

FROM base AS api
WORKDIR /app
EXPOSE 3000
# 启动前先 migrate deploy：空库不会崩，api 起来即可用。
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && pnpm exec vite-node -r apps/api -c tests/e2e/vite.e2e.config.ts apps/api/src/main.ts"]

FROM base AS worker
WORKDIR /app
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && pnpm exec vite-node -r apps/worker -c tests/e2e/vite.e2e.config.ts apps/worker/src/run.ts"]

FROM base AS web
WORKDIR /app/apps/web
EXPOSE 5173
CMD ["pnpm", "exec", "vite", "--host", "0.0.0.0", "--port", "5173", "--strictPort"]
