# 节点冗余前端内网合并说明

本目录是一套可独立运行、也可按模块合入现有运维中心的 Vue 3 + Element Plus 实现。`src/demo` 只用于本地预览，业务代码全部位于 `src/modules/redundancy`。

## 1. 需要合并的业务文件

- `api/`：REST、WebSocket 和节点目录适配。
- `components/`：配置、APP 维护、切换、任务、通知和状态组件。
- `stores/redundancy.ts`：列表、详情、当前异常、任务和实时消息状态。
- `views/`：冗余管理页、异常事件页。
- `styles/tokens.css`：冗余模块唯一颜色与尺寸变量源。
- `types/`、`utils/`、`runtime.ts`、`index.ts`：类型、差量计算和宿主接入边界。

不要合并 `src/demo`、`index.html` 或 `vite.config.ts`；它们只负责在外网源码环境展示完整页面。

## 2. 安装模块

宿主应已经安装 Vue 3、Vue Router、Pinia 和 Element Plus；额外确认存在 `axios`。在宿主启动代码中创建一次模块：

```ts
import {
  createRedundancyModule,
  redundancyRuntimeKey,
} from "./modules/redundancy";
import "./modules/redundancy/styles/tokens.css";

const redundancy = createRedundancyModule({
  getToken: () => sessionStorage.getItem("token"),
  canMaintain: () => currentUserHas("redundancy:maintain"),
  onUnauthorized: () => router.replace("/login"),
});

redundancy.routes.forEach((route) => router.addRoute(route));
app.provide(redundancyRuntimeKey, redundancy.runtime);
```

`getToken`、`canMaintain` 必须替换成运维中心现有登录态和权限函数。当前后端运行版临时按 `userType` 判断维护权限；内网合并时应同时替换后端 `PermissionService` 的 provider，后台仍是最终权限依据。

## 3. 宿主 UI 接入

左侧导航增加：

- 名称：`节点冗余管理`
- 路由：`/redundancy`
- 异常记录路由：`/redundancy/events`

右上角通知区域挂载 `NotificationCenter`。组件只展示当前 `OPEN` 异常，没有异常时固定显示“暂无消息”；打开通知不会自动消除异常。

```vue
<NotificationCenter
  @navigate-events="router.push('/redundancy/events')"
  @select-configuration="openRedundancy"
/>
```

宿主全局只创建一个 `createRedundancyModule` 实例，因此只会创建一条 WebSocket。路径为 `/api/v1/redundancy-ws`，与 Center HTTP 服务共用端口。

## 4. 后端接口契约

- REST 基础路径：`/api/v1`。
- API 响应使用 KF 包装：`{ code, message, data }`。
- 修改 APP 页面维护的是最终列表；`utils/app-membership.ts` 会转换成后端所需的 `changes[{nodeId, addAppIds, removeAppIds}]`。
- 所有写操作携带 `expectedRevision`；生效、停用、切换和 APP 维护额外携带唯一 `requestId`。
- 节点在线仅在 `nodeStatus` 为 `"running"`、`1` 或 `true` 时成立。
- 列表和事件演示版使用前端分页。若内网数据量较大，可保持页面组件不变，在 API/store 层替换为服务端分页响应。

## 5. 节点目录适配

默认 `KfNodeCatalog` 调用 `/nodes/list`。若内网已有节点 store，建议注入适配器，避免重复请求：

```ts
const nodeCatalog = {
  async listNodes() {
    return nodeStore.nodes.map((node) => ({
      nodeId: node.nodeId,
      nodeName: node.nodeName,
      nodeIp: node.address,
      online: node.nodeStatus === "running",
    }));
  },
};
```

然后将 `nodeCatalog` 传入 `createRedundancyModule`。

## 6. 合并检查

1. 登录后能访问两条路由；只读用户能查看且维护按钮禁用。
2. 新建配置默认未生效，首次生效可选择激活节点。
3. APP 修改保存后立即形成任务，不要求重新生效；无变化时不发请求。
4. 人工切换显示源、目标和执行顺序；源离线时强制切换必须填写原因。
5. 通知只显示当前异常，确认不改变异常健康状态。
6. WS 断开后页面显示重连提示，REST 刷新仍可使用。
7. revision 冲突、权限拒绝和后台稳定错误码均显示后台 `message`。

## 7. 本地验证命令

使用支持当前依赖的 Node.js 运行：

```bash
npm ci
npm run verify
npm run dev
```

本机演示地址默认为 `http://127.0.0.1:4176/redundancy`。
