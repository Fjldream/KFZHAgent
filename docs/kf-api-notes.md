# KingFusion 3.6 客户端工程 HTTP API 实测笔记

> 日期：2026-08-05；环境：192.168.3.32（麒麟 V10，KF gateway :11001）
> 结论：**客户端工程（kingclient）存在完整 HTTP API，前端编辑器即通过这些接口操作工程，全链路已实测打通**。

## 1. 认证（实测）

1. `GET /api/user/getPublicKey` → `data.publicKey`(PEM spki) + `data.uuid`
2. 密码加密：RSA-OAEP / SHA-256，结果 base64：
   ```js
   crypto.publicEncrypt({ key: publicKey, padding: RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(password)).toString('base64')
   ```
3. `POST /api/user/login` body `{username, password(密文), uuid}` → `data.access_token` / `refresh_token`
4. 后续请求头：`Authorization: Bearer <access_token>`，`Content-Type: application/json`
5. 登录失败计数：连续错 5 次锁定 10 分钟（提示文案含剩余次数）

## 2. 客户端工程接口（全部实测成功）

| 接口 | 方法 | 请求 | 响应关键字段 |
|---|---|---|---|
| 工程列表 | GET `/api/client/projectList?projectGroupId=default_kingclient` | — | `data[]`: `guid,name,status,...` |
| 创建工程 | POST `/api/client/createProject` | `{name, projectGroupId, description, projectData:{}}` | `data.guid` |
| 配置树 | GET `/api/client/getProjectConfigureTree?projectId=<guid>` | — | `data.message.pageTree.id`（页面管理根 id）、`variableTree`、`graphicTree` |
| 建分组 | POST `/api/client/createGroup` | `{name, projectId, parentId}`（parentId 用 pageTree.id） | `data.data.id` |
| 建页面 | POST `/api/client/createPage` | `{name, groupId, description, projectId}`（groupId 可用 pageTree.id 或分组 id） | `data.data.id` / `GUID` |
| 页面列表 | GET `/api/client/getPages?projectId=<guid>` | — | `data.message.Pages[]` |
| 删除工程 | DELETE `/api/client/deleteProject` | body `{guid: [<guid>]}`（**数组**） | `data: true` |

## 3. 前端源码提取的调用格式（待逐一实测）

来源：`/opt/KingFusion3.6_Center/kingdevopscenter/www/dist/js/index-*.js`（axios 封装，baseURL `/api`）

| 接口 | 方法 | 请求 |
|---|---|---|
| 保存页面数据 | POST `/client/saveProjectData` | body = `{paramData}`（页面数据）；params `{projectInfo: JSON.stringify({name, type, guid: projectId, operation})}` |
| 更新页面 | PUT `/client/updatePage` | `{name, id, description, projectId}` |
| 导入页面 | POST `/client/importPage` | `{pageList, projectId}` |
| 添加变量 | POST `/client/addVariable` | `{id, content, projectId}`（content=变量数据） |
| 编辑变量 | PUT `/client/editVariable` | `{putData: JSON.stringify({groupId, variableName, variable, projectId})}` |
| 加变量分组 | POST `/client/addVariableGroup` | `{id, projectId}` |
| 建分组(改) | POST `/client/createGroup` | `{name, projectId, parentId}` |
| 更新分组 | PUT `/client/updateGroup` | `{name, id, projectId, parentId}` |
| 删除页面 | DELETE `/client/deletePage`（待确认参数） | — |
| 全局脚本 | GET/PUT `/client/getGlobalScript` `/client/setGlobalScript` | — |

## 4. 待下一步实测（实现阶段）

- `saveProjectData` 完整参数与页面 JSON 写入格式（核心：控件如何落库）
- `addVariable` / `editVariable` 的 content 结构（变量 schema）
- `setGlobalScript`（全局脚本）
- `deletePage` / `updatePage` 参数
- `uploadLocalProject`（工程导入，备用路径）
- 页面内控件（objects）的 `uiModelType` 枚举与必填字段（从现有工程 page JSON + 前端控件库提取）

## 5. 补充观察

- 编辑器为 Web 端（开发运维中心 devcenter），前端 Vue SPA 通过 `/api/client/*` HTTP 接口 + `/ws` WebSocket 操作工程；保存走 HTTP（saveProjectData）
- gateway 日志仅保留近 7 天（`logConfig.retainTime`），早期 create 调用已被轮转，但接口可用性已由本次实测证实
- 工程数据落盘：`sdb/<solutionGUID>/kingclient/<projectId>/`（project.json + project/ 目录）

## 6. 重大发现：saveProjectData 是通用"写工程文件"接口（实测验证）

> 用户质疑"页面 JSON 生成没有接口"——实测确认：**没有控件级 API，但 saveProjectData 提供直接写入页面 JSON 文件的通道**。

- 调用：`POST /api/client/saveProjectData?projectInfo=<JSON>`，body = 完整页面 JSON
  - `projectInfo` 含 `{name, type, guid(工程id)}`；**type 是文件类型枚举**（见下）
  - 服务端逻辑（kingclient `projectMng/index.js`）：`fs.writeFile(o, JSON.stringify(body))` 直接落盘，**零校验**
- type 枚举（kingclient `core/utils/getFilePath.js`）：
  - `3` → `project/page/<name>.json`（**页面文件**）
  - `4` → `project/Tag/<name>.json`（**变量 Tag**）
  - `2/5/9/14/15` → `project/<name>.json`（各管理器文件）
  - `7` → `project/config/<name>.json`；`11/12/13` → 图形模型/图表/图形组；`20` → userSource
- 特殊分支：type=3 且带 `operation` 时——`add` 走服务端 `createPageModel` 模板生成；`edit` 读旧文件改 `name` 写回；**不带 operation 时直接写入 body**
- **实测闭环**：createPage → saveProjectData(type=3, body 含 Button1 控件) → 磁盘生成 `project/page/FINAL.json` → getProjectFile 回读 objects 含 `Button1:35` → 一致
- **推论**：页面 JSON 的合法性完全由调用方保证（服务端零校验）——这正是「确定性渲染器」架构决策的实证依据；渲染器需从现有页面 JSON + 前端控件定义逆向每种控件的完整 schema
