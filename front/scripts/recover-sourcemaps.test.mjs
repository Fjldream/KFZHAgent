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
