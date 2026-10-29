<!-- modified by jinlong.feng at 2026-10-29 KF源码精简入库 -->
# KingFusion 3.6 与客户端工程生成 Agent

接手本仓库时先读 [AGENTS.md](AGENTS.md)、[KF 运行逻辑与阅读路线](docs/KF_RUNTIME_GUIDE.md)，再读 [Agent 当前可用版说明](agent-app/docs/agent-usable-v1-20261027.md)。

本仓库包含两套产品代码：`agent-app/` 根据文字或 UI 参考图生成 KF 客户端工程；`kf-reference/` 保存用于理解 KF 原生编辑、渲染和服务调用的源码快照。`front/` 是 KF 运维中心 Vue 工程。

| 目录 | 用途 |
| --- | --- |
| `agent-app/apps/web/` | 对话工作台、图片上传、识别审核、蓝图确认与制品下载 |
| `agent-app/apps/api/` | 租户、会话、Run、视觉分析、签名审核、版本与制品 API |
| `agent-app/packages/agent-orchestrator/` | Agent 状态图和确定性执行步骤 |
| `agent-app/packages/domain-client/` | KF 工程编译、控件能力、布局、样式、原生包校验 |
| `kf-reference/KingFusion3.6_Center/` | KF 开发态、Center 服务、Center 自带运行态源码 |
| `kf-reference/KingFusion3.6_Node/` | 节点运维代理和节点运行态源码 |
| `front/` | 运维中心前端源码，包括冗余管理 |
| `docs/superpowers/` | 实施计划、设计和交接记录；日期较新的当前状态优先 |

KF 快照约 22.4 MiB，保留原目录层级；依赖、第三方大资源库、安装程序、二进制服务、现场工程数据和实例配置均已排除。31 个包含敏感字面量的文件经过格式化和脱敏；逐文件原始/快照 SHA-256、修改数量见 [manifest.json](kf-reference/manifest.json)。**快照供阅读，不能直接覆盖 KF 安装目录或作为完整 KF 安装发行包。**

<!-- modified by jinlong.feng at 2026-10-29 UI测试图片集 -->
图片生成测试可使用 [6 张固定 UI 参考图](agent-app/tests/fixtures/ui-batch-20261029/README.md)，涵盖基础概览、设备卡片、告警表格、能耗图表、设备表单与移动端，附完整提示词、建议需求和 SHA-256。这些是测试输入，尚不是已生成客户端的验收结果。
<!-- end -->

克隆当前交接版本：

```sh
git clone --branch main --single-branch https://github.com/Fjldream/KFZHAgent.git
cd KFZHAgent
node scripts/export-kf-reference.mjs --verify
```

`--verify` 只需要 Node.js 和仓库文件，不需要本机已有 KF。重新导出才需要本机完整 KF 安装目录和 `agent-app` 的 TypeScript 依赖，详见 [快照说明](kf-reference/README.md)。

Agent 开发环境使用 Node.js 24、pnpm 与 PostgreSQL；依赖通过包清单安装，不入库：

```sh
cd agent-app
pnpm install --frozen-lockfile
cp .env.example .env
# 按下方运行手册填写本机数据库、模型配置与服务端密钥，再初始化独立试用环境。
pnpm trial:init
pnpm trial:start
```

完整配置、隔离数据库和启动条件以 [运行手册](agent-app/docs/agent-next-release-runbook.md) 为准。`.env`、账号口令、签名密钥、已有试用数据库和会话不会随 Git 克隆；不要把旧机器的私有配置复制入库。

运维中心前端使用自身的 npm 锁文件：

```sh
cd front
npm ci
cp .env.example .env
# 把 VITE_BACKEND_ORIGIN 改为获准使用的 KF 测试服务地址。
npm test
npm run dev
```

当前 Agent 已跑通文字与图片生成、审核、蓝图确认、构建、下载和历史版本流程。图片精细还原、表格/图表可执行替代生成、完整发布运行态验收仍有未完成工作；详见 [验收范围](agent-app/docs/agent-next-acceptance.md) 和 [图片审核简化说明](agent-app/docs/visual-review-summary-20261028.md)。不要把“包能导入、开发态能打开”当成运行态与视觉还原已验收。
<!-- end -->
