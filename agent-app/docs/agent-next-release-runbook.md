<!-- modified by jinlong.feng at 2026-10-27 Agent工作台迭代 -->
# Agent App 可用版启动与交付手册

本手册适用于本轮独立本机试用。原生 KF 服务不需要被覆盖；Agent 源码补丁不能当作 KF 原生服务二进制补丁使用。

## 本机启动

工作目录 `/Users/fengjinlong/YK/KingFusion3.6/agent-app`，使用现有 Node 24 与 lockfile 对应依赖，不升级框架/包管理器。确保本机 PostgreSQL 已启动，服务器 `.env` 中有已授权的 `DEEPSEEK_API_KEY`。不要在终端打印整个 `.env`。

```sh
cd /Users/fengjinlong/YK/KingFusion3.6/agent-app
export PATH="/Users/fengjinlong/YK/KingFusion3.6/.toolchain/node-v24.19.0-darwin-arm64/bin:$PATH"
pnpm trial:status
# 首次初始化或新增迁移后，停止试用服务再执行：
pnpm trial:init
pnpm trial:start
```

`trial:start` 是前台监督进程，保持该终端运行。它先检查数据库标记、22 条源码迁移、UTC、账户和端口，执行 Web 类型检查/构建，再启动 API、agent-worker、build-worker，最终显示 `http://127.0.0.1:43301/login`。可在另一终端执行 `pnpm trial:status` 或 `pnpm trial:stop`。Ctrl+C 也只关闭当前监督进程创建的服务。

无 pnpm 命令时使用同一 Node 执行 `node --env-file=.env node_modules/vite-node/dist/cli.mjs -c tests/e2e/vite.e2e.config.ts scripts/trial/trial.mts status`；最后参数可替换为 `init`、`start`、`stop`。

## 初始化和配置

默认只创建本机 `kf_agent_trial_v1_20261027`。首次创建前可显式设置 `KF_TRIAL_DATABASE_URL`，仅允许 loopback 与 `kf_agent_trial_v1_` 前缀的独立库；不要指向生产或旧试用库。初始化需要对应本地 PostgreSQL 用户有创建数据库的权限。

私有目录 `.kf-trial-v1/` 不进 Git/补丁；目录权限 0700，JSON/日志 0600。`config.json` 保存固定库、端口、租户、模型和独立签名身份；`access.json` 保存初始临时密码，首次登录强制改密。当前验收账户已改密，使用同文件 `currentPassword`。不要共享 `config.json` 或控制令牌。

数据库内 `_AgentTrialOwnership` 与本机随机标记必须一致，已有同名但无可信所有权的数据库会被拒绝；不要通过删除数据库/标记或伪造本机记录绕过。中途初始化失败保留现场，先确认所有权再人工恢复，不自动 reset/seed。

初始化在所有权确认后只为该库设置 UTC，使 Prisma timestamp 与原始 SQL 日期一致；启动发现其他时区时拒绝并要求先停服务、重新 `trial:init`。在其他部署环境也必须使用 UTC 数据库会话，不能依赖机器本地时区。

试用环境使用真实 `deepseek-flash` 文本/视觉路由，显式启用语义思考与 120 秒请求 deadline，视觉蓝图和语义各最多一次修复。路由若需调整，应先停止并排空旧视觉任务，修改私有配置后重启，再新提交图片并独立审核；不能给旧 Run 重新签名。

试用配置只开放新试用租户，并显式开启私有参考图上传、runs/workbench/vision。预算、prompt rollout、局部编辑、native 自动验证仍关闭；首次租户图片外发策略为 false，必须由管理员在工作台主动授权。后续 init/start 不清空已由管理员设置的策略，也不自动重置密码。

## 名称规则升级

本次修复新生成页面、控件及布局的 KF 名称最长 32 字符。新短名基线的后续修改会保留经验证的对象身份；旧试验包的长名和原签名不原地改写，历史版本仍按原 SHA 下载。旧长名生成基线会在模型调用前拒绝并提示新建工程重新生成，不要反复重试同一基线，也不要手工改数据库中的名称/hash。

最终视觉冻结身份为 `visual-blueprint@14 / blueprint-repair@8 / visual-semantic@24 / semantic-repair@13`。升级前应完成/取消并排空旧视觉任务、整体停止和启动，新的图片必须重新上传、同意和审核；不得给旧回执重新签名。真实模型验收包以 `outputs/usable-v1-20261027/native-name-fixed/` 最终证据为准，父目录旧包用于保留问题记录。

## 下载和KF导入

最终已验收样例位于 `outputs/usable-v1-20261027/native-name-fixed/`，导入可使用 `DeviceOverviewV1.gz`（文字首版）、`DeviceOverviewV2.gz`（继续修改）和 `EnergyOverviewV1.gz`（图片生成）。它们与各自 text/modify/image-client.gz 字节一致。父目录旧包保留历史问题记录，不能作为修复版使用。

通过KF门户正常登录，在客户端工程管理中导入到新的合法名称工程，再从选中工程打开开发页。不要只复制开发页URL到未建立工程上下文的标签页：KF报表加载需要当前工程上下文。验收工程为 `AgentTextReadyV120261027`、`AgentTextReadyV220261027`、`AgentImageReadyV120261027`，未发布、未覆盖既有工程。

## 排错

| 提示 | 处理 |
| --- | --- |
| `TRIAL_PORT_OCCUPIED` | 查看占用者；不要自动杀旧服务，停止本次旧实例或选择经过校验的独立端口 |
| `TRIAL_MODEL_KEY_REQUIRED` | 在服务器私有 `.env` 配置授权 key；不要复制到浏览器或聊天 |
| `TRIAL_DATABASE_OWNERSHIP_INVALID` | 检查是否误用配置/库；不重置任何不明数据库 |
| `TRIAL_MIGRATIONS_PENDING_RUN_INIT` | 备份、停止本次服务后执行 `trial:init`，不要并行迁移 |
| `TRIAL_DATABASE_TIMEZONE_INVALID_RUN_INIT` | 停止本次服务并 init，启动重新检查 UTC |
| 图片上传失败 | 确认上传、vision 与租户 rollout 配置，以及管理员外发许可；保留失败附件，重新上传，不按文字悄悄提交 |
| 模型输出无效 | 查看该轮失败状态；文字可“重新尝试”，重新核对新蓝图/审批；图片需重新提交并同意，禁止复用旧回执 |
| 历史版本无下载/分叉 | 该旧版本缺少可靠 artifact/消息关联时只读；不拿最新包替代旧包 |

私有日志路径在启动消息中给出。日志不能证明截图还原；下载哈希一致也不能代替原生运行态验收。

## 整体升级和回退

1. 保存本轮精确清单所列文件的部署前副本，备份独立试用库和私有制品目录。保存签名密钥身份，禁止发送到模型。
2. 关闭新受理并按当前 Run 状态完成/取消、排空旧视觉任务；停止 API 与两个 worker。不同冻结协议不能混部。
3. 按补丁原目录覆盖当前任务文件；安装 lockfile 对应依赖，执行 Prisma generate，确认目标数据库和所有权后仅 migrate deploy。此轮新增迁移只增加会话分叉幂等表，源码共 22 条。
4. 在同一配置/存储下重新构建 Web，整体重启 API、agent-worker、build-worker。确认登录、工作台配置、worker 状态和一条新生成/下载流程。
5. 需要回退时先停新受理并停止服务，恢复部署前对应文件和构建，保留新增表/数据和制品。不要 drop 表、反向覆盖数据库或重新启用已退役的旧 POST messages/resume。

本机旧 18 迁移库和旧 43280 服务是历史环境，不属于上述新试用库，不应因使用此手册被自动迁移、seed、清理或停止。
<!-- end -->
