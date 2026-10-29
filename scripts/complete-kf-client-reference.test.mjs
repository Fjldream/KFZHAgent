// modified by jinlong.feng at 2026-10-29 KF客户端完整入库与启动审计
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clientContentRoots, clientContentExclusion, clientStaticResource, sanitizeConfiguration } from './complete-kf-client-reference.mjs';

test('preserves executable cache modules, predefined graphics, 3D workers and media resources', () => {
  const root = clientContentRoots[0];
  for (const name of [
    'core/cache/index.js', 'extension/Predefined/graphicGroup/StorageFacility5.json',
    'public/javascripts/HT3DEditor/client/vs/language/typescript/tsWorker.js',
    'public/images/example.png', 'public/stylesheets/editor.css', 'views/wavs/alarm.wav',
    'views/video/视频1.mp4', 'config/config_server.json', 'package.json',
  ]) assert.equal(clientContentExclusion(`${root}/${name}`), undefined, name);
});

test('excludes private instance data and installed dependencies without blanket cache-name filtering', () => {
  const root = clientContentRoots[1];
  for (const name of ['node_modules/x/index.js', 'uploads/customer.json', '.env', '.vscode/launch.json', '.DS_Store', 'old.js.bak', 'runtime.db', 'key.pem', 'worker.js.map']) {
    assert.ok(clientContentExclusion(`${root}/${name}`), name);
  }
  assert.equal(clientContentExclusion(`${root}/core/cache`, true), undefined);
  assert.equal(clientContentExclusion(`${root}/views/layui/core/css/._mystyle.css`), 'macos-filesystem-metadata');
  assert.equal(clientContentExclusion(`${root}/public/._resource`, true), 'macos-filesystem-metadata');
  assert.equal(clientContentExclusion('other/product/index.js'), 'outside-client-content');
});

test('configuration templates remove private values while retaining ports, flags, grant types and structure', () => {
  const input = JSON.stringify({ port: 11004, enabled: true, grantType: 'password', oauth: { clientId: 'fixture-client', clientSecret: 'fixture-secret-not-real' }, redis: { pwd: 'fixture-password-not-real' }, access_token: 'fixture-token-not-real', ssl_key: '' });
  const result = sanitizeConfiguration(input);
  assert.equal(result.redactions, 3);
  const value = JSON.parse(result.content);
  assert.equal(value.port, 11004);
  assert.equal(value.grantType, 'password');
  assert.equal(value.oauth.clientSecret, 'KF_REFERENCE_REDACTED');
  assert.equal(value.redis.pwd, 'KF_REFERENCE_REDACTED');
  assert.equal(value.ssl_key, '');
  assert.equal(sanitizeConfiguration('{"port":11004}').content, '{"port":11004}');
});

test('distinguishes browser-facing resources from server modules', () => {
  assert.equal(clientStaticResource(clientContentRoots[0] + '/public/javascripts/Common/control.js'), true);
  assert.equal(clientStaticResource(clientContentRoots[0] + '/lib/controllers/controller_project.js'), false);
});
// end
