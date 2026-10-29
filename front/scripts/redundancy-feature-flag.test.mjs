// modified by jinlong.feng at 2026-10-10 冗余功能构建期开关
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { loadEnv } from "vite";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const read = (relativePath) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

test("默认构建启用冗余功能，且判定规则是「只有显式 false 才关闭」", () => {
  const env = loadEnv("production", projectRoot, "VITE_");
  assert.equal(env.VITE_ENABLE_REDUNDANCY, "true");

  // 判定必须是 !== "false"：漏配变量时应视为开启，保持向后兼容，
  // 否则老部署升级后可能因为少一个变量而把现场功能误关。
  const features = read("../src/config/features.js");
  assert.match(
    features,
    /export const REDUNDANCY_ENABLED = import\.meta\.env\.VITE_ENABLE_REDUNDANCY !== 'false'/,
  );
  assert.match(
    features,
    /export const REDUNDANCY_ROUTE_NAMES = new Set\(\['redundancy', 'redundancyEvents'\]\)/,
  );
});

test("开关只由 .env 一个变量驱动，不引入额外的构建脚本", () => {
  // modified by jinlong.feng at 2026-10-12 冗余功能构建期开关
  // 屏蔽方式：把 .env 里的 VITE_ENABLE_REDUNDANCY 改成 false，再执行 npm run build。
  const env = loadEnv("production", projectRoot, "VITE_");
  assert.equal(env.VITE_ENABLE_REDUNDANCY, "true");

  const pkg = JSON.parse(read("../package.json"));
  assert.deepEqual(Object.keys(pkg.scripts).sort(), [
    "build",
    "dev",
    "preview",
    "test",
  ]);
  // end modified by jinlong.feng at 2026-10-12 冗余功能构建期开关
});

test("开关只认 .env：不存在按 mode 覆盖的环境文件，vite 配置也不参与判定", () => {
  // modified by jinlong.feng at 2026-10-12 冗余功能构建期开关
  assert.equal(
    existsSync(new URL("../.env.no-redundancy", import.meta.url)),
    false,
  );
  // 真正的变量替换发生在 features.js 的 import.meta.env 上；
  // vite.config.js 不该引用这个开关，避免两处判定打架。
  const config = read("../vite.config.js");
  assert.doesNotMatch(config, /VITE_ENABLE_REDUNDANCY/);
  // end modified by jinlong.feng at 2026-10-12 冗余功能构建期开关
});

test("屏蔽时路由不注册，并对直接手敲地址做重定向兜底", () => {
  const router = read("../src/router/index.js");
  assert.match(
    router,
    /import \{ REDUNDANCY_ENABLED, REDUNDANCY_ROUTE_NAMES \} from '@\/config\/features\.js'/,
  );
  // 两条冗余路由必须包在构建期常量条件里，这样产物中不会留下对应分块。
  assert.match(router, /\.\.\.\(REDUNDANCY_ENABLED\s*\n\s*\? \[/);
  assert.match(router, /path: 'redundancy'/);
  assert.match(router, /path: 'redundancy\/events'/);
  // 守卫兜底：关闭时把冗余路由名重定向回默认首页，避免白屏。
  assert.match(
    router,
    /if \(!REDUNDANCY_ENABLED && REDUNDANCY_ROUTE_NAMES\.has\(to\.name\)\) \{\s*\n\s*return import\.meta\.env\.VITE_ROUTE_DEFAULT/,
  );
});

test("屏蔽时左侧菜单不含冗余项，且不再依赖硬编码菜单下标", () => {
  const store = read("../src/stores/mainLeftMenusStore.js");
  assert.match(
    store,
    /import \{ REDUNDANCY_ENABLED \} from "@\/config\/features\.js"/,
  );
  assert.match(
    store,
    /mainLeftMenus\.value = mainLeftMenus\.value\.filter\(\s*\n\s*\(menu\) => REDUNDANCY_ENABLED \|\| menu\.id !== "redundancy",\s*\n\s*\)/,
  );
  // 冗余项被过滤后维护日志的下标会前移，必须改为按 id 查找。
  assert.match(
    store,
    /const maintenanceLogMenu = mainLeftMenus\.value\.find\(\s*\n\s*\(menu\) => menu\.id === "maintenanceLog",\s*\n\s*\)/,
  );
  assert.doesNotMatch(store, /mainLeftMenus\.value\[3\]/);
});

test("屏蔽时通知中心不挂载，从源头避免建立冗余 WebSocket 连接", () => {
  const title = read("../src/components/Main/MainTitle.vue");
  assert.match(
    title,
    /import \{ REDUNDANCY_ENABLED \} from '@\/config\/features\.js'/,
  );
  assert.match(
    title,
    /<RedundancyNotificationCenter v-if="REDUNDANCY_ENABLED" \/>/,
  );
  // 通知中心在 onMounted 里连接冗余 WS，因此必须由开关拦截挂载。
  assert.doesNotMatch(title, /<RedundancyNotificationCenter \/>/);
});
// end modified by jinlong.feng at 2026-10-10 冗余功能构建期开关
