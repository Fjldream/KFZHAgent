# kf-adapter 设计：KingFusion 客户端工程生成 Agent

日期：2026-08-05
状态：待用户审查

## 1. 背景与目标

**产品**：亚控科技 KingFusion 3.6（SP4）管控一体化平台，部署于麒麟 V10 x86_64（192.168.3.32），Center/Node 同机架构，工程数据以 JSON 文件存储于 `sdb/<solutionGUID>/`。

**目标**：开发一个 agent，通过自然语言生成 KingFusion **客户端工程**（工程、页面与控件、工程变量 Tag、全局/事件脚本）。第一版**不跑数据流**：不创建 IO 设备/数据源、不发布运行，仅做配置态。

**交付形态**：客户侧一个 Node.js 适配服务 `kf-adapter`（唯一开发的程序），部署在 KingFusion 服务器上，封装 KF 的 HTTP API 为领域化 REST 接口；公司侧由 agent harness（Reasonix）直接通过 HTTP 调用 `kf-adapter` 完成工程生产，不编写编排代码。

## 2. 已探明的关键事实（实证）

| 事实 | 证据 |
|---|---|
| KF 前端即 API 客户端，gateway(11001) 暴露约 200 个 API | `gateway/core/enums/enum_url.js` 完整路由表 |
| 工程全部为 JSON 文件 | `sdb/<GUID>/kingclient/<projectId>/` 下 `project.json` + `project/pageManager.json` + `project/page/*.json` 等 |
| 页面 JSON schema：`pageProperty` + `objects[]`，控件含 `uiModelType`、`linkMng`（事件脚本）、`sizePolicy` 等 | 现有工程 `page/AA.json` |
| 登录协议：`GET /api/user/getPublicKey` → RSA 公钥(spki) + `uuid`；`POST /api/user/login` 传 `{username, password, uuid}` | 实测：login 缺 uuid 报错；前端 `index-*.js` 显示 RSA-OAEP/SHA-256 + btoa |
| 客户端工程 API 齐全：`createProject/updateProject/deleteProject/handleProject/createPage/updatePage/saveProjectData/addVariable/editVariable/importVariable/addDataSource/createGroup/importPage/importPageBatch/batchUpdateModule/uploadLocalProject` | `enum_ClientUrl` |
| 计算/IO/告警/数据源工程同样有完整 CRUD API（第一版不使用） | `enum_CalculationUrl` 等 |
| KF 无对外 schema 校验接口，页面 JSON 错误只能打开页面观察 | 架构决策依据：渲染器必须确定性生成合法 JSON |

## 3. 架构

```
┌─ 公司侧 ────────────────────────────────┐
│  Agent harness（Reasonix）              │
│  自然语言需求 → 决策 → HTTP 调用          │
└──────────────┬──────────────────────────┘
               │ HTTPS/内网（白名单）
┌──────────────▼──────────────────────────┐
│  客户环境 192.168.3.32                  │
│  kf-adapter（Node.js，唯一开发的程序）     │
│   · 领域化 REST API（工程/页面/变量/脚本）  │
│   · 持有 KF 凭据，封装认证与 token 刷新     │
│   · 确定性渲染器：页面描述 DSL → KF JSON   │
└──────────────┬──────────────────────────┘
               │ HTTP 11001
┌──────────────▼──────────────────────────┐
│  KingFusion 3.6 gateway → 微服务 → sdb   │
└─────────────────────────────────────────┘
```

**决策**：页面生成采用「高层描述 DSL + 确定性渲染器」——LLM 只输出结构化页面描述（控件类型枚举 + 语义属性），由渲染器代码保证 KF 页面 JSON 合法（KF 无校验接口，LLM 直出 JSON 试错成本不可接受）。

## 4. kf-adapter 设计

### 4.1 技术栈与运行

- Node.js ≥ 18（KF 服务器自带 `env/linux_x64/node` v18.20.3，零额外依赖）
- 仅使用 Node 内置模块：`http`、`crypto`、`fs`、`fetch`（Node 18 内置）；不引入第三方 npm 依赖（与 Superpowers 零依赖原则一致，且免去客户环境装包）
- 监听端口：默认 `39000`（避开 KF 已用端口），可配置
- 访问控制：仅监听内网/绑定地址，可选静态访问 token（环境变量 `ADAPTER_TOKEN`），KF 凭据经环境变量 `KF_USERNAME`/`KF_PASSWORD` 注入

### 4.2 KF 认证封装

1. 启动/首次调用时 `GET /api/user/getPublicKey` 取公钥与 uuid
2. 密码加密：`crypto.publicEncrypt({key: pem, padding: RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256'}, Buffer.from(password))` → base64
3. `POST /api/user/login` → 得到 `access_token`/`refresh_token`，缓存；过期用 refresh_token 刷新
4. 对 KF 的所有请求附带认证头（按 KF 前端实际使用的 header 格式，实现时从 gateway 日志/前端代码确认）

### 4.3 领域化 REST 接口（第一版）

前缀 `/api`。所有响应统一 `{ok: true, data} | {ok: false, error: {code, message}}`。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/health` | 健康检查（含 KF 连通性） |
| GET | `/projects` | 客户端工程列表 |
| POST | `/projects` | 创建工程 `{name, description, groupId?}` |
| GET | `/projects/:id` | 工程详情 |
| PUT | `/projects/:id` | 更新工程属性 |
| DELETE | `/projects/:id` | 删除工程 |
| POST | `/projects/:id/pages` | 创建页面（body = 页面描述 DSL） |
| GET | `/pages/:pageId` | 回读页面 KF JSON（校验用） |
| PUT | `/pages/:pageId` | 更新页面（body = 页面描述 DSL） |
| DELETE | `/pages/:pageId` | 删除页面 |
| POST | `/projects/:id/variables` | 添加变量 Tag（支持批量） |
| GET | `/projects/:id/variables` | 变量列表（校验用） |
| PUT | `/variables/:varId` | 更新变量 |
| DELETE | `/variables/:varId` | 删除变量 |
| PUT | `/projects/:id/globalscript` | 设置全局脚本 |
| GET | `/projects/:id/globalscript` | 回读全局脚本 |

（实现时按 KF 实际 API 请求/响应格式对齐字段名；控件级事件脚本通过页面 DSL 内联。）

**页面分组（第一版简化）**：页面创建到默认分组（`pageManager.json` 顶层分组），不暴露分组管理接口；`pageGroup` 字段在 DSL 中可选，传入时按名匹配已有分组，匹配不到则归入默认分组。

### 4.4 页面描述 DSL（agent ↔ 渲染器契约）

```json
{
  "name": "水泵站监控",
  "width": 1440, "height": 900,
  "background": "#0a1a2f",
  "titleBar": true,
  "controls": [
    { "type": "text",     "x": 40, "y": 30, "text": "1# 泵", "fontSize": 24, "color": "#ffffff" },
    { "type": "button",   "x": 40, "y": 120, "width": 120, "height": 48, "text": "启动",
      "event": { "onClick": "console.log('start');" } },
    { "type": "gauge",    "x": 300, "y": 120, "width": 260, "height": 200,
      "variable": "Pump1.Pressure", "min": 0, "max": 10 },
    { "type": "numeric",  "x": 300, "y": 60, "width": 140, "height": 40,
      "variable": "Pump1.Pressure", "unit": "MPa", "decimals": 2 }
  ]
}
```

渲染器职责：DSL → KF 页面 JSON（`pageProperty` + `objects[]`），补齐 `guid`、`uiModelType`、`sizePolicy`、`linkMng` 等内部字段；控件类型为枚举，未知类型直接报错而非猜测。

### 4.5 第一版控件清单

实现阶段从 KF 前端代码/现有工程探测每种控件的 `uiModelType` 与必填 schema 后锁定。计划覆盖：

- 文本（text）
- 按钮（button，含 onClick 事件）
- 数值显示（numeric，绑定变量）
- 开关/指示灯（switch/indicator）
- 仪表盘（gauge）
- 趋势图（trend）
- 图片（image）
- 页面跳转/弹窗（navigation/dialog）
- 基础形状/矩形框（rect）

每种控件在渲染器内为独立模板函数，可单测。

### 4.6 变量 Tag

- 通过 `addVariable`/`editVariable`/`deleteVariable` 操作客户端工程内变量
- 变量字段对齐 KF `Tag` 目录与前端 `variable` API 的实际 schema（实现时探测）
- 控件 DSL 中 `variable` 字段引用已建 Tag 名，渲染器负责建立绑定

### 4.7 脚本

- 全局脚本：`PUT /projects/:id/globalscript` 写入 `km_global_script.js`（`setGlobalScript` API）
- 页面/控件事件脚本：DSL 控件 `event` 字段内联，渲染器写入 `linkMng`（事件名如 `onClick`）

## 5. 错误处理与校验

- KF 错误码：`errorCode === 0` 成功；非 0 透出 message；登录/刷新失败返回明确错误
- **回读校验**：每个写操作后调用对应 GET 回读，比对关键字段（工程名/页面数/控件数/变量数），不一致报错——补偿 KF 无 schema 校验的缺陷
- 渲染器对 DSL 做静态校验（控件类型枚举、坐标/尺寸范围、变量引用格式），失败返回 400 与具体原因

## 6. 测试策略

1. **API 探测脚本**（开发期）：对 KF 实测 login / createProject / createPage / addVariable / setGlobalScript 的请求与响应格式，固化到 `docs/kf-api-notes.md`，作为实现依据
2. **渲染器单测**：DSL → JSON 纯函数，覆盖全部控件类型与边界
3. **集成验证**：在 192.168.3.32 实测 kf-adapter 完整流程（建工程→建页面→加变量→写脚本→回读），并在 KF 开发运维中心（https://192.168.3.32）人工打开工程核验
4. **harness 端到端**：通过 Reasonix 调用 kf-adapter 接口生成一个示例工程

## 7. 部署

- 代码仓库：`/Users/fengjinlong/YK/KingFusion3.6`（kf-adapter 为独立子目录 `kf-adapter/`）
- 部署：将 `kf-adapter/` 拷贝至 192.168.3.32（如 `/opt/kf-adapter`），用 KF 自带 node 启动，`systemd`/`nohup` 守护
- 配置：环境变量 `KF_BASE_URL`（http://127.0.0.1:11001）、`KF_USERNAME`、`KF_PASSWORD`、`ADAPTER_PORT`、`ADAPTER_TOKEN`(可选)

## 8. 第一版明确不做

- IO 采集工程、数据源配置、计算工程、告警工程
- 发布运行（`/api/ops/publish`）、运行态验证
- 多租户、多解决方案
- MCP Server 形态
