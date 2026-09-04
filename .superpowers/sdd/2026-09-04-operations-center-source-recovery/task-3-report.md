# Task 3: Vite 工程骨架、环境变量和静态资源恢复报告

## 实现

- 创建 ESM Vite 工程清单、入口页和配置：Vue 插件、`@` → `src` alias、`base: './'`，构建输出为 `front/build`，不覆盖原始 `front/dist`。
- 创建 `.env`（本地、被忽略）和 `.env.example`（提交），均按任务简报提供四个非敏感默认值。
- 将 `main.js` 的 `virtual:svg-icons-register` 改为本地 `plugins/svg-icons-register.js`。该模块在 DOM 就绪后注入 sprite。
- 从 `index-CvJcEVgf.js.map` 的 `virtual:svg-icons-register` source 还原完整 SVG payload 到 `src/assets/icons/sprite.svg`（20 个 `<symbol>`）。
- 从 `front/dist/static/gif`、`png` 和主 CSS chunk 无损复制两个 GIF、`titleBg.png` 和 `style.scss`。
- 创建工程结构 Node 测试，并生成 `package-lock.json`。

## TDD（RED / GREEN）

- RED：`node --test scripts/project-structure.test.mjs` 在创建工程文件前失败，错误为缺少 `front/package.json`（`ENOENT`）。
- GREEN：补齐工程文件及资源后，同一结构测试通过。
- 依赖安装首次 RED：`pinia-plugin-persistedstate@^4.2.0` 解析至 4.7.1，其 peer 要求 Pinia 3，与 Pinia 2 冲突。
- GREEN：将该依赖固定为兼容 Pinia 2 的 `4.2.0`（peer `pinia >=2.3.0`）后，`npm install` 成功。

## 依赖版本

由 `package-lock.json` 固化的直接依赖：

- `@element-plus/icons-vue` 2.3.2、`axios` 1.20.0、`dayjs` 1.11.23、`dompurify` 3.4.14、`echarts` 5.6.0、`element-plus` 2.14.5、`ldrs` 1.1.9、`nanoid` 5.1.16
- `pinia` 2.3.1、`pinia-plugin-persistedstate` 4.2.0、`vue` 3.5.42、`vue-echarts` 7.0.3、`vue-i18n` 10.0.7、`vue-router` 4.6.4
- 开发依赖：`@vitejs/plugin-vue` 5.2.4、`vite` 6.4.3、`sass` 1.104.0

## 资源恢复方式

- `nodeOffline.gif`：`front/dist/static/gif/nodeOffline-Yb0KEa8y.gif` 原样复制。
- `nodeOnline.gif`：`front/dist/static/gif/nodeOnline-D_z2e7uw.gif` 原样复制。
- `titleBg.png`：`front/dist/static/png/titleBg-1sDQZOHn.png` 原样复制。
- `style.scss`：`front/dist/static/css/index-CHKSZJJl.css` 原样复制，作为兼容恢复版本。
- `sprite.svg`：从 sourcemap 中的 JavaScript string literal 解码并提取。SHA-256/内容自查确认三项二进制资源分别与 dist 源完全一致，sprite 也与 sourcemap 解码后的 payload 完全一致。

## 文件

- 新建：`front/package.json`、`front/package-lock.json`、`front/index.html`、`front/vite.config.js`、`front/.env`、`front/.env.example`、`front/.gitignore`、`front/scripts/project-structure.test.mjs`
- 新建：`front/src/style.scss`、`front/src/assets/icons/sprite.svg`、`front/src/plugins/svg-icons-register.js`、`front/src/assets/image/titleBg.png`
- 替换：`front/src/assets/image/nodeOffline.gif`、`front/src/assets/image/nodeOnline.gif`
- 修改：`front/src/main.js`

## 测试和自查

- `PATH=/Users/fengjinlong/.nvm/versions/node/v22.14.0/bin:$PATH npm test`：4/4 PASS。
- `PATH=/Users/fengjinlong/.nvm/versions/node/v22.14.0/bin:$PATH npm run build`：PASS；输出到被忽略的 `front/build`。
- `git diff --check`：PASS。
- 三个恢复二进制文件与 dist 源的 SHA-256 完全一致；sprite 内容与 sourcemap 中恢复的 20 个 symbol 完全一致。
- 仅暂存任务简报列出的 `front` 文件；未暂存 `.env`、`front/dist`、`.DS_Store` 或其他既有脏改动。

## Concerns

- 任务简报要求 `VITE_ROUTE_MAIN=/main`，但已恢复的 `src/stores/systemConfigStore.js` 对该变量执行 `JSON.parse`。该默认值在实际触发该 store 时可能不是有效 JSON；依照“精确值照用”的要求未偏离简报，建议后续需求确认运行时语义。
- 构建仅有恢复源码中既存 `::v-deep` 写法的 deprecation warning，以及 Vite 对大于 500 kB chunk 的提示；均不影响构建成功，未超出本任务范围修改。
