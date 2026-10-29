<!-- modified by jinlong.feng at 2026-10-29 KF源码精简入库 -->
# KF 原生源码阅读快照

日期：2026-10-29。来源：本地 `KingFusion3.6_Center/` 与 `KingFusion3.6_Node/` 安装树。快照内每个路径都与来源目录相同，只增加 `kf-reference/` 前缀。它记录本地代码，不能证明与任何服务器部署版本相同。

先读 [运行逻辑与定位方法](../docs/KF_RUNTIME_GUIDE.md)。目录内保留的一方 JS、HTML、CSS、Vue、包清单及相关源文件用于研究编辑器、运行态、工程存储、服务路由与运维命令。重复服务保留各自版本，不能推断 Center、Node 两份文件一定相同。

## 范围

- `KingFusion3.6_Center/kingdevopscenter/kingclient/exe/`：原生开发态编辑器及其后端。
- `KingFusion3.6_Center/kingexedb/kingclient/exe/`：Center 随包的运行态客户端及其后端。
- `KingFusion3.6_Node/kingexedb/kingclient/exe/`：Node 运行态客户端及其后端。
- 两侧 `common/`：工程、鉴权、日志等共享模块。
- Center 的 `kingopsserver`、`gateway`、`kingoauth`、`kingcalculation` 等：各服务可获得的一方源码。
- Node 的 `kingopsproxy/exe/kingopsagent/exe/`：注册、部署、轮询、命令执行与冗余协调。

## 有意排除

不包含 `node_modules`、安装工具、Node/Chrome/Redis/Nginx 二进制、DLL/EXE、数据库、证书、私钥、日志、缓存、上传文件、业务工程、现场副本、压缩包、构建备份、第三方控件包、HT3D 编辑器大依赖、预置图库和网关离线帮助站。实例配置 JSON 不上传，服务源码中的配置读取代码保留。

部分原生服务只有二进制实现，仓库只能保留其可获得的 JS 适配层。排除图形资源、第三方 CSS/JS 与配置之后，页面资源链也不完整，不能仅靠 `npm install` 就还原完整 KF 安装环境。

## 脱敏

对源码语法树中的口令、会话密钥、私钥及 API 凭据字面量做替换，值统一为 `KF_REFERENCE_REDACTED`。有替换的文件先格式化，再加本次修改首尾注释；其余文件保持原始字节。原本通过运行配置或参数传入的值保持动态读取。

`manifest.json` 列出所有 3,203 个源文件、字节数、快照 SHA-256、原始 SHA-256 和脱敏数量。31 个文件、36 处字面量被替换。JSON 清单不保存凭据原值。来源目录不被修改。

## 校验与更新

```sh
node scripts/export-kf-reference.mjs --verify
```

校验读取清单和快照，不读取本机 KF 数据库，不发送网络请求，不需要安装第三方包。

重新导出使用 `node scripts/export-kf-reference.mjs --export`，要求本地有原安装树及已安装的 `agent-app` TypeScript 包。导出器拒绝覆盖已有快照，也不会自动删除旧目录；更新前应先保存旧快照，明确新版本来源，再在独立工作目录导出并比较清单。不要将脱敏参考文件直接部署到服务中。

本次交接检查：3,203 个快照文件哈希通过；3,203 个本地来源文件的原始哈希保持一致；导出工具 4 项测试、运维前端 73 项测试通过。将待提交树导出到没有依赖、原 KF 安装和本机 `.env` 的干净目录后，独立执行 `--verify` 也通过。此检查不等于原生 KF 服务运行验收。
<!-- end -->
