<!-- modified by jinlong.feng at 2026-10-21 Agent工作台迭代 -->
# 参考图安全接入实施记录（2026-10-21）

## 结果与边界

T18 **IN_PROGRESS**：已实现并测试私有参考图上传和真实派生像素，不是图生工程完成。没有模型外发、收费调用、视觉分析、组件映射或图生编译。本批不修改 Run 协议（仍 `run-plan@6`），不恢复旧 POST messages/resume，也不允许受理图片后静默忽略像素。

工作区保持 main 和既有混合 dirty，不重置、不提交、不推送。当前本机试用 `http://localhost:43281/login`、试用库 `kf_agent_e2e_trial_20261021_01`、原5174预览、业务库、实际 `.env` 与真实模型配置均未变动。测试仅使用新建 `kf_agent_test_vision_20261021_1735`，不对试用库 seed/TRUNCATE/migrate。

## 本批实现

- 新 `ReferenceAsset` 保存原图，`ReferenceAssetDerivative` 保存长边≤2048、保持比例、校正 EXIF 方向后的无 metadata lossless WebP。原图 hash 与派生 hash 分别计算，保存原始尺寸、方向规范化尺寸、scale/scaleX/scaleY、transform version=1。
- 与 `WorkspaceAsset` 材料目录隔离，原图不会被既有目录、素材解析或编译自动放入 `res/images`。没有改变原素材接口的 MIME 宽容行为；仅导出原容器检查函数复用。
- 输入只支持静态 PNG/JPEG/WebP；拒绝 GIF/SVG、APNG/动画 WebP、伪 MIME、坏容器、无有效压缩像素、尾随可执行载荷；10MiB、8192长边、32MP 上限。Sharp `limitInputPixels=32_000_000`，解码操作设10秒上限；每API实例最多同时处理2个上传，超出429。
- HTTP Content-Length预检和流实际字节上限均有检查，不把无限请求体送入解码器。文件名仅作为展示名，拒绝分隔符、控制字符、超长、`.`/`..`，不拼物理路径。
- 引用只能通过服务器资产ID读取，严格匹配 tenant/workspace；返回 DTO 无 storageKey、文件系统路径或 base64。读取派生图前核对长度/hash/transform，返回 private/no-store、Vary Cookie、nosniff。
- 默认1GiB**参考图**租户配额，包含原图+派生图；数据库Tenant行锁串行额度受理，Workspace行锁协调删除。只在同租户同工作区按原图hash去重，不跨租户共享缓存。配额不包括其他历史制品/材料，不宣称全存储配额管理已完成。
- 失败、重复、取消、工作区已删除时清理未采用blob；提交确认丢失/DB查询失败时保守保留可能已被引用的blob。正常删除工作区同时回收两类参考blob。
- 原图沿用既有私有ArtifactStorage权限策略，**没有新增应用层静态加密，也不宣称已加密**。异常保留blob的运维回收/租户删除策略仍需发布收尾。

## 接口与默认关闭

| 接口 | 请求/响应 | 准入 |
|---|---|---|
| `POST /api/v2/workspaces/:workspaceId/reference-assets?name=design.png` | 原始图片二进制，Content-Type为实际图像类型或application/octet-stream；201返回ID、reference用途、hash与派生尺寸 | 会话+精确Origin；`AGENT_REFERENCE_UPLOADS_V1=true`；有效Run/工作台租户准入 |
| `GET /api/v2/workspaces/:workspaceId/reference-assets/:assetId/image` | 无metadata的私有派生WebP | 会话+tenant/workspace；已保存图片可在停新上传后读取，不进行模型调用 |

新配置仅加到 `.env.example`，没有开启实际环境：

```dotenv
AGENT_REFERENCE_UPLOADS_V1=false
AGENT_REFERENCE_QUOTA_BYTES=1073741824
```

上传独立开关只代表本地私有保存，不能作为模型图片外发授权。`AGENT_VISION_V1`、`outboundImagesAllowed`仍false，Workbench config的imagePolicy仍disabled，前端附件未开放。不得为了测试上传把视觉flag设true；未接通功能仍按原策略故障关闭。

## 迁移与依赖

- 新增 `202610210001_reference_assets`，实际新测试库从空库deploy **19**条迁移成功。原P4计划0007与已有build_run_control编号冲突，未重写历史迁移。
- 复合外键同时绑定tenant/workspace/sourceHash；Prisma relation map与实际约束名一致。只读 `prisma migrate diff` 未发现本批表差异，但因LangGraph管理的4张checkpoint表不在Prisma schema，整体返回2并列为“Removed tables”；**没有执行删除，也不能把整库宣称为零drift**。
- API锁定 `sharp=0.35.5`，lock包含跨平台optional依赖，无本机node_modules补丁。依赖安装期间出现镜像获取失败/离线缓存缺失；显式 npm registry + frozen-lockfile安装完成。安装曾意外重解析image-size和Volar，已恢复原锁定版本，最终lock只增加Sharp相关项，不顺手升级其他包。
- macOS ARM64真实解码已测；Linux/Windows原生安装和解码未测，不能据此正式发布。
- 部署顺序须先备份、expand migration，再部署对应代码、最后按租户启用本地上传。当前试用环境未执行上述切换；不能以重跑E2E启动脚本代替升级。

Sharp安全参数依据：[constructor](https://sharp.pixelplumbing.com/api-constructor/)、[metadata默认剥离](https://sharp.pixelplumbing.com/api-output/#keepmetadata)。实际接受/拒绝行为以本仓库真实字节测试为证据。

## 验证证据

红测：image-policy、reference-image、reference-asset.integration三个新增测试入口均先因对应实现缺失而失败，再实现。动画样本首次意外被生成器合并为静态帧，修成不同像素的双帧真实WebP；不得删除动画断言。配额样本曾引用前例已存在的去重资产，修成全新工作区并另补并发额度测试。

最新针对性测试：**5文件82 passed / 0 failed / 0 skipped**：策略19、真实解码8、参考图集成16、原素材27、准入12。包含10MiB真实有效PNG精确边界、超过边界HTTP413、同hash并发、跨workspace quota并发、跨租户读拒绝、存储失败补偿、取消、模糊提交保留、删除竞争、完整性校验。

API扩大初轮：**57文件628项，626 passed / 2 failed / 0 skipped**（补充最后两个安全用例前），不能宣称全绿：

1. auth的Secure-cookie断言：实际本机HTTP `.env` 为 `COOKIE_SECURE=false`，被运行环境加载；显式 `COOKIE_SECURE=true` 后该文件11/11通过，没有改生产cookie策略或用户配置。
2. `advanced-interactions.integration.test.ts` 第二例：期望 `INTERACTION_CLOSURE_MISSING / mark-details-opened`，实际为 `JOURNEY_CLOSURE_MISSING` 和 `JOURNEY_STEP_UNCOVERED / open-detail:0`。单独与认证一起复现仍失败，编译仍blocked且不落变更计划。诊断合同差异未修复，未改断言、skip/exclude/retry隐藏，也未改本批之外的交互实现。

本批开始前的HTTP Parse Error / run-flow偶发403历史记录保留；本轮首次API主集成59/59、run-flow15/15通过不构成其根因已修复的证据。最终完整复核结果追加在下方，不合并不同运行的通过数冒充一轮全绿。

最终完整复核（显式COOKIE_SECURE=true，含增补的取消/删除竞争用例）：**57文件630项，629 passed / 1 failed / 0 skipped**，耗时100.68s。唯一失败仍为上述advanced-interactions诊断合同差异；API主集成59、run-flow15、认证11、新参考图集成16均通过。不是monorepo/Web/浏览器全量，更不等于正式上线验收。

命令（cwd=`agent-app/apps/api`；仅使用专用测试库）：

```sh
COOKIE_SECURE=true TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/kf_agent_test_vision_20261021_1735 KF_TEST_ALLOW_DESTRUCTIVE_RESET=1 ../../../.toolchain/node-v24.19.0-darwin-arm64/bin/node ../../node_modules/vitest/vitest.mjs run src/vision src/assets/asset.service.test.ts src/runs/feature-policy.integration.test.ts
```

API tsc、相关TS ESLint、Prisma validate已通过。未重跑Web/浏览器、worker全套、KF原生验证，也未调用真实模型。

## 本批文件清单（不是整个迭代的补丁清单）

新增：

- `apps/api/src/vision/image-policy.ts`、`image-policy.test.ts`
- `apps/api/src/vision/reference-image.ts`、`reference-image.test.ts`
- `apps/api/src/vision/reference-asset.service.ts`、`reference-asset.controller.ts`、`reference-assets.module.ts`、`reference-asset.integration.test.ts`
- `prisma/migrations/202610210001_reference_assets/migration.sql`
- `docs/reference-ingestion-20261021.md`

修改：

- `apps/api/package.json`、`pnpm-lock.yaml`（机器可读JSON/自动生成lock不塞无效代码注释；此处记录日期/功能名）
- `apps/api/src/app.module.ts`、`assets/asset.service.ts`（仅复用检查导出）、`workspaces/workspace.service.ts`（仅新增参考图删除回收）
- `prisma/schema.prisma`、`.env.example`、`docs/agent-runs-operations.md`
- 仓库 `docs/superpowers/plans/2026-10-20-agent-app-{p4-vision,next-master,handoff}.md`

## 下一接手点

1. 继续T19的VisualReferenceSpec严格合同、源事实冻结、图像型模型路由及分析缓存；先本地provider替身截获真实像素请求，不调用收费服务。图片外发需服务端明确授权，不能借用上传开关。
2. T20复用现有控件能力/证据，T21接语义编译/snapshot，T22再接MessageAttachment、Run不可变附件列表与用户确认；不能创建一个接受了图片却仍走纯文字的Run。前端应如实表示尚未开放。
3. 在独立任务查清上述交互诊断差异，保留旧API偶发失败和发布门槛；不绕过审批、签名、编译或真实build来“打通”图生。
4. 补Linux/Windows smoke、上传压力/多副本/代理验证，完成图片隐私与保留策略，再考虑向试用环境部署。预算限制按维护者要求继续暂缓。
<!-- end -->
