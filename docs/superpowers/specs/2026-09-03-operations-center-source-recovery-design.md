# 运维中心前端源码恢复设计

## 目标

从 `front/dist` 中的 Vite 构建产物与 JavaScript sourcemap 恢复一套可安装依赖、可启动开发服务器、可再次执行生产构建的 Vue 3 源码工程。恢复结果位于 `front`，原始 `front/dist` 保留不动，作为行为与视觉比对基准。

## 已确认的输入质量

- `front/dist/static/js` 包含业务 chunk 及对应 `.js.map` 文件。
- sourcemap 中已识别约 60 个业务源码路径，且对应 `sourcesContent` 非空。
- 可直接恢复的内容包括 `.vue` 页面和组件、Pinia stores、Vue Router、API 封装、composables、工具函数、ECharts 插件和四种语言资源。
- 已确认原工程使用 Vue 3、Vite、Pinia、Vue Router、Element Plus、vue-i18n、ECharts、Axios、Pinia 持久化插件与 `ldrs`。
- JavaScript sourcemap 不包含构建配置、依赖清单和环境变量原文件。
- 当前产物没有 CSS sourcemap；全局 `src/style.scss` 需要从编译 CSS 恢复兼容版本。
- 原始 SVG 图标目录未作为独立资源保留，需要从 bundle 中的虚拟 SVG 注册模块恢复，或提供运行兼容的替代实现。

## 恢复策略

### 源码提取

遍历所有业务 `.js.map`，按 `sources` 和 `sourcesContent` 建立映射。只提取 `../../../src/` 下的业务源码，忽略 `node_modules` 源码。相同路径出现在多个 sourcemap 时，内容相同则去重；内容冲突则停止并记录冲突，不能静默覆盖。

二进制图片不会采用 sourcemap 中的占位内容，而从 `front/dist/static/png` 和 `front/dist/static/gif` 复制到源码资源目录，并修正恢复源码中的引用路径。

### 工程骨架

在 `front` 下补齐：

- `package.json`
- `vite.config.js`
- `index.html`
- `.env.example`
- `.gitignore`
- `src/style.scss`
- SVG 图标兼容目录或注册模块

源码目录保持 sourcemap 记录的原始层级和文件名，不主动重命名已有目录，包括原工程中已经存在的拼写形式。这样能最大限度保证 `@/` 别名引用和动态 import 与原实现一致。

### 依赖与版本

依赖名称从恢复源码的 import 和 bundle 元数据共同确定。版本优先依据 sourcemap 中第三方源码的 `package.json` 内容或 bundle 特征锁定；无法精确确定时选择与产物 API 兼容的版本，并通过构建验证。使用独立的 `front/package-lock.json` 固化最终可运行版本。

### 环境变量

扫描恢复源码中的全部 `import.meta.env.*` 引用，并在 `.env.example` 中逐项声明。能从构建产物中确定的值作为开发默认值；不能确定或与部署环境绑定的值使用明确、可启动的本地默认值，并在文件注释中说明。不得把推测的生产凭据写入工程。

### 样式与图标

`.vue` 文件内的原始 `<style>` 块随 sourcemap 直接恢复。缺失的全局 `style.scss` 从主 CSS chunk 重建，优先剥离明显属于 Element Plus 的第三方样式，避免重复打包；若拆分存在风险，则保留兼容 CSS 并以最终页面和构建正确性为准。

`virtual:svg-icons-register` 对应的图标注册能力通过 `vite-plugin-svg-icons` 和恢复出的 SVG 文件实现。若 bundle 仅保留 symbol 内容而无文件名映射，则从 symbol ID 和 path 数据生成等价 SVG 文件。

## 验证策略

1. 静态校验所有恢复源码引用均能解析，且没有文件被空内容覆盖。
2. 安装依赖并运行生产构建，要求退出码为 0。
3. 启动 Vite 开发服务器，确认入口页面可访问且没有启动期模块解析错误。
4. 对比恢复构建与原 `dist` 的路由、页面入口、Pinia store ID、API 路径和主要静态资源。
5. 对无法在缺少真实后端时验证的登录、WebSocket 和接口行为，明确记录其外部依赖，不伪造成功结果。

## 写入边界

- 保留 `front/dist` 的现有文件，不覆盖、不删除。
- 新增或修改仅限 `front` 源码工程以及本设计对应的计划文档。
- 不触碰工作区中现有的其他未提交修改。
- 不对恢复出的业务逻辑做无关重构；只有为恢复构建和运行所必需的兼容修改才允许发生，并单独记录。

## 完成标准

- `front/src` 包含 sourcemap 中全部可恢复的业务源码，并保持原路径结构。
- 五个 Pinia store 及其注册、持久化配置恢复完整。
- `npm install` 可完成，依赖锁文件已生成。
- `npm run build` 成功。
- Vite 开发服务器能启动，入口页面可通过 HTTP 访问。
- 最终交付说明列出精确恢复内容、推断或替代内容、验证命令，以及仍依赖真实后端或部署环境的限制。
