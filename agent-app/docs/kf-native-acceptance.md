# KF 原生验收记录（Native KF Acceptance）

> **状态：待 KF 测试服务器执行（发布门槛）**
>
> 本机（macOS 无 KF 开发环境）无法执行 KF 原生导入/导出。本文件是 brief
> Step 10 的记录模板与检查表；在真实 KF 测试服务器上按行填写后，只有当
> 每一行都通过时才可将 Domain Registry 的 `kingclient.supported` 标记为
> `true`。

## 验收对象

| 对象 | 来源 |
|---|---|
| 生成工程（generated project） | 通过 Web UI「新建工程」→ 需求 → 批准 → 构建后下载的 `client-unknown-field` 类似产物（`.gz` 客户端包） |
| 修改工程（modified project） | 通过 Web UI「上传工程」导入 `client-unknown-field.gz` → 修改按钮颜色 → 批准 → 构建后下载的产物 |

## 测试服务器标识

- 测试服务器构建标识（build identifier）：______（填写构建号/镜像 tag）
- KF 版本：______
- 测试日期：______
- 执行人：______

## 包哈希记录

| 工程 | 产物 SHA-256 | 上传源包 SHA-256 |
|---|---|---|
| 生成工程 | ______ | 不适用 |
| 修改工程 | ______ | ______ |

> 确定性校验：同一 IR + 同一 build seed 必须产出相同 SHA-256。请在修改前
> 后各下载一次并对比。

## 验收检查表（每个工程各执行一轮）

流程：Agent build → native KF import → open project → open pages
→ inspect controls/variables/scripts → save → native export → re-import

### 生成工程（generated project）

| # | 步骤 | 预期 | 结果（通过/失败） | 备注/截图占位 |
|---|---|---|---|---|
| 1 | Agent 构建完成并下载 .gz | 下载成功，包可打开 | | |
| 2 | KF 原生导入 | 导入成功，无报错 | | |
| 3 | 打开工程 | 工程可打开，页面列表可见 | | |
| 4 | 打开页面 | Page1 正常渲染 | | 截图：______ |
| 5 | 检查控件 | Text1 控件存在且可选中 | | |
| 6 | 检查变量 | 无缺失/报错 | | |
| 7 | 检查脚本 | 全局脚本可读 | | |
| 8 | 保存工程 | 保存成功 | | |
| 9 | 原生导出 | 导出 .gz 成功 | | |
| 10 | 重新导入 | 再次导入成功，结构一致 | | 截图：______ |

### 修改工程（modified project）

| # | 步骤 | 预期 | 结果（通过/失败） | 备注/截图占位 |
|---|---|---|---|---|
| 1 | 上传源包并请求按钮颜色修改 → Agent 构建 → 下载 | 下载成功 | | |
| 2 | KF 原生导入 | 导入成功 | | |
| 3 | 打开工程 | 工程可打开 | | |
| 4 | 打开页面 | Page1 正常渲染 | | 截图：______ |
| 5 | 检查控件 | Button1 存在，背景色为红色 | | |
| 6 | 检查未知字段 | `customFutureField` 无损保留 | | |
| 7 | 检查变量/脚本 | 与源包一致 | | |
| 8 | 保存工程 | 保存成功 | | |
| 9 | 原生导出 | 导出 .gz 成功 | | |
| 10 | 重新导入 | 再次导入成功，字段一致 | | 截图：______ |

## 结论

- 全部行通过？□ 是（可标记 `kingclient.supported=true`） □ 否
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
