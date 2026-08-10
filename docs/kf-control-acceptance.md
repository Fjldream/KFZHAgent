# KF 控件全量完善 — 验收记录

日期：2026-08-10

## 目标
将 agent-app 的 KF 控件支持从 12 种扩展到 31 种（参考工程 `~/Desktop/test_最新_2.gz` 全部静态控件），并验证 L4/L5 能力。

## 完成内容

### 新增 20 种控件（全部通过 L4：生成+修改+构建+预览+round-trip）
| 类型 | uiModelType | 源码 | 说明 |
|---|---|---|---|
| input | 38 | ElementUI/kmui_elementui_input.js | 输入框（value/placeholder/clearable/inputType/maxlength） |
| cascader | 39 | ElementUI/kmui_elementui_cascader.js | 级联选择器（options/placeholder/filterable） |
| datetimepicker | 40 | ElementUI/kmui_elementui_datetimepicker.js | 日期时间选择器（value/pickerType/format） |
| dropdown | 33 | ElementUI/kmui_elementui_dropdown.js | 下拉菜单（options/text/splitButton） |
| navmenu | 34 | ElementUI/kmui_elementui_navmenu.js | 导航菜单（mode/options） |
| tree | 32 | ElementUI/kmui_elementui_tree.js | 树（showCheckbox/indent/expandOnClickNode） |
| upload | 45 | ElementUI/kmui_elementui_upload.js | 文件上传（action/accept/multiple） |
| transfer | 46 | ElementUI/kmui_elementui_transfer.js | 穿梭框（options/titles） |
| tag | 50 | ElementUI/kmui_elementui_tag.js | 标签（effect/closable/hit） |
| timeline | 51 | ElementUI/kmui_elementui_timeline.js | 时间线（items） |
| steps | 52 | ElementUI/kmui_elementui_steps.js | 步骤条（active/direction/processStatus） |
| combobox | 3 | UI/kmui_combobox_model.js | 可编辑下拉（options/editable） |
| scale | 8 | UI/kmui_scale.js | 刻度（min/max/value/step） |
| list | 9 | UI/kmui_list_model.js | 列表（options） |
| treeview | 11 | UI/kmui_treeview.js | 树视图（showCheckbox） |
| webcontainer | 12 | UI/kmui_webcontainer.js | 网页容器（url/scrollbar） |
| gantt | 30 | UI/kmui_gantt.js | 甘特图（configureData 数据） |
| factorycalendar | 43 | UI/kmui_factorycalendar.js | 日历（value/dateFormat） |
| radiolegacy | 0 | UI/kmui_radio_model.js | 旧式单选（options/value） |
| checkboxlegacy | 1 | UI/kmui_checkbox_model.js | 旧式复选（label/checked） |

### 6 层实现链（每控件）
1. **模板**：kf-template-generator 从 KF 源码自动提取（CONTROLS 表扩展 + 生成器）
2. **IR schema**：client-project-ir.schema.ts 加 20 个 variant + CONTROL_TYPE_BY_UIMODEL_TYPE（13→33 条目）
3. **编译/校验**：control-compiler.ts（CONTROL_TEMPLATES/TYPE_IR_FIELDS/applySchemaOverrides）+ client-compiler.ts（validateControl 20 case）
4. **patch**：allowlist.ts（20 类字段）+ client-patcher.ts（CONTROL_TEMPLATES/CREATE_PASS_THROUGH）
5. **预览**：preview-renderer/renderer.ts（renderControl 20 case + CSS + kfControlToIR）
6. **LLM 暴露**：deepseek-model.ts（SYSTEM_PROMPT 31 种 + buildPlanPrompt）+ kf-design-principles.ts

## 验证结果

### 单测
- 全量 **500 测试通过**（39 文件），含：新控件 create 测试（client-patcher）、新控件渲染测试（renderer）、映射数量断言（client-inspector 33）、模板枚举覆盖（kf-template-generator）
- 两包 TSC 干净

### 真实工程 inspect（test_最新_2，275 页/1726 对象）
- 1273 个有 uiModelType 的控件**全部被正确识别**（28 种类型），unknownFields 从 201 → **0**
- 786 个容器对象（objectType 1/2/3）识别为容器（保留不触碰，后续批次）

### Golden Sample 端到端（L4）
- 编译 → 打包 → 上传（201）→ 20 控件全部识别为语义类型
- 对话修改（"把Input1的占位符改成请输入设备编号"）→ 设计计划 → 确认 → 变更计划（update×2）→ 批准 → **构建 SUCCEEDED + 校验 pass**
- 构建产物 round-trip 导入 → 20 控件全部保留、GUID 一致

## 修复的连带 bug
1. **argon2 mock 残留**：node_modules/.pnpm/argon2@0.45.1/node_modules/argon2/argon2.cjs 是评审会话的临时 scrypt mock（用真 argon2 绑定恢复 `argon2.cjs.orig`）→ 登录从永久失败恢复
2. **lastErrorCode 残留**：plan-change/design-plan 成功未清 INVALID_MODEL_OUTPUT → 后续 approval 被误拒（已修复 + 回归测试）
3. **上传工程 GUID 错配**：graph-ports 的 getRevisionEntities 对上传工程用推导 GUID 而非真实 KF GUID → PATCH_CONFLICT（已修复：优先走 domainProjectRevision 的 inspect 路径）

## L5 原生验收结果（2026-08-10，通过 ✅）

### 验收方式
- 环境：参考服务器 192.168.3.32（root/Kingview01!），KF 3.6 SP4 完整安装（nginx 443 前端 + kingclient 11004 + kingoauth 11006）
- 将 agent-app 编译的 Golden Sample 构建产物（含 20 种新控件）安装到 KF sdb 目录（`sdb/<tenant>/kingclient/<工程GUID>/`），注册进 ProjectManager.json，重启 KF 服务
- **用户确认：KF 前端打开「Golden全控件验收」工程成功，20 种新控件全部正常显示**

### 修复的原生兼容问题（agent-app 编译器）
1. **页面 GUID 需 k 前缀**：KF 序列化规范要求页面/页面组 GUID 以 `k` 开头（如 `kba208ca1-...`），控件 GUID 无前缀。修复：`client-compiler.ts` + `page-compiler.ts` 页面 GUID 加 `"k"` 前缀
2. **页面 JSON 缺 pageViewWidth/pageViewHeight**：KF 客户端打开页面必需。修复：`page-compiler.ts` 顶层补 `pageViewWidth/pageViewHeight`
3. **工程 GUID 需合法 UUID**：KF projectMap 用 GUID 做 key，非法格式（如 golden-0001）导致 `projectVariables undefined` 打开报错
4. **骨架文件补齐**：km_global_script.js、securitySectionManager.json、userManager.json、ImgResourceManager/uploads/userSource/video 目录（agent-app 编译器已生成大部分，仅手动补 userManager 等）

### 服务器 sdb 佐证
服务器已导入的 test_最新_2 工程（275 页）含全部新控件类型（input×46、cascader×25、datetimepicker×21、tree×27、dropdown×11、navmenu×19、upload×15、transfer×10、tag×11、timeline×8、steps×10、gantt×1、webcontainer×10、factorycalendar×2 等）——证实这些控件类型是 KF 原生支持并实际使用的，agent-app 模板提取自同源 KF 源码、结构一致。

## 待办（后续）
- 容器对象（objectType 1/2/3 的 786 个：easyui datagrid/布局容器/CustomCharts）按用户确认**下一步做**

## 文件变更
- `packages/kf-schema-extractor/src/kf-template-generator.ts`：CONTROLS 表 +19
- `packages/domain-client/src/templates/control-templates/`：+20 个模板 JSON
- `packages/domain-client/src/ir/client-project-ir.schema.ts`：+20 variant + 映射 33
- `packages/domain-client/src/ir/client-project-ir.ts`：CONTROL_TYPES +20
- `packages/domain-client/src/compile/control-compiler.ts`：模板注册/TYPE_IR_FIELDS/overrides
- `packages/domain-client/src/compile/client-compiler.ts`：validateControl +20 case + optionalNumber
- `packages/domain-client/src/patch/allowlist.ts`：+20 类字段
- `packages/domain-client/src/patch/client-patcher.ts`：模板注册/CREATE_PASS_THROUGH
- `packages/domain-client/src/inspect/client-inspector.ts`：CONTROL_SPECIFIC_FIELDS +20 + 公共字段补全
- `packages/preview-renderer/src/renderer.ts`：renderControl +20 + CSS + kfControlToIR
- `apps/api/src/conversations/deepseek-model.ts`：SYSTEM_PROMPT 31 种 + buildPlanPrompt
- `apps/api/src/conversations/kf-design-principles.ts`：能力边界 31 种
- `apps/api/src/conversations/graph-ports.ts`：上传工程真实 GUID 读取
- `packages/agent-orchestrator/src/nodes/plan-change.ts` + `design-plan.ts`：清 lastErrorCode
- 测试：`client-patcher.test.ts`/`renderer.test.ts`/`client-inspector.test.ts`/`kf-template-generator.test.ts`/`kf-design-principles.test.ts`/`solution-graph.test.ts`
