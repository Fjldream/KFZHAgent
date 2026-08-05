# KingFusion 客户端工程生成 Agent 设计

日期：2026-08-05
状态：待用户审查（v4：页面 JSON 生成机制实证 + 控件 schema 已提取）

## 1. 背景与目标

**产品**：亚控科技 KingFusion 3.6（SP4）管控一体化平台，部署于麒麟 V10 x86_64（例：192.168.3.32），Center/Node 同机架构，工程数据以 JSON 文件存储于 `sdb/<solutionGUID>/`。

**目标**：落地一个 **agent 服务（部署在公司侧）**，通过**多轮自然语言对话**生成 KingFusion **客户端工程**（工程、页面与控件、工程变量 Tag、全局/事件脚本），并把生成的工程**展示给客户**。agent 服务可**配置客户侧 IP**，指向不同客户的 KingFusion 环境进行开发；生成的工程由大模型通过**静态验证**确认配置完整合法。第一版**不跑数据流**：不创建 IO 设备/数据源、不发布运行，仅做配置态。

**核心可行性结论（已实证）**：KF **没有控件级 API**（不存在"传按钮参数返回 JSON"的接口，页面 JSON 组装逻辑在前端编辑器），但 `saveProjectData` 是**通用"写工程文件"接口**——请求体 JSON 原样序列化、直接写入对应工程文件（零校验）。因此 agent 的页面生成路径为：**渲染器按控件模板库组装完整页面 JSON → saveProjectData 落盘 → getProjectFile 回读验证**。

**交付形态**：两个独立部署的 Node.js 程序：
1. `kf-adapter`（客户侧）：部署在 KingFusion 服务器上，封装 KF API 为领域化 REST 接口；含确定性渲染器（DSL → KF 页面 JSON + 预览 HTML）与从开发态代码提取的静态素材库
2. `agent-service`（公司侧）：LLM 编排（多轮会话 + tool-calling），客户配置管理，自带 Web 聊天界面

**素材来源**：客户提供的开发态代码本地副本 `KingFusion3.6_Center/`（已 gitignore，不入仓库），控件定义库位于 `kingclient/exe/public/javascripts/Common/Graphic/UI/kmui_*.js`。

## 2. 已探明的关键事实（实证）

| # | 事实 | 证据 |
|---|---|---|
| 1 | KF 前端即 API 客户端，gateway(11001) 暴露约 200 个 API | `gateway/core/enums/enum_url.js` |
| 2 | 工程全部为 JSON 文件存储 | `sdb/<GUID>/kingclient/<projectId>/` 下 `project.json` + `project/page/*.json` 等 |
| 3 | 登录协议：`getPublicKey` → RSA-OAEP/SHA-256 加密密码 + `uuid` → `login` → `access_token`；`Authorization: Bearer` 认证 | 实测登录成功；前端 `index-*.js` |
| 4 | 客户端工程 CRUD API 齐全且实测打通：`createProject`(需 name)/`createGroup`(需 parentId=pageTree.id)/`createPage`(需 groupId)/`getProjectConfigureTree`/`getPages`/`deleteProject`(guid 传数组) | 实测全链路（建工程→分组→页面→回读→删除） |
| 5 | **`saveProjectData` 是通用写工程文件接口**：`POST /api/client/saveProjectData?projectInfo={"name","type","guid"}`，body=文件 JSON，服务端 `fs.writeFile` 零校验直接落盘；**type 为文件类型枚举**：3→`project/page/<name>.json`、4→`project/Tag/<name>.json`、2/5/9/14/15→`project/<name>.json`、7→config、11/12/13→图形模型等 | 实测闭环：createPage→saveProjectData(type=3, body 含 Button)→磁盘生成 `FINAL.json`→getProjectFile 回读 objects=[Button:35] 一致；源码 `kingclient/lib/services/projectMng/index.js`、`core/utils/getFilePath.js` |
| 6 | `saveProjectData` 特殊分支：type=3 带 `operation=add` 时服务端 `createPageModel` 生成默认页面模板；`edit` 读旧文件改 name 写回；不带 operation 直接写 body | 源码同上 |
| 7 | **uiModelType 完整枚举（0-53）**：RADIO 0/CHECKBOX 1/COMBOBOX 3/TEXTBOX 6/RICHTEXT 7/SCALE 8/LIST 9/TREEVIEW 11/GANTT 30/TABLE 31/NAVMENU 34/**BUTTON 35**/INPUT 38/IMAGE 41/CUSTOMMODEL 42/FACTORYCALENDAR 43/SELECT 44/TABS 47/**SWITCH 48**/INPUTNUMBER 49/REPORT 53 等（注：`BUTTON:2` 与 `BUTTON:35` 重复键，后者覆盖，实际=35） | `kmui_glabolvar.js` 的 `kmUIModeTypeEnum`；页面 JSON 实测按钮=35 |
| 8 | **控件定义库**：`kingclient/exe/public/javascripts/Common/Graphic/UI/kmui_*.js` 共 49 个控件类，每个构造器 `this.xxx=默认值` 即控件默认属性模板；公共基础字段在 `KMUIModelBase`（lock/visible/enable/name/comment/width/height 等） | 本地开发态代码副本 |
| 9 | 页面 JSON 结构：`pageProperty`(尺寸/背景/标题栏等) + `objects[]`(控件，31+ 字段) + `version/showLayer/guid/objectType` 等顶层 | 现有工程 `page/AA.json`（Button 31 字段全量） |
| 10 | **无 gauge(仪表盘)/trend(趋势图) 原生控件枚举**——工业仪表类控件需以 CUSTOMMODEL(42)/图形模型实现，第一版不做 | 枚举 7 对照 |

## 3. 总体架构

```
┌─ 公司侧 ───────────────────────────────────────────┐
│  agent-service（Node.js，独立部署，自带 Web 界面）      │
│   · 多轮会话管理（历史进上下文）                       │
│   · LLM 编排：先设计后实施 + tool-calling + 静态验证    │
│   · 客户配置管理：{客户名 → 客户机 IP:端口}             │
│   · Web 界面：对话 + 工程结构 + 页面预览展示            │
└──────────────┬─────────────────────────────────────┘
               │ HTTP（按所选客户 IP/端口）
┌──────────────▼─────────────────────────────────────┐
│  客户环境（IP 可配置，例 192.168.3.32）               │
│  kf-adapter（Node.js，唯一与 KF 直接交互的程序）        │
│   · 领域化 REST API（工程/页面/变量/脚本/预览）          │
│   · 持有 KF 凭据，封装认证与 token 刷新                │
│   · 确定性渲染器：DSL → KF 页面 JSON（模板库组装）      │
│   · 静态素材库：控件模板 + uiModelType 枚举 + 页面骨架   │
└──────────────┬─────────────────────────────────────┘
               │ HTTP 11001
┌──────────────▼─────────────────────────────────────┐
│  KingFusion 3.6 gateway → kingclient → sdb/ 工程文件  │
└────────────────────────────────────────────────────┘
```

**关键决策**：
- **页面生成**：高层描述 DSL + 确定性渲染器。实证依据：KF 无控件级 API、无 schema 校验，`saveProjectData` 零校验落盘——页面 JSON 合法性完全由渲染器保证，LLM 直出 JSON 试错成本不可接受。渲染器基于从开发态代码提取的**控件模板库**组装（不是手写 schema）
- **LLM 编排**：单 agent 结构化 tool-calling 循环 + 会话管理 + **先设计后实施**（需求 → 画面设计方案与预览 → 客户确认门 → 实施 → 静态验证 → 展示）。该任务为「顺序依赖 + 有限迭代」线性拓扑，graph 框架收益有限；单 agent 弱点通过「先设计确认、每步回读校验、硬性护栏」弥补。演进信号（多工程并行、审批流、跨天记忆）出现后再引入 graph，工具接口不变
- **LLM 模型**：DeepSeek（`deepseek-chat`），OpenAI 兼容协议，`LLM_BASE_URL`/`LLM_API_KEY`/`LLM_MODEL` 可配
- **验证**：第一版静态验证（不发布、不碰运行态），见 §6
- `kf-adapter` 是唯一直接接触 KF API 的程序，客户侧凭据不离开客户环境

## 4. kf-adapter 设计（客户侧）

### 4.1 技术栈与运行

- Node.js ≥ 18（KF 服务器自带 `env/linux_x64/node` v18.20.3，零额外依赖）
- 仅使用 Node 内置模块：`http`、`crypto`、`fs`、`fetch`；不引入第三方 npm 依赖
- 监听端口：默认 `39000`（避开 KF 已用端口），可配置
- 访问控制：仅监听内网/绑定地址，可选静态访问 token（环境变量 `ADAPTER_TOKEN`），KF 凭据经环境变量 `KF_USERNAME`/`KF_PASSWORD` 注入

### 4.2 内部模块结构

```
kf-adapter/
├─ schema/                 # 静态素材库（从开发态代码提取的配置，纯数据）
│  ├─ uiModelType.json     # ② 控件类型枚举（语义名 ↔ uiModelType）
│  ├─ control-templates/   # ① 控件模板：每控件一个 JSON（默认属性全集）
│  ├─ base-fields.json     # KMUIModelBase 公共字段
│  └─ page-skeleton.json   # ③ 页面骨架（pageProperty 默认 + 顶层结构）
├─ renderer/               # DSL → KF 页面 JSON 纯函数 + 静态校验
├─ preview/                # DSL → 预览 HTML（自包含单文件）
├─ kf-client/              # ④ KF API 封装（登录/token/工程/页面/变量/写文件）
├─ server/                 # 领域化 REST 接口
└─ index.js                # 入口
```

### 4.3 KF 认证封装（实测格式）

1. `GET /api/user/getPublicKey` → `data.publicKey`(PEM spki) + `data.uuid`
2. 密码加密：`crypto.publicEncrypt({key, padding: RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256'}, Buffer.from(password))` → base64
3. `POST /api/user/login` body `{username, password(密文), uuid}` → `data.access_token`/`refresh_token`，缓存并刷新
4. 所有请求带 `Authorization: Bearer <token>`；登录失败连续 5 次锁定 10 分钟（失败需退避）

### 4.4 页面 JSON 生成机制（核心）

`saveProjectData` 写文件接口（实测格式）：

```
POST /api/client/saveProjectData?projectInfo=<URL编码 JSON>
  projectInfo = {"name":"<文件名>", "type":3, "guid":"<工程id>"}
  body = 完整页面 JSON（pageProperty + objects[] + 顶层字段）
  → 服务端 fs.writeFile("project/page/<name>.json", JSON.stringify(body))  // 零校验
```

- type=3（页面）；带 `operation=add` 可用服务端 `createPageModel` 生成默认骨架，再以 `operation=edit` 或直接写 body 覆盖为渲染结果
- 变量 Tag 同理走 type=4（`project/Tag/<name>.json`）
- 回读：`GET /api/client/getProjectFile?projectInfo=<URL编码 JSON>` 验证

### 4.5 渲染器（DSL → KF 页面 JSON）

1. **模板合并**：控件模板（schema/control-templates）+ DSL 覆盖值（坐标/尺寸/文案/绑定）+ 生成运行时字段（`guid`/`sizePolicy`/`linkMng`）
2. **页面骨架**：schema/page-skeleton 提供 `pageProperty` 默认 + 顶层结构，DSL 覆盖 name/尺寸/背景
3. **静态校验**：控件类型在枚举内（未知报 400）、坐标/尺寸范围、变量引用格式、必填字段齐全
4. **输出**：KF 页面 JSON（提交）+ 预览 HTML（展示）
5. 纯函数、可单测；控件模板为配置，新增控件只加模板不动逻辑

### 4.6 页面描述 DSL（agent-service ↔ kf-adapter 契约）

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
    { "type": "numeric",  "x": 300, "y": 60, "width": 140, "height": 40,
      "variable": "Pump1.Pressure", "unit": "MPa", "decimals": 2 }
  ]
}
```

### 4.7 第一版控件清单（基于实证枚举修正）

| DSL 类型 | uiModelType | 控件 | 说明 |
|---|---|---|---|
| text | 6 | TEXTBOX | 文本 |
| button | 35 | BUTTON | 按钮（含 onClick 事件） |
| input | 38 | INPUT | 输入框 |
| numeric | 49 | INPUTNUMBER | 数字显示/输入（绑定变量） |
| switch | 48 | SWITCH | 开关 |
| checkbox | 1 | CHECKBOX | 复选 |
| radio | 0 | RADIO | 单选 |
| select | 44 | SELECT | 下拉选择 |
| image | 41 | IMAGE | 图片 |
| tabs | 47 | TABS | 标签页 |
| table | 31 | TABLE | 表格 |
| richtext | 7 | RICHTEXT | 富文本 |
| gantt | 30 | GANTT | 甘特图 |
| spacer | 13/14 | H/V SPACER | 布局占位 |

> **gauge/trend 修正**：原生枚举无仪表盘/趋势图，第一版不做；后续以 CUSTOMMODEL(42)/图形模型实现。页面跳转/弹窗通过事件脚本实现（`linkMng`），待实现时确认。

### 4.8 领域化 REST 接口（第一版）

前缀 `/api`，响应统一 `{ok, data} | {ok, error:{code,message}}`。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/health` | 健康检查（含 KF 连通性） |
| GET | `/projects` | 工程列表 |
| POST | `/projects` | 创建工程 `{name, description, groupId?}` |
| GET | `/projects/:id` | 工程详情 |
| PUT | `/projects/:id` | 更新工程属性 |
| DELETE | `/projects/:id` | 删除工程 |
| POST | `/pages/preview` | DSL → 预览 HTML（不落库） |
| POST | `/projects/:id/pages` | 创建页面（body = DSL）→ saveProjectData(type=3) 落盘 |
| GET | `/pages/:pageId` | 回读页面 KF JSON |
| PUT | `/pages/:pageId` | 更新页面（body = DSL，重渲染覆盖） |
| DELETE | `/pages/:pageId` | 删除页面 |
| POST | `/projects/:id/variables` | 添加变量 Tag（批量，type=4 写文件） |
| GET | `/projects/:id/variables` | 变量列表 |
| PUT | `/variables/:varId` | 更新变量 |
| DELETE | `/variables/:varId` | 删除变量 |
| PUT | `/projects/:id/globalscript` | 设置全局脚本 |
| GET | `/projects/:id/globalscript` | 回读全局脚本 |

页面分组第一版简化：创建到默认分组（`pageTree.id`），`pageGroup` 可选按名匹配。

### 4.9 变量 Tag 与脚本

- 变量：`addVariable`/`editVariable` API（前端格式已提取：`{id, content, projectId}`），或 type=4 写文件；schema 对齐 `project/Tag/*.json`（实现时确认）
- 全局脚本：`setGlobalScript` 写入 `km_global_script.js`
- 页面/控件事件：DSL `event` 内联 → 渲染器写入 `linkMng`（事件名如 `onClick`）

## 5. agent-service 设计（公司侧）

### 5.1 技术栈与运行

- Node.js ≥ 18，仅内置模块（`http`、`fs`、`fetch`）；零第三方运行时依赖
- 独立 HTTP 服务，默认端口 `39001`；配置（环境变量）：`LLM_BASE_URL`(默认 https://api.deepseek.com)、`LLM_API_KEY`、`LLM_MODEL`(默认 deepseek-chat)、`AGENT_PORT`、`CUSTOMERS_CONFIG`

### 5.2 客户配置管理

`config/customers.json`：`{customers:[{name, adapterUrl, adapterToken}]}`；启动加载，`GET/POST/DELETE /api/customers` 管理；请求指定 `customer` 名，未知 400。

### 5.3 对外接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/` | Web 聊天界面 |
| GET | `/health` | 健康检查 |
| GET/POST/DELETE | `/api/customers[/:name]` | 客户管理 |
| POST | `/api/sessions` | 创建会话 `{customer, title?}` |
| GET | `/api/sessions` / `/api/sessions/:id` | 会话列表 / 历史（消息+工程快照+预览+验证报告） |
| POST | `/api/sessions/:id/messages` | 发消息 → LLM 循环 → 回复 |
| DELETE | `/api/sessions/:id` | 删除会话 |

会话模型：每会话绑定客户；历史 + 工具调用 + 工程快照持久化到 `sdb/sessions/`（JSON 文件）。

### 5.4 LLM 编排（单 agent 结构化循环 + 会话管理）

**工作流（每个需求类消息）**：

```
客户需求 → ① 需求理解 → ② 画面设计（设计方案 + preview_page 预览）
        → ③ 设计确认门（回复客户，等确认/修改意见）
        → ④ 实施（create_project → create_page → add_variables → set_global_script）
        → ⑤ 静态验证（§6）→ ⑥ 结果展示（工程结构 + 预览 + 验证报告）
```

1. 系统提示词：agent 角色、工具清单（kf-adapter 接口语义化描述）、页面 DSL 规范（§4.6）、画面设计规范、静态验证规则（§6）
2. 多轮会话：完整历史（裁剪最近 N 条 + 工程快照摘要）
3. 先设计后实施（设计确认门）：第一轮输出画面设计方案（JSON：工程名/页面清单/每页控件设计/变量清单/脚本规划）+ `preview_page` 预览，**等客户确认后才实施**；修改意见进入设计迭代（≤3 轮）
4. 实施：确认后按方案顺序执行工具，每步结果回填
5. tool-calling 循环：`tools` 参数 → 执行 → 回填 → 直到输出结论或澄清
6. 防呆：最大迭代 20 轮、工具结果截断、KF 瞬时错误退避重试 2 次、每轮超时
7. 工具集：`create_project/update_project/list_projects`、`preview_page/create_page/update_page/get_page/delete_page`、`add_variables/list_variables`、`set_global_script/get_global_script`
8. 工具结果统一 `{ok, data}`，失败回喂模型修正

### 5.5 Web 界面

- 极简单页（原生 HTML/JS/CSS，无构建），agent-service 静态托管
- 会话列表/切换、消息输入、流式回复、客户选择、工程结构树、页面预览（iframe 嵌预览 HTML）、验证报告
- **设计确认交互**：展示设计方案 + 预览，「确认设计/提出修改」，未确认不实施

### 5.6 调用 kf-adapter

`request(customer, path, {method, body})`，自动带 `Authorization: Bearer <adapterToken>`；连接超时 15s/读超时 60s；网络错误退避重试 2 次；非 `{ok:true}` 视为工具失败透出 message。

## 6. 错误处理与静态验证

- KF 错误码：`errorCode===0` 成功；非 0 透出 message；登录失败明确返回
- **回读校验**：kf-adapter 每个写操作后对应 GET 回读比对（工程名/页面数/控件数/变量数）
- **渲染器静态校验**：控件类型枚举、坐标/尺寸范围、变量引用格式、模板必填字段齐全 → 失败 400 带原因
- **静态验证报告**（agent 生成后输出）：
  1. 工程/页面回读存在，页面数/控件数与计划一致
  2. 每页 KF JSON 结构完整（pageProperty + objects 必备字段，对照模板库）
  3. 控件 `uiModelType` 合法、绑定变量均在工程变量清单
  4. 脚本语法粗查（括号配对、无明显残缺）
  5. 结论 `pass`/`fail(原因清单)`；fail 时 agent 修复重验，超轮数报失败
- agent-service 会话失败：记录原因，可重试

## 7. 开发顺序与测试策略

### 7.1 素材库提取（Phase 0，前置）
1. 从本地开发态代码 `kingclient/public/javascripts/Common/Graphic/UI/kmui_*.js` 提取 49 个控件类的构造器默认属性 → `schema/control-templates/*.json`
2. `kmUIModeTypeEnum` → `schema/uiModelType.json`（已完成枚举清单）
3. `KMUIModelBase` 基础字段 → `schema/base-fields.json`
4. `createPageModel`/现有页面 JSON → `schema/page-skeleton.json`
5. **验证**：提取的模板 vs 现有页面 JSON（AA/KS40/甘特图）字段对照，缺漏补齐

### 7.2 分层测试
1. **API 探测**：登录/工程/分组/页面/变量/saveProjectData/getProjectFile 全部实测格式（已固化 `docs/kf-api-notes.md`）
2. **渲染器单测**：DSL → KF JSON，覆盖全部控件模板、边界（坐标越界/未知类型/变量引用缺失）
3. **kf-adapter 集成**：在 192.168.3.32 实测完整流程（建工程→页面→变量→脚本→回读），KF 开发运维中心人工打开核验
4. **agent-service 端到端**：Web 界面多轮对话生成示例工程，验证设计确认门/工具循环/验证报告
5. **LLM 编排测试**：mock kf-adapter，验证工具失败→模型修正、超轮数→失败、多轮上下文

## 8. 部署

- 代码仓库：`/Users/fengjinlong/YK/KingFusion3.6`，两个子目录 `kf-adapter/`、`agent-service/`；开发态代码副本 `KingFusion3.6_Center/`、`KingFusion3.6_Node/`（gitignore）
- kf-adapter：拷贝至客户机（如 `/opt/kf-adapter`），KF 自带 node 启动，`systemd`/`nohup` 守护；环境变量 `KF_BASE_URL`(http://127.0.0.1:11001)、`KF_USERNAME`、`KF_PASSWORD`、`ADAPTER_PORT`、`ADAPTER_TOKEN`(可选)
- agent-service：公司侧，环境变量 `LLM_BASE_URL`、`LLM_API_KEY`、`LLM_MODEL`、`AGENT_PORT`、`CUSTOMERS_CONFIG`

## 9. 第一版明确不做

- IO 采集工程、数据源配置、计算工程、告警工程
- 发布运行（`/api/ops/publish`）、运行态验证（含 headless 浏览器截图）
- gauge/trend 等工业仪表控件（原生无枚举，后续 CUSTOMMODEL/图形模型实现）
- 多租户、多解决方案、MCP Server 形态
- agent-service 用户体系/鉴权（公司内网 + 简单 token 起步）
- graph 编排框架（演进信号出现后再评估）
