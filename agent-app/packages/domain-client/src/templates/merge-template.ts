/**
 * 控件模板合并规则。
 *
 * 任务 6 的客户端编译器通过合并 `base-fields.json`（每个 KF 控件都具有的字段）与来自 `control-templates/<type>.json` 的控件模板（对应特定 KF uiModelType 的字段），构建完整的 KF 控件对象。
 *
 * 合并规则（唯一且有文档记录的事实来源）：
 *   result = { ...baseFields, ...controlTemplate }
 *
 * - 使用浅层展开；键冲突时以控件模板为准。
 * - `sizePolicy` 特意不属于基础字段：旧版控件（text/richtext/spacer，已用 1.4 万多个 SDB 页面验证）将其序列化为扁平数组 `[...]`，并另设 `fixedSize` 数组；元素式控件（button/inputnumber/switch/...）则将其序列化为对象 `{ sizePolicy, maxSize, minSize, fixedSize }`。每个控件模板负责其 uiModelType 的确切结构，因此浅层展开绝不会混合这两种结构。
 * - 数组和对象会被整体替换（不做深度合并）：基础字段与模板字段绝不会进行结构化合并。
 */
export type TemplateJson = Record<string, unknown>;

export function mergeControlTemplate(
  baseFields: TemplateJson,
  controlTemplate: TemplateJson,
): TemplateJson {
  return { ...baseFields, ...controlTemplate };
}
