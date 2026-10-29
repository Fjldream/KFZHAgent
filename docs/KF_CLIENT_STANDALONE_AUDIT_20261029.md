<!-- modified by jinlong.feng at 2026-10-29 KF客户端完整入库与启动审计 -->
# KF 客户端 Linux / Docker 独立启动审计

日期：2026-10-29。用户确定的最终目标是克隆仓库、安装依赖和配置后，开发态与运行态均可真正使用；目前没有独立 KF 测试授权，本阶段先检查启动阻塞项。

**结论：尚不满足独立启动要求。** 本次补齐并核对了原包可见的客户端程序和静态资源，源码缺口需要进一步核对，下面的启动条件仍须解决。未构建 Docker 镜像、未运行容器、未跳过授权，也未把静态页面可访问当成完整 KF 验收。

## 已完成的内容覆盖

| 目录 | 按规则应保留的文件 | 尚未入库 |
| --- | ---: | ---: |
| Center 开发态 `kingdevopscenter/kingclient/exe` | 12,567 | 0 |
| Center 运行态 `kingexedb/kingclient/exe` | 4,278 | 0 |
| Node 运行态 `kingexedb/kingclient/exe` | 4,363 | 0 |
| Center `common` | 37 | 0 |
| Node `common` | 37 | 0 |

另保留启动相关的根配置样例，以及已有的其他 KF 服务参考源码。总清单 22,794 个文件、约 412.5 MiB。

恢复内容包括三套 `ThirdParty`、`core/cache` 程序、预置图库、HT3D 编辑器、图片、字体、音频、随包视频和配置结构。第三方 JS/CSS 按原始字节保存，开发态与运行态版本差异保留，不统一替换成 npm 最新版。

明确排除 macOS AppleDouble 元数据、`node_modules`、业务数据库/上传目录、私钥、机器 `.env`、source map、显式副本以及第三方示例/测试等非启动必需产物。逐项排除理由在 `manifest.json` 的 `policy.clientContent.excluded`。这里的“覆盖”表示与本地原包的可见文件集合一致，原包中本来就不存在的模块须另外补齐。

## 启动阻塞项

| 优先级 | 阻塞 | 已观察到的证据 | 解决与验收要求 |
| --- | --- | --- | --- |
| P0 | 生产依赖不可重建 | 三个客户端 `package.json` 的 `dependencies` 均为空。字面量扫描观察到开发态 27 个、两份运行态各 31 个外部依赖，均未声明；也缺少对应锁文件和启动命令。 | 按实际版本建立可复现的依赖清单和锁文件，在干净 Linux 镜像执行安装与加载测试，不上传本机 `node_modules`。 |
| P0 | SQLite 原生模块尚未验证 | 观察到 `better-sqlite3@12.2.0` 安装的两个 `.node` 文件均为 Windows PE；`sqlite3@5.1.6` 安装树混有 Windows、Linux x64/arm64 绑定。 | 明确 Linux 架构与 Node ABI，在容器内重新安装/编译并验证数据库创建、读写及所需加密兼容性。不能直接复制现有绑定。 |
| P0 | 配置和私有值尚未初始化 | 启动涉及客户端配置、根 `common.json`、服务地址、OAuth 客户端和会话配置。快照中的敏感值为 `KF_REFERENCE_REDACTED`。 | 提供配置生成与校验脚本，通过私有环境/secret 挂载注入；启动前拒绝未填值和错误服务地址。 |
| P0 | 运行目录和演示工程初始化缺失 | 运行态从命令行读取工程路径，并要求该目录有 `externalconfig.json`、上层有 `project.json`；开发态要求 SDB 根目录存在。共享模块还含原包中无法解析的节点配置路径读取。 | 创建独立可写数据卷、空开发目录和可重复初始化的合成演示工程，验证目录层级、节点配置路径及重启持久化。 |
| P0 | KF 服务栈尚未部署 | 客户端调用网关、OAuth、授权及配置中的相关服务；当前没有 KF 客户端完整 Docker 编排、统一入口和健康检查。`agent-app` 的 Compose 服务于另一个产品。 | 提供真实服务编排、依赖顺序、路由/静态资源前缀及健康检查；验收登录、编辑、保存、发布和运行，而非仅检查一个 HTTP 200。 |
| 外部条件 | 暂无 KF 独立测试授权 | 用户已说明暂时没有可用独立授权。 | 提供合法测试授权文件或获准使用的授权服务，作为私有挂载配置；再完成授权、用户权限及真实运行态验收。 |
| 本机条件 | Docker 引擎未运行 | Docker CLI 可用，`docker version` 访问守护进程失败。 | 启动或提供可用的 Linux Docker 引擎后，才能进行真实镜像构建、容器启动及浏览器验收。 |

后端字面量相对引用已按目录实际名称额外检查，未发现大小写不一致；该检查不覆盖动态路径和浏览器资源请求。

上述依赖数量来自静态字面量 `require` 扫描，Node 内置模块已排除；动态加载链不能仅凭该扫描认定闭合。审计 JSON 保存了安装树可观察的版本、引擎要求和绑定格式，未声称这些版本已经在干净 Linux 中重建成功。

## 源码缺口与功能限制（不等同于已复现的启动故障）

- 开发态：`lib/services/projectPermissionManage/checkProjectPermission.js` → `../../../core/enums/public`。该文件模块级引用没有保护，但当前客户端源码未发现对 `checkProjectPermission.js` 的静态调用方，入口可达性未证实，不能直接判定它会阻止实际启动。
- 两份运行态：`lib/controllers/controller_user.js` → `../../core/utils/checkThirdToken`。原代码以 `try/catch` 捕获缺失错误，因此不会仅因这个缺失而中断控制器加载；但 `checkThirdToken` 处理函数直接访问空模块，调用该第三方 token 接口会失败。这属于特定功能缺失，不能当作普通登录已失败的证据。
- 两侧共享模块：`common/projectClient/routes/projectUtil.js` 的 `getProxyNodeId` / `getProxyNodeName` 读取 `../../../../config/nodeRegister.json`，当前原包目录无法解析该相对路径；这是函数内读取，需要结合部署位置与初始化方案核对。

已搜索本地 Center、Node 与现场副本，没有找到同名 `checkThirdToken`。其他服务的 `public.js` 位于不同命名空间，未据此混用版本。原安装文件没有被改动。

按用户要求，只读检查了 `192.168.3.32` 的 `/opt` 安装目录、备份、`/root`、`/home/admin` 和补丁工作目录，未找到这两个模块。另找到 `/opt/KF/KingFusion3.6_sp4_linux_x86_64_KylinOS_svn5822_mini.zip`，在服务器内用已有 `bsdtar` 列出嵌套包目录：`common.kf4z` 共 54,454 项、`kingdevopscenter.kf4z` 共 77,793 项，也没有目标模块；开发包确实包含那个悬空引用文件。只返回路径及哈希，没有提取包内源码、业务数据或配置，未修改服务器服务。开发态所检查的五个文件均与本地原文件一致，两份运行态的 `app.js` 和 `controller_user.js` 与本地存在差异，未混用覆盖。证据见 `server-source-check-20261029.json`。

## 可复核产物与后续顺序

- `kf-reference/manifest.json`：文件来源哈希、快照哈希、配置脱敏和明确排除项。
- `kf-reference/client-verification-20261029.json`：本次内容与工具验证结果。
- `kf-reference/client-startup-audit-20261029.json`：依赖、原始缺失模块、Docker 状态与未通过的启动标志。
- `scripts/complete-kf-client-reference.mjs`：补齐客户端及共享内容，保留程序 `cache`，不复制业务数据和安装依赖。
- `scripts/audit-kf-client-startup.mjs`：只读复查，不执行产品代码或连接 KF 服务。AST 确认在已安装 `agent-app` TypeScript 工具依赖时可用。

建议先建立依赖锁定、配置与演示工程初始化、真实 Docker 服务栈，再接入测试授权；源码缺口需在相应功能的加载链与接口验收中单独处理，不能用空鉴权实现补洞。最终验收应从全新克隆开始，记录镜像构建、两个进程健康、登录、开发态创建/编辑/保存、发布到运行态、页面和控件加载、交互、日志及数据卷重启结果。任何尚未执行的项目继续标为未验证。
<!-- end -->
