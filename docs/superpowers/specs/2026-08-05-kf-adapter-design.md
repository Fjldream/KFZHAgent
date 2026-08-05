# KingFusion 客户端工程生成 Agent 设计

日期：2026-08-05
状态：待用户审查（v2：公司侧 agent 服务 + 客户侧适配服务）

## 1. 背景与目标

**产品**：亚控科技 KingFusion 3.6（SP4）管控一体化平台，部署于麒麟 V10 x86_64（例：192.168.3.32），Center/Node 同机架构，工程数据以 JSON 文件存储于 `sdb/<solutionGUID>/`。

**目标**：落地一个 **agent 服务（部署在公司侧）**，通过自然语言生成 KingFusion **客户端工程**（工程、页面与控件、工程变量 Tag、全局/事件脚本）。agent 服务可**配置客户侧 IP**，指向不同客户的 KingFusion 环境进行开发。第一版**不跑数据流**：不创建 IO 设备/数据源、不发布运行，仅做配置态。

**交付形态**：两个独立部署的 Node.js 程序：
1. `kf-adapter`（客户侧）：部署在 KingFusion 服务器上，封装 KF 的 HTTP API 为领域化 REST 接口
2. `agent-service`（公司侧）：LLM 编排（自然语言 → 工具调用），管理客户配置，调用各客户机的 `kf-adapter`

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

## 3. 总体架构

```
┌─ 公司侧 ─────────────────────────────────────────┐
│  agent-service（Node.js，独立部署）                │
│   · LLM 编排：自然语言 → tool-calling → 工具调用    │
│   · 客户配置管理：{客户名 → 客户机 IP:端口}          │
│   · KF 领域工具集（工程/页面/变量/脚本）             │
└──────────────┬───────────────────────────────────┘
               │ HTTP（按所选客户 IP/端口）
┌──────────────▼───────────────────────────────────┐
│  客户环境（IP 可配置，例 192.168.3.32）             │
│  kf-adapter（Node.js，唯一与 KF 直接交互的程序）     │
│   · 领域化 REST API（工程/页面/变量/脚本）            │
│   · 持有 KF 凭据，封装认证与 token 刷新              │
│   · 确定性渲染器：页面描述 DSL → KF 页面 JSON        │
└──────────────┬───────────────────────────────────┘
               │ HTTP 11001
┌──────────────▼───────────────────────────────────┐
│  KingFusion 3.6 gateway → 微服务 → sdb             │
└──────────────────────────────────────────────────┘
```

**决策**：
- 页面生成采用「高层描述 DSL + 确定性渲染器」——LLM 只输出结构化页面描述（控件类型枚举 + 语义属性），由渲染器代码保证 KF 页面 JSON 合法（KF 无校验接口，LLM 直出 JSON 试错成本不可接受）
- LLM 编排采用**自研轻量 tool-calling 循环**：不引入 LangChain 等框架，用 OpenAI 兼容协议直连国内大模型（DeepSeek/通义/豆包等可配 `base_url`），零第三方运行时依赖、可控可测
- `kf-adapter` 是唯一直接接触 KF API 的程序，客户侧凭据不离开客户环境

## 4. kf-adapter 设计（客户侧）

### 4.1 技术栈与运行

- Node.js ≥ 18（KF 服务器自带 `env/linux_x64/node` v18.20.3，零额外依赖）
- 仅使用 Node 内置模块：`http`、`crypto`、`fs`、`fetch`；不引入第三方 npm 依赖
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

**页面分组（第一版简化）**：页面创建到默认分组（`pageManager.json` 顶层分组），不暴露分组管理接口；`pageGroup` 字段在 DSL 中可选，传入时按名匹配已有分组，匹配不到则归入默认分组。

### 4.4 页面描述 DSL（agent-service ↔ kf-adapter 契约）

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

## 5. agent-service 设计（公司侧）

### 5.1 技术栈与运行

- Node.js ≥ 18，仅内置模块 + 可选 `dotenv`（环境变量加载）；LLM 调用用内置 `fetch`
- 独立 HTTP 服务，默认端口 `39001`（可配），公司内网使用
- 配置：环境变量 `LLM_BASE_URL`（默认 https://api.deepseek.com）、`LLM_API_KEY`、`LLM_MODEL`（默认 deepseek-chat，可换通义/豆包等 OpenAI 兼容端点）

### 5.2 客户配置管理

配置文件 `config/customers.json`（或环境变量注入），每客户一条：

```json
{
  "customers": [
    { "name": "demo", "adapterUrl": "http://192.168.3.32:39000", "adapterToken": "" }
  ]
}
```

- agent-service 启动时加载；提供 `GET/POST/PUT/DELETE /api/customers` 管理
- 请求指定 `customer` 名；未知客户返回 400

### 5.3 对外接口（公司侧）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/health` | 健康检查 |
| GET | `/api/customers` | 客户列表 |
| POST | `/api/customers` | 新增客户（IP/端口/token） |
| DELETE | `/api/customers/:name` | 删除客户 |
| POST | `/api/generate` | 主入口：`{customer, requirement}`（自然语言）→ 异步任务 |
| GET | `/api/tasks/:id` | 任务状态与结果（生成的工程/页面/变量清单） |
| GET | `/api/customers/:name/projects` | 指定客户的工程列表（回读） |

**任务模型**：`/api/generate` 创建任务立即返回 `taskId`；后台执行「LLM 规划 → 逐工具调用 kf-adapter → 回读校验 → 汇总结果」，状态 `pending/running/done/failed`。

### 5.4 LLM 编排（自研 tool-calling 循环）

1. 系统提示词：定义 agent 角色、可用工具清单（来自 kf-adapter 接口的语义化描述）、输出规范（页面 DSL 遵循 4.4）
2. 循环：请求模型（`tools` 参数，OpenAI 兼容 function calling）→ 若返回 tool_call 则执行对应 kf-adapter 调用 → 把结果回填 → 继续，直到模型输出最终结果（任务完成/需澄清）
3. 防呆：最大迭代轮数（默认 20）、每轮工具结果长度截断、失败重试策略（KF 瞬时错误退避重试 2 次）
4. 工具集（第一版，全部映射到 kf-adapter 接口）：
   - `create_project` / `update_project` / `list_projects`
   - `create_page`（body 为 DSL）/ `update_page` / `get_page` / `delete_page`
   - `add_variables` / `list_variables`
   - `set_global_script` / `get_global_script`
5. 工具结果统一包装 `{ok, data}`，tool-calling 把 `ok:false` 与 message 回喂给模型，由其决定修正动作

### 5.5 调用 kf-adapter

- HTTP 客户端封装：`request(customer, path, {method, body})`，自动带 `Authorization: Bearer <adapterToken>`（若配置）
- 超时与重试：连接超时 15s、读超时 60s；网络错误退避重试 2 次
- 响应契约校验：非 `{ok:true}` 视为工具失败，透出 message 给 LLM

## 6. 错误处理与校验

- KF 错误码：`errorCode === 0` 成功；非 0 透出 message；登录/刷新失败返回明确错误
- **回读校验**：kf-adapter 每个写操作后调用对应 GET 回读，比对关键字段（工程名/页面数/控件数/变量数），不一致报错——补偿 KF 无 schema 校验的缺陷
- 渲染器对 DSL 做静态校验（控件类型枚举、坐标/尺寸范围、变量引用格式），失败返回 400 与具体原因
- agent-service 任务失败：记录失败原因，任务可重试；LLM 循环中的工具错误交由模型自行修正，超过最大轮数判定失败

## 7. 测试策略

1. **API 探测脚本**（开发期）：对 KF 实测 login / createProject / createPage / addVariable / setGlobalScript 的请求与响应格式，固化到 `docs/kf-api-notes.md`，作为实现依据
2. **kf-adapter 单测**：渲染器 DSL → JSON 纯函数，覆盖全部控件类型与边界
3. **集成验证**：在 192.168.3.32 实测 kf-adapter 完整流程（建工程→建页面→加变量→写脚本→回读），并在 KF 开发运维中心（https://192.168.3.32）人工打开工程核验
4. **agent-service 端到端**：配置 demo 客户指向 192.168.3.32，`POST /api/generate` 输入自然语言生成示例工程，验证任务全链路
5. **LLM 编排测试**：mock kf-adapter 响应，验证 tool-calling 循环（工具失败→模型修正、超轮数→失败）

## 8. 部署

- 代码仓库：`/Users/fengjinlong/YK/KingFusion3.6`，两个子目录：`kf-adapter/`、`agent-service/`
- kf-adapter 部署：拷贝至客户机（如 `/opt/kf-adapter`），用 KF 自带 node 启动，`systemd`/`nohup` 守护；环境变量 `KF_BASE_URL`（http://127.0.0.1:11001）、`KF_USERNAME`、`KF_PASSWORD`、`ADAPTER_PORT`、`ADAPTER_TOKEN`(可选)
- agent-service 部署：公司侧服务器/开发机，环境变量 `LLM_BASE_URL`、`LLM_API_KEY`、`LLM_MODEL`、`AGENT_PORT`、`CUSTOMERS_CONFIG`(配置文件路径)

## 9. 第一版明确不做

- IO 采集工程、数据源配置、计算工程、告警工程
- 发布运行（`/api/ops/publish`）、运行态验证
- 多租户、多解决方案
- MCP Server 形态
- agent-service 的鉴权体系（公司内网 + 简单 token 起步，后续再加用户体系）
