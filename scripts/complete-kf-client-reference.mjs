// modified by jinlong.feng at 2026-10-29 KF客户端完整入库与启动审计
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sanitizeJavaScript, verifyReference } from './export-kf-reference.mjs';
import { isVendorReference, includeVendorDirectory, includeVendorFile } from './kf-vendor-policy.mjs';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const snapshotRoot = path.join(repositoryRoot, 'kf-reference');
export const clientContentRoots = [
  'KingFusion3.6_Center/kingdevopscenter/kingclient/exe',
  'KingFusion3.6_Center/kingexedb/kingclient/exe',
  'KingFusion3.6_Node/kingexedb/kingclient/exe',
  'KingFusion3.6_Center/common', 'KingFusion3.6_Node/common',
];
const configurationFiles = [
  'KingFusion3.6_Center/config/common.json', 'KingFusion3.6_Center/config/devconfig.json',
  'KingFusion3.6_Node/config/common.json', 'KingFusion3.6_Node/config/proxyconfig.json',
];
const hash = content => createHash('sha256').update(content).digest('hex');
const privateMaterial = /\b(?:sk-[A-Za-z0-9_-]{24,}|(?:ghp_|github_pat_)[A-Za-z0-9_]{25,})\b|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----(?:\s|\\[rn])+[A-Za-z0-9+/=]{32,}/;
const credentialUrl = /(?:https?|wss?|postgres(?:ql)?|mysql|mongodb|redis):\/\/[^\s/:"']+:[^\s/@"']+@/;

export function clientStaticResource(relativePath) {
  return ['/public/', '/extension/', '/views/'].some(segment => relativePath.includes(segment));
}

export function clientContentExclusion(relativePath, isDirectory = false) {
  const root = clientContentRoots.find(candidate => relativePath === candidate || relativePath.startsWith(candidate + '/'));
  if (!root) return 'outside-client-content';
  const parts = relativePath.slice(root.length).split('/').filter(Boolean);
  if (parts.some(part => part === '..' || part === '.')) return 'invalid-path';
  if (parts.some(part => part.startsWith('._'))) return 'macos-filesystem-metadata';
  if (parts.some(part => ['node_modules', '.git', '.vscode', '.cache'].includes(part))) return 'installed-dependency-or-editor-metadata';
  if (parts.some(part => part === '.DS_Store' || part === '.env' || part.startsWith('.env.'))) return 'machine-or-private-environment';
  if (parts.length && ['uploads', 'sdb', 'logs', 'log', 'tmp', 'temp'].includes(parts[0])) return 'instance-data';
  if (parts.some(part => part.includes('副本') || /\.(?:bak|backup)$/i.test(part))) return 'explicit-backup';
  if (isVendorReference(relativePath)) {
    if (!(isDirectory ? includeVendorDirectory(relativePath) : includeVendorFile(relativePath))) return 'non-runtime-vendor-artifact';
  }
  if (!isDirectory && relativePath.endsWith('.map')) return 'build-debug-artifact';
  if (!isDirectory && /\.(?:db|sqlite3?|db-wal|db-shm|pem|key|pfx|p12|log|zip|rar|7z|gz)$/i.test(relativePath)) return 'private-runtime-data-or-archive';
  return undefined;
}

export function sanitizeConfiguration(text) {
  const input = JSON.parse(text.replace(/^\uFEFF/, ''));
  let redactions = 0;
  const privateKeyName = /^(?:password|passwd|pwd|secret|secretKey|api_?key|client_?secret|access_?token|refresh_?token|token|privateKey|ssl_key)$/i;
  function visit(value, name = '') {
    if (privateKeyName.test(name) && typeof value === 'string' && value.length) { redactions += 1; return 'KF_REFERENCE_REDACTED'; }
    if (Array.isArray(value)) return value.map(item => visit(item));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, visit(item, key)]));
    return value;
  }
  const output = visit(input);
  return { content: redactions ? JSON.stringify(output, null, 2) + '\n' : text, redactions };
}

async function collectClientFiles(root, excluded) {
  const files = [];
  async function walk(relative) {
    for (const entry of (await readdir(path.join(repositoryRoot, relative), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      const name = `${relative}/${entry.name}`;
      if (entry.isSymbolicLink()) { excluded.push({ path: name, reason: 'symlink' }); continue; }
      const reason = clientContentExclusion(name, entry.isDirectory());
      if (reason) { excluded.push({ path: name, reason }); continue; }
      if (entry.isDirectory()) await walk(name);
      else if (entry.isFile()) files.push(name);
    }
  }
  await walk(root);
  return files;
}

async function completeClientReference() {
  await verifyReference();
  const ts = (await import('../agent-app/node_modules/typescript/lib/typescript.js')).default;
  const manifest = JSON.parse(await readFile(path.join(snapshotRoot, 'manifest.json'), 'utf8'));
  const previous = new Map(manifest.files.map(record => [record.path, record]));
  const excluded = [];
  const files = [];
  for (const root of clientContentRoots) files.push(...await collectClientFiles(root, excluded));
  files.push(...configurationFiles);
  const additions = [];
  const replacements = [];
  for (const relative of [...new Set(files)].sort()) {
    const original = await readFile(path.join(repositoryRoot, relative));
    const originalSha256 = hash(original);
    const existing = previous.get(relative);
    if (existing) {
      if (existing.originalSha256 !== originalSha256) throw new Error(`CLIENT_SOURCE_CHANGED:${relative}`);
      // These three files use password="*" as a display-mask marker, not a credential.
      if (relative.endsWith('/Graphic/Link/trigger/km_inputlinkstring.js') && existing.redactions > 0) {
        const text = original.toString('utf8');
        if (privateMaterial.test(text) || credentialUrl.test(text)) throw new Error(`CLIENT_STATIC_SENSITIVE_CONTENT:${relative}`);
        replacements.push({ relative, content: original, record: {
          ...existing, bytes: original.length, sha256: originalSha256, redactions: 0,
          kind: 'client-static-resource', restoredOriginalStaticBytes: true,
        } });
      }
      continue;
    }
    try { await stat(path.join(snapshotRoot, relative)); throw new Error(`CLIENT_TARGET_EXISTS:${relative}`); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    let content = original;
    let redactions = 0;
    let kind = 'client-static-resource';
    if (/\.(?:[cm]?js|ts)$/.test(relative) && !isVendorReference(relative) && !clientStaticResource(relative)) {
      const result = sanitizeJavaScript(ts, relative, original.toString('utf8'));
      content = result.redactions ? Buffer.from(result.content) : original;
      redactions = result.redactions; kind = 'client-program';
    } else if (relative.endsWith('.json') && (relative.includes('/config/') || configurationFiles.includes(relative))) {
      const result = sanitizeConfiguration(original.toString('utf8'));
      content = result.redactions ? Buffer.from(result.content) : original;
      redactions = result.redactions; kind = 'configuration-template';
    }
    if (/\.(?:[cm]?js|ts|json|html?|css|txt|md)$/.test(relative)) {
      const text = content.toString('utf8');
      if (privateMaterial.test(text) || credentialUrl.test(text)) throw new Error(`CLIENT_SENSITIVE_CONTENT_REQUIRES_REVIEW:${relative}`);
    }
    additions.push({ relative, content, record: { path: relative, bytes: content.length, sha256: hash(content), originalSha256, redactions, kind } });
  }
  for (const item of additions) {
    const target = path.join(snapshotRoot, item.relative);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, item.content, { flag: 'wx' });
  }
  for (const item of replacements) await writeFile(path.join(snapshotRoot, item.relative), item.content);
  const replaced = new Map(replacements.map(item => [item.relative, item.record]));
  const records = [...manifest.files.map(record => replaced.get(record.path) ?? record), ...additions.map(item => item.record)].sort((a, b) => a.path.localeCompare(b.path, 'en'));
  const summary = {
    roots: clientContentRoots, configurationFiles,
    includedClientFiles: new Set(files).size,
    excluded, coverage: 'All regular files in the selected client/common roots accounted for by include or explicit exclusion',
    preservesCoreCacheCode: true, includesPredefinedGraphics: true, includesHT3DEditor: true,
    independentStartupVerified: false,
    restoredStaticResources: records.filter(record => record.restoredOriginalStaticBytes).map(record => record.path),
  };
  const updated = {
    ...manifest, fileCount: records.length, totalBytes: records.reduce((sum, record) => sum + record.bytes, 0),
    redactedFiles: records.filter(record => record.redactions > 0).length,
    redactedLiterals: records.reduce((sum, record) => sum + record.redactions, 0),
    policy: { ...manifest.policy, clientContent: summary }, files: records,
  };
  await writeFile(path.join(snapshotRoot, 'manifest.json'), JSON.stringify(updated, null, 2) + '\n');
  console.log(JSON.stringify({ addedClientFiles: additions.length, restoredStaticFiles: replacements.length, files: records.length, bytes: updated.totalBytes, excludedEntries: excluded.length, independentStartupVerified: false }));
  await verifyReference();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await completeClientReference();
// end
