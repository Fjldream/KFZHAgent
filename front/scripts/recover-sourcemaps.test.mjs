import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFile, mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { recoverSources } from './recover-sourcemaps.mjs';

const recoveryScript = fileURLToPath(new URL('./recover-sourcemaps.mjs', import.meta.url));

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

test('拒绝穿越 src 目录的源码路径', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'kf-source-map-traversal-'));
  const maps = path.join(root, 'maps');
  const output = path.join(root, 'output');
  await mkdir(maps);
  const map = {
    version: 3,
    sources: ['../../../src/../escaped.js'],
    sourcesContent: ['must not be written'],
    names: [],
    mappings: '',
  };
  await writeFile(path.join(maps, 'traversal.js.map'), JSON.stringify(map));

  await assert.rejects(
    recoverSources({ mapDirectory: maps, outputDirectory: output }),
    /Source path escapes src directory: src\/\.\.\/escaped\.js/,
  );
  await assert.rejects(readFile(path.join(output, 'escaped.js'), 'utf8'), { code: 'ENOENT' });
});

test('恢复 sourcesContent 时保留 CRLF 字节', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'kf-source-map-crlf-'));
  const maps = path.join(root, 'maps');
  const output = path.join(root, 'output');
  await mkdir(maps);
  const content = 'const first = true;\r\nconst second = true;\r\n';
  const map = {
    version: 3,
    sources: ['../../../src/main.js'],
    sourcesContent: [content],
    names: [],
    mappings: '',
  };
  await writeFile(path.join(maps, 'crlf.js.map'), JSON.stringify(map));

  await recoverSources({ mapDirectory: maps, outputDirectory: output });

  assert.deepEqual(await readFile(path.join(output, 'src/main.js')), Buffer.from(content));
});

test('直接运行 CLI 缺少 --output 时拒绝覆盖现有 src', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'kf-source-map-cli-'));
  const scripts = path.join(root, 'scripts');
  const maps = path.join(root, 'dist/static/js');
  const source = path.join(root, 'src/main.js');
  await mkdir(scripts, { recursive: true });
  await mkdir(maps, { recursive: true });
  await mkdir(path.dirname(source), { recursive: true });
  await copyFile(recoveryScript, path.join(scripts, 'recover-sourcemaps.mjs'));
  await writeFile(source, 'post-processed source\n');
  await writeFile(path.join(maps, 'app.js.map'), JSON.stringify({
    version: 3,
    sources: ['../../../src/main.js'],
    sourcesContent: ['raw recovered source\r\n'],
    names: [],
    mappings: '',
  }));

  const result = spawnSync(process.execPath, [path.join(scripts, 'recover-sourcemaps.mjs')], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /--output <directory>/);
  assert.equal(await readFile(source, 'utf8'), 'post-processed source\n');
});

test('直接运行 CLI 只写入显式 --output 目录', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'kf-source-map-cli-output-'));
  const scripts = path.join(root, 'scripts');
  const maps = path.join(root, 'dist/static/js');
  const output = path.join(root, 'staging');
  await mkdir(scripts, { recursive: true });
  await mkdir(maps, { recursive: true });
  await copyFile(recoveryScript, path.join(scripts, 'recover-sourcemaps.mjs'));
  await writeFile(path.join(maps, 'app.js.map'), JSON.stringify({
    version: 3,
    sources: ['../../../src/main.js'],
    sourcesContent: ['raw recovered source\r\n'],
    names: [],
    mappings: '',
  }));

  const result = spawnSync(process.execPath, [path.join(scripts, 'recover-sourcemaps.mjs'), '--output', output], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(await readFile(path.join(output, 'src/main.js')), Buffer.from('raw recovered source\r\n'));
});
