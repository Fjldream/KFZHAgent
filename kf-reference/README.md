<!-- modified by jinlong.feng at 2026-10-29 KF源码精简入库 -->
# KF 原生源码阅读快照

日期：2026-10-29。来源：本地 `KingFusion3.6_Center/` 与 `KingFusion3.6_Node/` 安装树。快照内每个路径都与来源目录相同，只增加 `kf-reference/` 前缀。它记录本地代码，不能证明与任何服务器部署版本相同。

<!-- modified by jinlong.feng at 2026-10-29 KF客户端完整入库与启动审计 -->
先读 [运行逻辑与定位方法](../docs/KF_RUNTIME_GUIDE.md) 和 [Linux/Docker 独立启动审计](../docs/KF_CLIENT_STANDALONE_AUDIT_20261029.md)。共 22,794 个文件，约 412.5 MiB；开发态、Center 运行态、Node 运行态和共享模块按本地原包逐项对照。重复服务保留各自版本，不能推断同名文件一定相同。原包自身还存在缺失模块，完整启动验收尚未通过。
<!-- end -->

## 范围

- `KingFusion3.6_Center/kingdevopscenter/kingclient/exe/`：原生开发态编辑器及其后端。
- `KingFusion3.6_Center/kingexedb/kingclient/exe/`：Center 随包的运行态客户端及其后端。
- `KingFusion3.6_Node/kingexedb/kingclient/exe/`：Node 运行态客户端及其后端。
- 两侧 `common/`：工程、鉴权、日志等共享模块。
- Center 的 `kingopsserver`、`gateway`、`kingoauth`、`kingcalculation` 等：各服务可获得的一方源码。
- Node 的 `kingopsproxy/exe/kingopsagent/exe/`：注册、部署、轮询、命令执行与冗余协调。

<!-- modified by jinlong.feng at 2026-10-29 KF客户端完整入库与启动审计 -->
- 三个客户端 `exe/public/javascripts/ThirdParty/`：开发态、Center 运行态和 Node 运行态的实际 JS/CSS、字体、图标、地图/PDF 相关静态资源等，包含压缩 JS/CSS 和依赖内的 `dist/`。对应版本按原始路径分别保留。
- 客户端的预置图库、3D 编辑器、图片、音频、随包视频、完整 `core/cache` 程序和两侧共享模块；配置文件以脱敏样例形式保留。
<!-- end -->

## 有意排除

<!-- modified by jinlong.feng at 2026-10-29 KF客户端完整入库与启动审计 -->
不包含 `node_modules`、安装工具、Node/Chrome/Redis/Nginx 二进制、DLL/EXE、业务数据库、私钥、日志、运行时缓存数据、上传文件、业务工程、现场副本、压缩包、构建备份和网关离线帮助站。`core/cache` 是程序代码，已经恢复保留。第三方依赖的 source map、明确副本（如 `ht - 副本`）、文档站、示例与测试目录不入库，许可证文件保留。机器环境与私有实例值不上传，启动涉及的配置结构以脱敏样例保留。

部分外部原生服务只有二进制实现，仓库保留其可获得的 JS 适配层。客户端程序与静态资源按声明范围核对覆盖，仍需重建 Linux 依赖、初始化配置、部署服务栈并接入 KF 授权，原始源码缺口须单独核对相关功能的加载链；不能仅执行当前客户端的 `npm install` 就认定环境已可用。
<!-- end -->

## 脱敏

对源码语法树中的口令、会话密钥、私钥及 API 凭据字面量做替换，值统一为 `KF_REFERENCE_REDACTED`。有替换的文件先格式化，再加本次修改首尾注释；其余文件保持原始字节。原本通过运行配置或参数传入的值保持动态读取。

<!-- modified by jinlong.feng at 2026-10-29 KF客户端完整入库与启动审计 -->
`manifest.json` 列出全部文件的字节数、快照 SHA-256、原始 SHA-256 和脱敏数量。第三方依赖 10,185 个文件，约 154.0 MiB，保持原始字节，`kind` 为 `runtime-dependency`；随后补齐客户端与共享模块内容。当前 32 个文件、42 处敏感字段被脱敏；三份把 `password="*"` 显示掩码误当凭据的静态控件文件已恢复原始字节。JSON 清单不保存凭据原值，来源目录不被修改。

第三方文件中，相同内容共有 3,076 个唯一文件、约 67.3 MiB；Git 可复用相同 blob。开发态与运行态的 Univer、Node 与 Center 的 HT 存在版本差异，应按对应路径比较，不能用 npm 最新版统一替换。
<!-- end -->

## 校验与更新

```sh
node scripts/export-kf-reference.mjs --verify
```

校验读取清单和快照，不读取本机 KF 数据库，不发送网络请求，不需要安装第三方包。

<!-- modified by jinlong.feng at 2026-10-29 KF客户端完整入库与启动审计 -->
重新导出时，在独立工作目录依次执行：

```sh
node scripts/export-kf-reference.mjs --export
node scripts/complete-kf-client-reference.mjs
node scripts/export-kf-reference.mjs --verify
```

前两步要求本地有原安装树及已安装的 `agent-app` TypeScript 包。第一步拒绝覆盖已有快照；第二步核对原始版本后补齐客户端和共享模块，保护其他已有内容。更新前应先保存旧快照，明确来源，再对比清单。不要将脱敏参考文件直接部署到服务中。

对于本地已有的早期业务源码快照，可用 `node scripts/export-kf-reference.mjs --append-vendors` 补入 ThirdParty。该命令先校验已有快照，保留全部已有记录和字节；对新文件采用独占创建，遇到同路径已有内容或版本变化会拒绝覆盖。依赖范围规则在 `scripts/kf-vendor-policy.mjs`。

内容覆盖和字节校验见 [client-verification-20261029.json](client-verification-20261029.json)。启动审计及安装树中可观察到的精确依赖版本见 [client-startup-audit-20261029.json](client-startup-audit-20261029.json)。源码与资源校验通过不等于独立启动验收通过，审计中的 `independentStartupVerified` 当前为 `false`。

重新生成只读启动审计：

```sh
node scripts/audit-kf-client-startup.mjs --docker --no-license --output kf-reference/client-startup-audit-20261029.json
```

审计不会启动 KF、修改原安装文件或使用现场业务数据；Docker 检查只读取引擎状态。机器没有原安装包时，无法重新证明原包覆盖范围，报告会明确标识；完整历史结果保留在仓库中。
<!-- end -->
<!-- end -->
