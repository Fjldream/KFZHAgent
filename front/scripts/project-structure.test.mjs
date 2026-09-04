import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('工程骨架覆盖运行依赖和环境变量', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(pkg.scripts).sort(), ['build', 'dev', 'preview', 'test']);
  const runtimeDependencies = ['@element-plus/icons-vue', 'axios', 'dayjs', 'dompurify', 'echarts', 'element-plus', 'ldrs', 'nanoid', 'pinia', 'pinia-plugin-persistedstate', 'vue', 'vue-echarts', 'vue-i18n', 'vue-router'];
  assert.deepEqual(Object.keys(pkg.dependencies).sort(), runtimeDependencies.sort());
  const env = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
  for (const key of ['VITE_LANGUAGE', 'VITE_PROXY_DOMAIN', 'VITE_ROUTE_DEFAULT', 'VITE_ROUTE_MAIN']) assert.match(env, new RegExp(`^${key}=`, 'm'));
  const routeMain = env.match(/^VITE_ROUTE_MAIN=(.+)$/m)?.[1];
  assert.deepEqual(JSON.parse(routeMain), ['calculationProject', 'collectProject', 'clientProject', 'dataSourceProject', 'alarmProject']);
  const viteConfig = (await import(new URL('../vite.config.js', import.meta.url))).default;
  assert.equal(viteConfig.resolve.alias['@'], fileURLToPath(new URL('../src', import.meta.url)));
  assert.equal(viteConfig.build.outDir, 'build');
  for (const asset of ['nodeOffline.gif', 'nodeOnline.gif', 'titleBg.png']) {
    assert.ok((await stat(new URL(`../src/assets/image/${asset}`, import.meta.url))).size > 0);
  }
});
