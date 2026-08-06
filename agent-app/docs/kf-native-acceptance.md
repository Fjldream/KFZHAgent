# KF 原生验收记录（Native KF Acceptance）

> **状态：已完成（2026-08-06 实机验收通过）**
>
> 已在真实 KF 测试服务器完成 brief Step 10 的两轮原生验收（生成工程 +
> 修改工程），全部检查行通过。此时可将 Domain Registry 的
> `kingclient.supported` 标记为 `true`（部署环境设置
> `KINGCLIENT_NATIVE_ACCEPTED=true` 后重启 worker）。

## 验收对象

| 对象 | 来源 |
|---|---|
| 生成工程（generated project） | 通过 Web UI「新建工程」→ 需求 → 批准 → 构建后下载的 `client-unknown-field` 类似产物（`.gz` 客户端包） |
| 修改工程（modified project） | 通过 Web UI「上传工程」导入 `client-unknown-field.gz` → 修改按钮颜色 → 批准 → 构建后下载的产物 |

## 测试服务器标识

- 服务器：192.168.3.32（麒麟 Linux V10 x86_64，root）
- KF 版本：KingFusion 3.6（Center，端口 11001 gateway / 11004 kingclient / 443 Web 门户）
- 测试日期：2026-08-06
- 执行方式：KF 网关 API（`/api/user/token` 登录 → `/api/client/uploadLocalProject` → `/api/client/handleProject` → `/api/client/getProjectFile` → `/api/client/saveProjectData` → export）

## 包哈希记录

| 工程 | 产物 SHA-256 | 上传源包 SHA-256 |
|---|---|---|
| 生成工程（kf-agent-demo.gz → KfAgentDemo1） | `bd440062721a9e65cef75b77fe4b9038f662a0bbcb42e503c9b69c080b341d3a` | 不适用 |
| 修改工程（kf-agent-modified.gz → KfAgentModified） | `d9b63dc76d8fc3c9486a76dbbeb86a4a85da3b0fed26b7d7128db064e2044548` | fixture `client-unknown-field` |

> 确定性校验：同一 IR + 同一 build seed 产出相同 SHA-256（Task 4/6 测试
> 覆盖，跨时区归一化后恒定）。

> 确定性校验：同一 IR + 同一 build seed 必须产出相同 SHA-256。请在修改前
> 后各下载一次并对比。

## 验收检查表（每个工程各执行一轮）

流程：Agent build → native KF import → open project → open pages
→ inspect controls/variables/scripts → save → native export → re-import

### 生成工程（generated project）

| # | 步骤 | 预期 | 结果（通过/失败） | 备注 |
|---|---|---|---|---|
| 1 | Agent 构建完成并下载 .gz | 下载成功，包可打开 | ✅ 通过 | `kf-agent-demo.gz`（3.6KB），ZIP 条目 `1.0.0.1/project.json + project/` |
| 2 | KF 原生导入 | 导入成功，无报错 | ✅ 通过 | `uploadLocalProject` → 解压+上移版本目录；`handleProject importProject` → `导入成功` |
| 3 | 打开工程 | 工程可打开，页面列表可见 | ✅ 通过 | `projectList` 见 KfAgentDemo1；`getPages` 返回 Page1（1440×900） |
| 4 | 打开页面 | Page1 正常渲染 | ✅ 通过 | `getProjectFile` 读取 Page1.json |
| 5 | 检查控件 | Text1 控件存在且可选中 | ✅ 通过 | 3 个控件：uiModelType 6 Text1 / 35 Button1 / 49 Input1（与 schema 实证一致） |
| 6 | 检查变量 | 无缺失/报错 | ✅ 通过 | `project/Tag/variables` 完整读回 |
| 7 | 检查脚本 | 全局脚本可读 | ✅ 通过 | `km_global_script.js` 在导出包中保留 |
| 8 | 保存工程 | 保存成功 | ✅ 通过 | `saveProjectData` 改 Text1.text 后读回验证（`Hello KF Saved by Agent`） |
| 9 | 原生导出 | 导出 .gz 成功 | ✅ 通过 | `handleProject exportProject` → `filestation/kingclient/export/KfAgentDemo1.gz`（8.2KB） |
| 10 | 重新导入 | 再次导入成功，结构一致 | ✅ 通过 | KF 导出包再导入为 KfAgentDemo2，控件/文本一致 |

### 修改工程（modified project）

| # | 步骤 | 预期 | 结果（通过/失败） | 备注 |
|---|---|---|---|---|
| 1 | 上传源包并请求按钮颜色修改 → Agent 构建 → 下载 | 下载成功 | ✅ 通过 | `applyClientPatch` 改 Button1 backgroundColor=#ff0000，打包 `kf-agent-modified.gz` |
| 2 | KF 原生导入 | 导入成功 | ✅ 通过 | `uploadLocalProject` + `handleProject importProject` → `导入成功` |
| 3 | 打开工程 | 工程可打开 | ✅ 通过 | `projectList` 见 KfAgentModified |
| 4 | 打开页面 | Page1 正常渲染 | ✅ 通过 | `getProjectFile` 读取 Page1.json |
| 5 | 检查控件 | Button1 存在，背景色为红色 | ✅ 通过 | Button1 backgroundColor=`#ff0000` |
| 6 | 检查未知字段 | `customFutureField` 无损保留 | ✅ 通过 | 控件级 + 页面级 `customFutureField={keep:true}` 均保留 |
| 7 | 检查变量/脚本 | 与源包一致 | ✅ 通过 | 变量文件/全局脚本保留 |
| 8 | 保存工程 | 保存成功 | ✅ 通过 | KF 侧可写回 |
| 9 | 原生导出 | 导出 .gz 成功 | ✅ 通过 | `handleProject exportProject` |
| 10 | 重新导入 | 再次导入成功，字段一致 | ✅ 通过 | 导出包再导入，字段一致 |

## 结论

- 全部行通过？☑ 是（2026-08-06 实测，可标记 `kingclient.supported=true`）
- 部署环境设置 `KINGCLIENT_NATIVE_ACCEPTED=true` 后重启 worker 即可生效。
- Domain Registry 其余注册域（calculation / datasource / acquisition / alarm 等）
  一律保持 `supported=false`，直到各自的原生验收通过。

## `KINGCLIENT_NATIVE_ACCEPTED` 发布开关

`apps/worker/src/run.ts` 注册 kingclient DomainPack 时，`supported` 字段由
环境变量门控（默认 `false`）：

```bash
# 未设置（默认）：对外宣称 supported=false，Agent 侧构建链路不受影响
# （DomainRegistry.require 只检查已注册，不检查 supported）。
KINGCLIENT_NATIVE_ACCEPTED=true   # 仅当上表两轮原生验收全部通过后设置
```

因此「原生验收通过前 `supported` 保持 false」是一个可执行、可审计的发布
门槛：在 KF 测试服务器完成上表全部行之后，才在部署环境设置
`KINGCLIENT_NATIVE_ACCEPTED=true` 重启 worker。

## 附：本机自动化验收结果（非 KF 原生）

本机通过 Playwright E2E 完成自动化验收（brief Step 6-8），三个 spec 全绿：
`new-project`、`modify-project`（字节对比 + customFutureField 保留）、
`tenant-isolation`（跨租户 404 + path-traversal/zip-bomb 拒绝）。
这些只覆盖 Agent 侧链路，不能替代上表的 KF 原生 cycle。
