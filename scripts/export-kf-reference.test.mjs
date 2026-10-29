// modified by jinlong.feng at 2026-10-29 KF源码精简入库
import assert from 'node:assert/strict';
import { test } from 'node:test';
import ts from '../agent-app/node_modules/typescript/lib/typescript.js';
import { includeFile, sanitizeJavaScript } from './export-kf-reference.mjs';

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
// end
