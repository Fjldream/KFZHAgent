// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import type { ModelRoute, ModelTask } from "@kf/contracts";

/**
 * 服务端环境变量视图。只允许从这里读取模型配置，浏览器提交的
 * endpoint/model/价格一律不接受。
 */
export type ModelRouteSource = Readonly<Record<string, string | undefined>>;

/** 每类任务解析出的路由表；由同一份服务端配置派生，运行期只读。 */
export type ModelRouteTable = Readonly<Record<ModelTask, ModelRoute>>;
// end
