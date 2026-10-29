# 节点冗余模块 UX 契约

本契约的业务来源是 `docs/superpowers/specs/2026-09-01-kf-cold-redundancy-design.md`，视觉来源见 `DESIGN.md`。

## Business Context Sources

| 领域                                   | 权威来源                                                            | UI 使用范围              |
| -------------------------------------- | ------------------------------------------------------------------- | ------------------------ |
| 冗余生命周期、切换、APP 管控和数据保留 | `docs/superpowers/specs/2026-09-01-kf-cold-redundancy-design.md`    | 全部业务状态和操作确认   |
| REST、WS、revision 和稳定错误码        | Center `lib/services/redundancy` 与 `lib/controllers/redundancy.js` | API、实时刷新和错误恢复  |
| 维护权限                               | Center `lib/services/redundancy/permission_service.js`              | 按钮可用性和后台最终拒绝 |
| 视觉规范                               | `DESIGN.md` 与 `styles/tokens.css`                                  | 全部冗余页面和浮层       |

## Canonical UI Map

| Capability                  | Canonical owner                                                 | Source of truth                | Allowed variants                          | Verification               |
| --------------------------- | --------------------------------------------------------------- | ------------------------------ | ----------------------------------------- | -------------------------- |
| 品牌色、状态色、圆角和间距  | `styles/tokens.css`                                             | `DESIGN.md`                    | 宿主可映射同义主题变量                    | DESIGN lint、严格 UI audit |
| REST 错误、登录失效和 token | `api/http-client.ts`                                            | Center API 包装协议            | 宿主可替换 token/401 回调                 | API 单元测试               |
| WS 连接与重连               | `api/redundancy-socket.ts`                                      | Center `/api/v1/redundancy-ws` | 仅允许替换地址和 token 提供器             | store 测试、浏览器断线状态 |
| 配置和当前异常状态          | `stores/redundancy.ts`                                          | REST 聚合查询及 WS 快照        | 无页面本地副本                            | store 单元测试             |
| APP 最终列表到增删差量      | `utils/app-membership.ts`                                       | APP_CHANGE 接口协议            | 无                                        | 差量单元测试               |
| CRUD                        | `RedundancyManagementView.vue` + `ConfigDialog.vue`             | 冗余配置 REST 和本契约         | 新建/未生效编辑删除；已生效配置走独立操作 | 浏览器完整流程、API 测试   |
| Form                        | Element Plus Form + `ConfigDialog.vue`                          | Element Plus 校验模型          | APP 维护、切换使用命名 Dialog 变体        | 类型检查、浏览器键盘验证   |
| Select/Listbox              | Element Plus Select                                             | Element Plus 可访问组件契约    | 单选、多选；不使用原生 select             | 浏览器打开、键盘和窄屏验证 |
| Table Selection             | Element Plus Table 当前行                                       | `selectedId` store 状态        | 不提供跨页批量选择                        | 浏览器选择与分页验证       |
| Toast                       | Element Plus Message                                            | 本契约的操作反馈文案           | success、info、error                      | 浏览器成功/失败状态        |
| Scrollbar                   | `styles/tokens.css` 全局基线                                    | CSS scrollbar tokens           | `scrollbar-gutter` 仅稳定长列表布局       | 静态审计、窄屏浏览器验证   |
| 状态标签                    | `components/RedundancyStatusTag.vue`                            | 领域生命周期和健康状态         | 正常、异常、未生效                        | 浏览器状态矩阵             |
| 对话框、确认和异步反馈      | Element Plus Dialog/MessageBox/Message                          | 本 UX 契约                     | 风险级别可改变 type，不改变交互所有者     | 浏览器键盘、取消和失败恢复 |
| 列表分页与空状态            | 两个 View 的 Element Plus Table/Pagination                      | 查询结果                       | 演示前端分页，内网可换服务端分页          | 单元测试、浏览器边界状态   |
| 当前异常通知                | `components/NotificationCenter.vue` + Element Plus Notification | OPEN 事件集合与新 OPEN 增量    | 铃铛列表、持久右上角通知                  | 单元测试、浏览器通知验证   |

## 路由与页面

- `/redundancy`：配置列表和当前选中配置详情。
- `/redundancy/events`：异常事件记录。
- 新建、编辑、修改 APP 使用宿主可复用的对话框；任务步骤使用右侧抽屉。
- 页面标题采用“页面 — KingFusion3.6”。

## 数据集与搜索

- 配置列表和事件列表采用服务端分页接入边界；演示数据在前端分页。
- 搜索提交后写入 URL `q`，清空按钮立即复位并回到第一页。
- 初始加载保留固定内容区域并显示加载状态；后台刷新保留旧数据。

## 操作与反馈

- 新建、编辑成功后关闭弹窗并刷新列表；修改 APP 成功后刷新详情，不要求重新生效。
- 生效、停用、切换、删除、修改 APP 均等待服务端确认，不做乐观成功。
- 每次变更生成 `requestId`，重复点击被 busy 状态阻止。
- revision 冲突保留输入，提示“配置已被其他操作更新”，提供刷新后重试。
- 删除仅允许未生效配置，使用危险确认；停用只解除管控，使用警告确认。
- 普通切换先说明停源再启目标；源节点离线时才显示强制切换和必填原因。

## 当前异常与通知

- 顶部铃铛角标只统计当前 OPEN 异常；没有当前异常时显示“暂无消息”。
- 异常不会因打开通知中心自动消失；“确认”只记录已读/已确认，不改变健康状态。
- 登录成功后由宿主顶层维持全局 WS 连接；新产生的 OPEN 异常显示持久的右上角通知并提供“查看详情”，首次连接快照和重复增量不弹出。
- WS 断线显示稳定的降级提示并指数退避重连；REST 仍可用时允许手动刷新。

## 权限

- 查看权限不足进入 403 状态。
- 用户能看到但不能执行的维护按钮保持可见并禁用，通过提示说明原因；后台权限始终是最终依据。

## 可访问性与浮层

- 目标 WCAG 2.2 AA；所有图标按钮有中文可访问名称，焦点可见。
- 对话框、抽屉、下拉、通知统一使用 Element Plus 可访问组件。
- z-index 统一为 dropdown 200、popover 300、header 400、backdrop 500、dialog 600、drawer 700、toast 900。
- 动效在 `prefers-reduced-motion` 下缩短为不超过 100ms 的透明度变化。
