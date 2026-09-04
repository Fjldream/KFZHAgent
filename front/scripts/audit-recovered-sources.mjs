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
