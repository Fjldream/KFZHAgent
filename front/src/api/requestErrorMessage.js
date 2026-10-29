// modified by jinlong.feng at 0901 冗余功能开发
/**
 * 构造全局请求失败提示；仅在请求显式声明时覆盖展示位置与样式。
 * 未声明覆盖项的页面仍得到既有的 `{ message, type }` 配置。
 */
export function createRequestErrorMessageOptions(message, requestConfig) {
  const overrides = requestConfig?.requestErrorMessageOptions;
  return overrides
    ? { message, type: "error", ...overrides }
    : { message, type: "error" };
}
// end
