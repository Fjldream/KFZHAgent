// modified by jinlong.feng at 2026-10-29 KF客户端完整入库与启动审计
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { literalDependencies, auditOutputPath, requireScopes } from './audit-kf-client-startup.mjs';
import path from 'node:path';
import ts from '../agent-app/node_modules/typescript/lib/typescript.js';

test('separates built-in modules from external packages and relative program modules', () => {
  const result = literalDependencies('require("fs");require("node:crypto");require("querystring");require("crypto-js");require("sqlite3");require("./core/cache");require("@scope/library/feature");');
  assert.deepEqual(result.packages, ['@scope/library', 'crypto-js', 'sqlite3']);
  assert.deepEqual(result.relative, ['./core/cache']);
});

test('does not present computed require calls as resolved literal dependency closure', () => {
  const result = literalDependencies('require("./" + platform);require(global.commonDir);require("express");');
  assert.deepEqual(result.packages, ['express']);
  assert.deepEqual(result.relative, []);
});

test('normalizes repository directory separators while refusing report paths outside the repository', () => {
  const root = path.resolve('/tmp/kf-audit-test');
  assert.equal(auditOutputPath(root + path.sep, 'kf-reference/report.json'), path.join(root, 'kf-reference/report.json'));
  assert.throws(() => auditOutputPath(root, '../private.json'), /AUDIT_OUTPUT_OUTSIDE_REPOSITORY/);
});

test('distinguishes real eager imports from comments, strings, lazy functions and conditional loads', () => {
  const source = '// require("missing");\nconst text=\'require("missing")\';const eager=require("missing");function later(){return require("missing")}if(enabled){require("missing")}';
  const sites = requireScopes(ts, source, 'missing');
  assert.equal(sites.length, 3);
  assert.equal(sites.filter(site => site.eagerTopLevel).length, 1);
  assert.deepEqual(sites.find(site => site.functionScopes.length)?.functionScopes, ['later']);
});

test('reports caught module loads separately from unguarded or rethrowing startup failures', () => {
  const source = 'try{require("missing")}catch{console.log("optional")}try{require("missing")}catch(error){throw error}try{}catch{}finally{require("missing")}';
  const sites = requireScopes(ts, source, 'missing');
  assert.equal(sites.length, 3);
  assert.equal(sites[0].guardedByCatch, true);
  assert.equal(sites[0].catchRethrows, false);
  assert.equal(sites[1].catchRethrows, true);
  assert.equal(sites[2].guardedByCatch, false);
  assert.equal(sites.filter(site => site.eagerTopLevel && (!site.guardedByCatch || site.catchRethrows)).length, 2);
});
// end
