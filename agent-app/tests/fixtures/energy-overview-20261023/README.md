<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
# 能源管理系统 UI 验收参考图

- 文件：`reference.png`，1586 × 992，1,245,528 bytes。
- SHA-256：`3a79f4361e1e48b80ce64b1ec4053be63b4827df1c3f42deb5c7887bd3f2488c`。
- 生成方式：内置 imagegen（不是 CLI），用户明确要求生成可外发的能源管理系统 UI 图用于客户端工程验收。
- 这是目标参考图，不是已生成客户端的截图，也不是已完成 KF 导入或像素验收的证据。
- 所有数据是演示值；侧栏仅静态视觉内容；按钮未知交互不因识图自动获得执行权限。真实数据源和预算强制限制暂缓。
- 本轮接受纯装饰分隔线省略、原生静态组件近似；不自动省略业务文字、图表或其他不支持区域，不把参考图打包成整页背景。

## 最终图像生成提示词

```text
Use case: ui-mockup
Asset type: desktop energy management system UI reference image for native industrial client generation acceptance.
Primary request: Create one high-fidelity, shippable Chinese energy-management overview screen, a crisp flat screenshot filling a landscape 1440 by 900 canvas. No browser frame or device mockup.
Style: restrained professional industrial monitoring UI, highly readable Chinese sans-serif typography, careful alignment, ample breathing room, simple flat native components. Pale cool-gray background, dark navy text, white panels, restrained teal accents. Minimal borders, very subtle or no shadows.
Layout: compact header with product title "能源管理系统", subtitle "园区能源总览", and small "演示数据" badge. Narrow left navigation with exactly "能源总览" selected, "设备监测", "告警中心". Main area header "能源总览", supporting caption "掌握园区用能与设备运行状态".
Main content: a single row of three equal summary panels, with large readable numbers: "今日用电量" / "12,480" / "kWh"; "当前总功率" / "856" / "kW"; "设备在线率" / "98.6" / "%". Below, two balanced panels. Left panel titled "重点设备" contains exactly three generously spaced static status rows: "1号配电室" / "运行正常"; "中央空调" / "运行正常"; "光伏逆变器" / "待检修". Use small teal status dots for normal and amber for maintenance. Right panel titled "运行摘要" contains "当前告警" / "2 项", "今日能耗目标" / "15,000 kWh", "数据更新时间" / "14:30". At bottom of this panel one clear teal rectangular button "查看运行说明". A quiet footer note says "仅用于界面与工程生成验收 · 所有数值均为演示数据".
Constraints: All text precisely as specified and legible. Clear rectangular layout regions suitable for mapping to native containers, text labels, basic buttons. No charts, no complex tables, no tiny dense print, no photographs, no 3D equipment, no decorative illustrations, no gradients, no watermarks, no invented brand names. Keep the overview practical, polished, and implementable with ordinary native industrial UI components.
```

## 真实模型验收入口

位于 `apps/api/src/runs/visual-run-flow.integration.test.ts` 的明确付费 opt-in 用例：

```text
KF_LIVE_VISUAL_ACCEPTANCE=energy-overview-20261023
test name: accepts the generated energy UI through real DeepSeek and the native engineering pipeline
```

普通回归不会注册此用例。执行还需要已授权的 `DEEPSEEK_API_KEY`、通过安全校验的隔离 `TEST_DATABASE_URL` 与原有测试许可标识。密钥只从进程环境读取，不写到此目录。用例固定图片哈希和官方端点，最多三次物理调用，不重试、不部署 KF。组合根注入测试视觉策略不代表生产视觉功能已开放。成功响应和每阶段证据保存在独立临时目录；本轮选出的无凭据负例另保存在 `live-negative/`。最终结论以 `docs/visual-real-model-20261023.md` 为准，不能仅以存在此用例认定通过。

## 可离线复现的真实负例

`live-negative/` 的五份 JSON 来自本轮真实官方模型调用，不是人工编写的正常答案。它们是失败证据，**不是成功 golden，也不是已交付工程**。原图及数据允许外发且全部为演示值；所选文件没有 auth headers、密钥、密码、隐藏思维链或图片 base64。JSON 是原始生成数据，不能加 JavaScript 注释或修改字段使其通过。

`result.json` 记录修复字体规范化顺序前的失败。当前源码可对同一原始响应先执行已有规范化，随后精确重现静态观察旅程被要求提供动作的阻塞。下一模型应使用这份负例离线设计合同修复，避免每改一个校验就重发三轮模型。真实 KF、浏览器和像素验收状态仍是 false。
<!-- end -->
