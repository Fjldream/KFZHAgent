import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import axios from 'axios';
import { loadEnv } from 'vite';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));

test('工程骨架覆盖运行依赖和环境变量', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(pkg.scripts).sort(), ['build', 'dev', 'preview', 'test']);
  const runtimeDependencies = ['@element-plus/icons-vue', 'axios', 'dayjs', 'dompurify', 'echarts', 'element-plus', 'ldrs', 'nanoid', 'pinia', 'pinia-plugin-persistedstate', 'vue', 'vue-echarts', 'vue-i18n', 'vue-router'];
  assert.deepEqual(Object.keys(pkg.dependencies).sort(), runtimeDependencies.sort());
  const buildDependencies = ['@iconify-json/ep', '@vitejs/plugin-vue', 'sass', 'unplugin-auto-import', 'unplugin-icons', 'unplugin-vue-components', 'vite'];
  assert.deepEqual(Object.keys(pkg.devDependencies).sort(), buildDependencies.sort());

  const env = await readFile(new URL('../.env', import.meta.url), 'utf8');
  const exampleEnv = await readFile(new URL('../.env.example', import.meta.url), 'utf8');
  assert.equal(env, exampleEnv);
  for (const key of ['VITE_BACKEND_ORIGIN', 'VITE_LANGUAGE', 'VITE_PROXY_DOMAIN', 'VITE_ROUTE_DEFAULT', 'VITE_ROUTE_MAIN']) {
    assert.match(env, new RegExp(`^${key}=`, 'm'));
  }
  const loadedEnv = loadEnv('development', projectRoot, 'VITE_');
  assert.equal(loadedEnv.VITE_BACKEND_ORIGIN, 'https://192.168.3.32');
  assert.equal(loadedEnv.VITE_PROXY_DOMAIN, '/opscenter');
  assert.equal(axios.getUri({ baseURL: loadedEnv.VITE_PROXY_DOMAIN, url: '/oemConfig' }), '/opscenter/oemConfig');
  const routeMain = loadedEnv.VITE_ROUTE_MAIN;
  assert.deepEqual(JSON.parse(routeMain), ['calculationProject', 'collectProject', 'clientProject', 'dataSourceProject', 'alarmProject']);
  const viteConfigExport = (await import(new URL('../vite.config.js', import.meta.url))).default;
  const viteConfig = typeof viteConfigExport === 'function' ? viteConfigExport({ mode: 'development' }) : viteConfigExport;
  assert.equal(viteConfig.resolve.alias['@'], fileURLToPath(new URL('../src', import.meta.url)));
  assert.equal(viteConfig.build.outDir, 'build');
  assert.deepEqual(viteConfig.server.proxy['/opscenter'], {
    target: 'https://192.168.3.32',
    changeOrigin: true,
    secure: false,
  });
  for (const asset of ['nodeOffline.gif', 'nodeOnline.gif', 'titleBg.png']) {
    assert.ok((await stat(new URL(`../src/assets/image/${asset}`, import.meta.url))).size > 0);
  }
});
