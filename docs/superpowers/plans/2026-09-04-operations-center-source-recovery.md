# 运维中心前端源码恢复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从 `front/dist` 的 Vite sourcemap 恢复一套位于 `front`、保留原目录结构且能够安装、启动和重新构建的 Vue 3 运维中心源码。

**Architecture:** 先用一个可测试的 Node.js 提取器把 sourcemap 中的 `../../../src/` 业务文件无损落盘，并对重复路径执行内容一致性校验。随后根据恢复源码的 imports、环境变量引用和 bundle 内的虚拟 SVG 模块补齐 Vite 工程骨架、静态资源、全局样式和图标，最后以静态引用审计、生产构建和开发服务器 HTTP 冒烟测试闭环。

**Tech Stack:** Node.js、Vite、Vue 3、Pinia、Vue Router、Element Plus、vue-i18n、Axios、ECharts、Sass、Node test runner

**Spec:** `docs/superpowers/specs/2026-09-03-operations-center-source-recovery-design.md`

## Global Constraints

- 保留 `front/dist` 全部现有文件，不覆盖、不删除。
- 只修改 `front` 源码工程、恢复脚本及本计划，不触碰仓库中其他未提交修改。
- sourcemap 已保存的业务源码按原路径和原内容恢复，不做无关重构或重命名。
- 相同源码路径对应不同内容时必须失败并报告，禁止静默覆盖。
- 不写入推测的生产凭据；环境相关值只提供可解释的本地默认值。
- 完成声明必须以新运行的构建和开发服务器验证输出为依据。

---

### Task 1: 实现可验证的 sourcemap 源码提取器

**Files:**
- Create: `front/scripts/recover-sourcemaps.mjs`
- Create: `front/scripts/recover-sourcemaps.test.mjs`

**Interfaces:**
- Produces: `recoverSources({ mapDirectory, outputDirectory }): { recovered: string[], duplicates: string[] }`
- Consumes: Vite `.js.map` 文件中的 `sources` 与 `sourcesContent`

- [ ] **Step 1: 写失败测试，覆盖路径还原、第三方过滤和冲突检测**

```js
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { recoverSources } from './recover-sourcemaps.mjs';

test('只恢复 src 文件，并允许内容相同的重复项', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'kf-source-map-'));
  const maps = path.join(root, 'maps');
  const output = path.join(root, 'output');
  await mkdir(maps);
  const map = {
    version: 3,
    sources: ['../../../src/main.js', '../../../../node_modules/vue/index.js'],
    sourcesContent: ['export const app = true;\n', 'third party'],
    names: [],
    mappings: '',
  };
  await writeFile(path.join(maps, 'a.js.map'), JSON.stringify(map));
  await writeFile(path.join(maps, 'b.js.map'), JSON.stringify(map));

  const result = await recoverSources({ mapDirectory: maps, outputDirectory: output });

  assert.deepEqual(result.recovered, ['src/main.js']);
  assert.deepEqual(result.duplicates, ['src/main.js']);
  assert.equal(await readFile(path.join(output, 'src/main.js'), 'utf8'), 'export const app = true;\n');
});

test('同一路径出现不同内容时拒绝覆盖', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'kf-source-map-conflict-'));
  const maps = path.join(root, 'maps');
  await mkdir(maps);
  const makeMap = content => ({
    version: 3,
    sources: ['../../../src/main.js'],
    sourcesContent: [content],
    names: [],
    mappings: '',
  });
  await writeFile(path.join(maps, 'a.js.map'), JSON.stringify(makeMap('first')));
  await writeFile(path.join(maps, 'b.js.map'), JSON.stringify(makeMap('second')));

  await assert.rejects(
    recoverSources({ mapDirectory: maps, outputDirectory: path.join(root, 'output') }),
    /Conflicting sourcemap content for src\/main\.js/,
  );
});
```

- [ ] **Step 2: 运行测试并确认因模块不存在而失败**

Run: `cd front && node --test scripts/recover-sourcemaps.test.mjs`

Expected: FAIL，错误包含 `Cannot find module` 或缺少导出的 `recoverSources`。

- [ ] **Step 3: 实现最小提取器**

```js
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function recoverSources({ mapDirectory, outputDirectory }) {
  const mapFiles = (await readdir(mapDirectory)).filter(name => name.endsWith('.js.map')).sort();
  const collected = new Map();
  const duplicates = new Set();

  for (const mapFile of mapFiles) {
    const map = JSON.parse(await readFile(path.join(mapDirectory, mapFile), 'utf8'));
    for (let index = 0; index < map.sources.length; index += 1) {
      const source = map.sources[index];
      if (!source.startsWith('../../../src/')) continue;
      const relativePath = source.slice('../../../'.length);
      const content = map.sourcesContent?.[index];
      if (typeof content !== 'string') throw new Error(`Missing sourcesContent for ${relativePath}`);
      if (collected.has(relativePath)) {
        if (collected.get(relativePath) !== content) {
          throw new Error(`Conflicting sourcemap content for ${relativePath}`);
        }
        duplicates.add(relativePath);
      } else {
        collected.set(relativePath, content);
      }
    }
  }

  for (const [relativePath, content] of collected) {
    const destination = path.join(outputDirectory, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, content);
  }

  return {
    recovered: [...collected.keys()].sort(),
    duplicates: [...duplicates].sort(),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const result = await recoverSources({
    mapDirectory: path.join(root, 'dist/static/js'),
    outputDirectory: root,
  });
  console.log(JSON.stringify(result, null, 2));
}
```

- [ ] **Step 4: 运行提取器单元测试**

Run: `cd front && node --test scripts/recover-sourcemaps.test.mjs`

Expected: 2 tests PASS。

- [ ] **Step 5: 提交提取器**

```bash
git add front/scripts/recover-sourcemaps.mjs front/scripts/recover-sourcemaps.test.mjs
git commit -m "test: add safe sourcemap source recovery"
```

### Task 2: 提取并审计原始 Vue 业务源码

**Files:**
- Create: `front/src/**/*.vue`
- Create: `front/src/**/*.js`
- Create: `front/scripts/audit-recovered-sources.mjs`

**Interfaces:**
- Consumes: Task 1 的 `recoverSources`
- Produces: sourcemap 原路径对应的 `front/src` 树，以及可执行的恢复完整性审计

- [ ] **Step 1: 写审计脚本，验证关键入口和五个 Pinia store**

```js
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

const required = [
  'src/main.js',
  'src/App.vue',
  'src/router/index.js',
  'src/stores/langStore.js',
  'src/stores/mainLeftMenusStore.js',
  'src/stores/opsResourceStore.js',
  'src/stores/systemConfigStore.js',
  'src/stores/userStore.js',
];

for (const file of required) await access(new URL(`../${file}`, import.meta.url));
const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
assert.match(main, /createPinia/);
assert.match(main, /piniaPluginPersistence/);
console.log(`Recovered source audit passed (${required.length} critical files)`);
```

- [ ] **Step 2: 先运行审计并确认缺少 `front/src`**

Run: `cd front && node scripts/audit-recovered-sources.mjs`

Expected: FAIL，错误为 `ENOENT`，指向 `src/main.js`。

- [ ] **Step 3: 执行无损提取**

Run: `cd front && node scripts/recover-sourcemaps.mjs`

Expected: 输出包含恢复文件列表，且不出现 `Conflicting sourcemap content`。

- [ ] **Step 4: 运行恢复完整性审计并核对源码数量**

Run: `cd front && node scripts/audit-recovered-sources.mjs && find src -type f | sort`

Expected: 审计 PASS；列表包含全部 sourcemap 业务路径，关键 Vue 页面、API、composables、i18n、router 和五个 stores 均存在。

- [ ] **Step 5: 提交恢复出的业务源码**

```bash
git add front/src front/scripts/audit-recovered-sources.mjs
git commit -m "feat: recover operations center Vue sources"
```

### Task 3: 补齐 Vite 工程骨架、环境变量和静态资源

**Files:**
- Create: `front/package.json`
- Create: `front/index.html`
- Create: `front/vite.config.js`
- Create: `front/.env`
- Create: `front/.env.example`
- Create: `front/.gitignore`
- Create: `front/src/style.scss`
- Create: `front/src/assets/icons/sprite.svg`
- Create: `front/src/plugins/svg-icons-register.js`
- Modify: `front/src/main.js`
- Create: `front/src/assets/image/nodeOffline.gif`
- Create: `front/src/assets/image/nodeOnline.gif`
- Create: `front/src/assets/image/titleBg.png`

**Interfaces:**
- Consumes: 恢复源码中的 bare imports、四个 `import.meta.env` 键、bundle 内 `virtual:svg-icons-register` 的 symbol 集合、`front/dist/static` 二进制资源
- Produces: `npm install` 可解析的工程清单和所有源码引用可加载的本地资源

- [ ] **Step 1: 写工程结构测试**

在 `front/scripts/project-structure.test.mjs` 中断言 `package.json` scripts 包含 `dev`、`build`、`test`，依赖集合精确覆盖源码 bare imports，Vite alias `@` 指向 `src`，四个环境键均出现在 `.env.example`，且三个二进制资源非空。

```js
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import test from 'node:test';

test('工程骨架覆盖运行依赖和环境变量', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(pkg.scripts).sort(), ['build', 'dev', 'preview', 'test']);
  for (const dependency of ['@element-plus/icons-vue', 'axios', 'dayjs', 'dompurify', 'echarts', 'element-plus', 'ldrs', 'nanoid', 'pinia', 'pinia-plugin-persistedstate', 'vue', 'vue-echarts', 'vue-i18n', 'vue-router']) {
    assert.ok(pkg.dependencies[dependency], `missing dependency: ${dependency}`);
  }
  const env = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
  for (const key of ['VITE_LANGUAGE', 'VITE_PROXY_DOMAIN', 'VITE_ROUTE_DEFAULT', 'VITE_ROUTE_MAIN']) assert.match(env, new RegExp(`^${key}=`, 'm'));
  for (const asset of ['nodeOffline.gif', 'nodeOnline.gif', 'titleBg.png']) {
    assert.ok((await stat(new URL(`../src/assets/image/${asset}`, import.meta.url))).size > 0);
  }
});
```

- [ ] **Step 2: 运行结构测试并确认工程文件缺失**

Run: `cd front && node --test scripts/project-structure.test.mjs`

Expected: FAIL，首个错误指向缺少 `package.json`。

- [ ] **Step 3: 创建工程清单和 Vite 配置**

创建 ESM `package.json`，scripts 固定为 `vite`、`vite build`、`vite preview` 和 `node --test scripts/*.test.mjs`。dependencies 包含测试列出的 14 个运行依赖，devDependencies 包含 `@vitejs/plugin-vue`、`vite` 与 `sass`。`vite.config.js` 使用 Vue 插件、`@` alias、`base: './'`、`build.outDir: 'build'`，避免覆盖原始 `dist`。

- [ ] **Step 4: 创建入口和本地环境默认值**

`index.html` 保留标题 `KingFusion3.6运维中心` 和 `#app`，入口指向 `/src/main.js`。`.env` 与 `.env.example` 使用以下非敏感默认值：

```dotenv
VITE_LANGUAGE=zh
VITE_PROXY_DOMAIN=/api
VITE_ROUTE_DEFAULT=/login
VITE_ROUTE_MAIN=/main
```

- [ ] **Step 5: 恢复二进制资源、全局样式和 SVG sprite**

从 `front/dist/static/gif` 复制两个 GIF，从 `front/dist/static/png/titleBg-1sDQZOHn.png` 恢复 `titleBg.png`。从主 sourcemap 的 `virtual:svg-icons-register` 内容提取 `<symbol>...</symbol>` 集合写入 `sprite.svg`，实现 `src/plugins/svg-icons-register.js` 在 DOM ready 时注入 sprite，并把 `src/main.js` 的虚拟模块 import 改为该本地注册模块。将主 CSS chunk 复制为 `src/style.scss` 作为缺失全局样式的兼容恢复版本。

- [ ] **Step 6: 安装依赖并执行结构测试**

Run: `cd front && npm install && npm test`

Expected: 安装成功并生成 `package-lock.json`；全部 Node tests PASS。

- [ ] **Step 7: 提交工程骨架**

```bash
git add front/package.json front/package-lock.json front/index.html front/vite.config.js front/.env.example front/.gitignore front/src front/scripts/project-structure.test.mjs
git commit -m "build: restore operations center Vite project"
```

`.env` 仅供本地验证，由 `front/.gitignore` 排除，不进入提交。

### Task 4: 修复模块解析并完成生产构建

**Files:**
- Modify: `front/package.json`
- Modify: `front/vite.config.js`
- Modify: `front/src/**/*`（仅限构建所需的路径、导入和兼容修复）
- Create: `front/RECOVERY.md`

**Interfaces:**
- Consumes: Task 2 恢复源码与 Task 3 工程骨架
- Produces: 成功的 `front/build` 生产构建和可审计的恢复说明

- [ ] **Step 1: 执行首次生产构建并保存真实错误**

Run: `cd front && npm run build`

Expected: 若存在遗漏资源或版本不兼容，构建失败并给出精确模块或文件位置；若直接成功，保留输出作为基线。

- [ ] **Step 2: 按错误逐项进行最小修复**

每次只修复当前构建错误：缺少包则补到 `package.json` 并更新 lockfile；缺少本地资源则从 `dist` 或 sourcemap 恢复；路径错误则按 sourcemap 原路径修正；不得借机改写业务逻辑。每个修复后重新运行 `npm run build`，直到退出码为 0。

- [ ] **Step 3: 静态核对路由、Pinia 和 API 行为标识**

Run:

```bash
cd front
rg "defineStore\(" src/stores
rg "path:|name:" src/router/index.js
rg "VITE_(LANGUAGE|PROXY_DOMAIN|ROUTE_DEFAULT|ROUTE_MAIN)" src .env.example
rg "axios|request\(" src/api
```

Expected: 五个 store 文件均有 `defineStore`；路由包含登录、SSO、主页面、负载均衡、运行节点和维护日志入口；四个环境变量均可追踪；API 层仍通过恢复出的 Axios 封装调用。

- [ ] **Step 4: 写恢复说明**

`front/RECOVERY.md` 明确列出：sourcemap 直接恢复的源码范围、从 bundle 重建的 SVG sprite、从编译 CSS 恢复的全局样式、环境变量默认值、构建命令，以及登录/API/WebSocket 仍依赖真实后端的限制。

- [ ] **Step 5: 运行全量测试和干净生产构建**

Run: `cd front && npm test && npm run build`

Expected: tests PASS，Vite build 退出码为 0，输出目录为 `front/build`，原 `front/dist` 未变化。

- [ ] **Step 6: 提交构建兼容修复与恢复说明**

```bash
git add front/package.json front/package-lock.json front/vite.config.js front/src front/RECOVERY.md
git commit -m "fix: complete recovered frontend build"
```

### Task 5: 验证开发服务器和 HTTP 入口

**Files:**
- Modify: `front/RECOVERY.md`

**Interfaces:**
- Consumes: 已通过生产构建的恢复工程
- Produces: 可复现的开发服务器启动证据和最终限制说明

- [ ] **Step 1: 启动独立 Vite 开发服务器**

Run: `cd front && npm run dev -- --host 127.0.0.1 --port 4177`

Expected: Vite 报告 `http://127.0.0.1:4177/` 可访问，进程保持运行。

- [ ] **Step 2: 从另一个终端执行 HTTP 冒烟测试**

Run: `curl --fail --silent --show-error http://127.0.0.1:4177/`

Expected: HTTP 200，正文包含 `<div id="app"></div>` 和 `/src/main.js`。

- [ ] **Step 3: 检查开发服务器输出并停止进程**

Expected: 没有启动期模块解析错误；使用 Ctrl-C 正常停止服务器。

- [ ] **Step 4: 将验证命令和结果补充进恢复说明**

在 `front/RECOVERY.md` 记录实际执行日期、`npm test`、`npm run build`、Vite 开发服务器和 HTTP 冒烟结果；对未连接真实后端的功能明确标记为未做端到端验证。

- [ ] **Step 5: 最终验证工作区边界**

Run: `git status --short -- front docs/superpowers/plans/2026-09-04-operations-center-source-recovery.md && git diff --check -- front docs/superpowers/plans/2026-09-04-operations-center-source-recovery.md`

Expected: 无 whitespace 错误；`front/dist` 没有已跟踪删除或覆盖；变更仅属于本计划范围。

- [ ] **Step 6: 提交最终验证记录**

```bash
git add front/RECOVERY.md
git commit -m "docs: record recovered frontend verification"
```
