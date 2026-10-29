// modified by jinlong.feng at 2026-10-29 KF源码精简入库
import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from '../agent-app/node_modules/typescript/lib/typescript.js';
import { includeFile, sanitizeJavaScript } from './export-kf-reference.mjs';
// modified by jinlong.feng at 2026-10-29 KF客户端完整入库与启动审计
import { vendorRoots, includeVendorDirectory, includeVendorFile, vendorSummary } from './kf-vendor-policy.mjs';
// end

test('redacts embedded credentials while retaining dynamic configuration and executable structure', () => {
  const source = 'const cfg={"password":"fixture-password-not-real",secret:`fixture-session-not-real`};let apiKey="fixture-api-not-real";cfg.pwd="fixture-pwd-not-real";const live={password:process.env.PASSWORD};';
  const result = sanitizeJavaScript(ts, 'KingFusion3.6_Center/example.js', source);
  assert.equal(result.redactions, 4);
  assert.ok(result.content.startsWith('// modified by jinlong.feng at 2026-10-29 KF源码精简入库'));
  assert.ok(result.content.endsWith('// end\n'));
  assert.ok(!result.content.includes('fixture-'));
  assert.ok(result.content.includes('process.env.PASSWORD'));
  assert.equal(ts.createSourceFile('example.js', result.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS).parseDiagnostics.length, 0);
});

test('unchanged source keeps exact bytes and localization labels remain available', () => {
  const source = 'const labels={PASSWORD:"请输入密码"};\r\n';
  const result = sanitizeJavaScript(ts, 'KingFusion3.6_Center/views/lang/zh.js', source);
  assert.equal(result.redactions, 0);
  assert.equal(result.content, source);
});

test('credential URLs are redacted even under ordinary property names', () => {
  const source = 'const service={endpoint:"redis://fixture_user:fixture_password@localhost:6379"};';
  const result = sanitizeJavaScript(ts, 'KingFusion3.6_Node/service.js', source);
  assert.equal(result.redactions, 1);
  assert.ok(!result.content.includes('fixture_password'));
});

test('files that carry runtime data or packaged assets are outside the export allowlist', () => {
  for (const name of ['x/.env', 'x/state.db', 'x/installer.exe', 'x/client.zip', 'x/vendor.min.js', 'x/config/common.json', 'x/graphic-library.json']) {
    assert.equal(includeFile(name), false, name);
  }
  assert.equal(includeFile('x/public/javascripts/Common/Graphic/Layout/kmui_layout.js'), true);
  assert.equal(includeFile('x/package.json'), true);
});
// modified by jinlong.feng at 2026-10-29 KF客户端完整入库与启动审计
test('retains crypto serialization delimiters while redacting embedded private key material', () => {
  const marker = '-----BEGIN RSA PRIVATE KEY-----\n';
  const formatter = `const marker = ${JSON.stringify(marker)};`;
  assert.equal(sanitizeJavaScript(ts, 'crypto.js', formatter).content, formatter);
  const syntheticBody = Buffer.alloc(64, 0x41).toString('base64');
  const embedded = `const key = ${JSON.stringify(marker + syntheticBody + '\n-----END RSA PRIVATE KEY-----')};`;
  const sanitized = sanitizeJavaScript(ts, 'fixture.js', embedded);
  assert.equal(sanitized.redactions, 1);
  assert.ok(!sanitized.content.includes(syntheticBody));
});

test('includes minified runtime scripts, distribution CSS, fonts, icons and scoped packages', () => {
  const root = vendorRoots[1];
  for (const relative of [
    'jquery-easyui-1.6.4/jquery.easyui.min.js', 'element-ui/lib/theme-chalk/index.css',
    'element-ui/lib/theme-chalk/fonts/element-icons.woff', 'core/skin.min.css',
    'jquery-easyui-1.6.4/themes/icons/edit_add.png', 'preview/cmaps/78-EUC-H.bcmap',
    'univerLibs/@univerjs/presets@0.12.0/lib/umd/index.js', 'quill/LICENSE',
  ]) assert.equal(includeVendorFile(`${root}/${relative}`), true, relative);
  assert.equal(includeVendorDirectory(`${root}/openlayers/dist`), true);
});

test('excludes source maps, explicit copies, sample trees, caches and installed dependencies', () => {
  const root = vendorRoots[2];
  for (const relative of [
    'openlayers/dist/ol.js.map', 'ht - 副本/ht.js', 'node_modules/example/index.js',
    'quill/examples/demo.html', 'lib/tests/fixture.js', '.cache/worker.js',
    'backup/ht.js', 'lib/state.db', 'lib/archive.zip', 'lib/.env', '../escaped.js',
  ]) assert.equal(includeVendorFile(`${root}/${relative}`), false, relative);
  assert.equal(includeVendorDirectory(`${root}/ht - 副本`), false);
  assert.equal(includeVendorFile('elsewhere/ThirdParty/library.min.js'), false);
});

test('reports original per-location sizes and content identity without replacing paths', () => {
  const records = [
    { path: vendorRoots[0] + '/same.js', sha256: 'same', bytes: 10 },
    { path: vendorRoots[1] + '/same.js', sha256: 'same', bytes: 10 },
    { path: vendorRoots[2] + '/new.js', sha256: 'new', bytes: 15 },
    { path: 'KingFusion3.6_Center/common/example.js', sha256: 'other', bytes: 100 },
  ];
  assert.deepEqual(vendorSummary(records), {
    vendorFileCount: 3, vendorBytes: 35, vendorUniqueFileCount: 2, vendorUniqueBytes: 25,
  });
});
// end
// end
