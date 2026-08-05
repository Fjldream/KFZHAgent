/**
 * 模型输出安全渲染（安全红线，brief Step 5）。
 *
 * 任何模型输出绝不用 v-html 渲染原始内容。本模块提供显示级实体转义：
 * 将 `<>&"'=` 全部实体化，使浏览器按纯文本展示，同时任何 `<img onerror>`
 * 风格的载荷都不可能成为可执行 HTML。
 */

/**
 * 实体化一段将插入模板的文本。除标准 HTML 实体外显式转义 `=`，
 * 保证 `onerror=` 之类的属性形态在序列化输出中也不会出现。
 */
export function escapeModelText(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/=/g, "&#x3D;");
}
