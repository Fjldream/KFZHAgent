// modified by jinlong.feng at 2026-10-29 KF源码精简入库
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const outputRoot = path.join(repositoryRoot, 'kf-reference');
const sourceRoots = ['KingFusion3.6_Center', 'KingFusion3.6_Node'];
const excludedDirectories = new Set([
  'node_modules', 'setup', 'env', 'sdb', 'logs', 'log', 'Log', 'CPPLOG',
  'uploads', 'storage', 'ThirdParty', 'thirdparty', 'third-party', 'vendor',
  'vendors', 'nginx', 'redis', 'dist', 'dist1', 'coverage', 'cache', 'temp',
  'tmp', 'backups', 'backup', 'HT3DEditor', 'Predefined', 'demo', 'help',
  'OpcUa', 'data', 'data1', 'old', 'bak', 'build', 'test-results', 'www', 'oem',
]);
const sourceExtensions = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.vue', '.html', '.htm', '.css', '.scss',
  '.less', '.json', '.ejs', '.pug', '.jade', '.md', '.sh', '.c', '.cc',
  '.cpp', '.h', '.hpp', '.proto',
]);
const manifestJsonNames = new Set([
  'package.json', 'package-lock.json', 'tsconfig.json',
  'tsconfig.app.json', 'tsconfig.node.json',
]);
const redactedValue = 'KF_REFERENCE_REDACTED';
const credentialName = /^(?:password|passwd|pwd|secret|api_?key|accessKeySecret|privateKey|client_?secret|session_?secret|secret_?key)$/i;
const tokenPattern = /\b(?:sk-[a-zA-Z0-9_-]{24,}|(?:ghp_|github_pat_)[a-zA-Z0-9_]{25,})\b/;
const privateKeyPattern = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/;
const credentialUrl = /(?:https?|postgres(?:ql)?|mysql|mongodb|redis):\/\/[^\s/:"']+:[^\s/@"']+@/;
const digest = data => createHash('sha256').update(data).digest('hex');

export function includeFile(relativePath) {
  const parts = relativePath.split('/');
  const name = parts.at(-1);
  const extension = path.extname(name).toLowerCase();
  if (!sourceExtensions.has(extension) || name.endsWith('.min.js') || name.endsWith('.min.css') || name.includes('.bak')) return false;
  if (relativePath.includes('/src/public/static/') || relativePath.includes('/views/layui/') || relativePath.includes('/views/tpl/')) return false;
  if (parts.includes('views') && parts.some(part => ['assets', 'js', 'scripts', 'css', 'font', 'fonts', 'images'].includes(part))) return false;
  if (parts.includes('config') && extension !== '.js') return false;
  if (extension === '.json' && !manifestJsonNames.has(name)
    && !parts.some(part => ['Graphic', 'DevelopClient', 'RunClient', 'Common'].includes(part))) return false;
  return true;
}

async function walk(directory, relativePath) {
  const files = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
    const relative = `${relativePath}/${entry.name}`;
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (!entry.name.startsWith('.') && !entry.name.startsWith('exedb_') && !excludedDirectories.has(entry.name)) {
        files.push(...await walk(path.join(directory, entry.name), relative));
      }
    } else if (includeFile(relative)) files.push(relative);
  }
  return files;
}

function localizationFile(relativePath) {
  return /\/(?:Global\/kmui_(?:en|ko|zh)_resource\.js|views\/lang\/)/.test(relativePath);
}

function propertyName(ts, node) {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (ts.isElementAccessExpression(node) && node.argumentExpression && ts.isStringLiteral(node.argumentExpression)) return node.argumentExpression.text;
  return '';
}

function credentialLiteral(ts, node, relativePath) {
  if ((!ts.isStringLiteral(node) && !ts.isNoSubstitutionTemplateLiteral(node)) || node.text === redactedValue || !node.text) return false;
  if (tokenPattern.test(node.text) || privateKeyPattern.test(node.text) || credentialUrl.test(node.text)) return true;
  if (localizationFile(relativePath)) return false;
  const parent = node.parent;
  if ((ts.isPropertyAssignment(parent) || ts.isVariableDeclaration(parent)) && parent.initializer === node) return credentialName.test(propertyName(ts, parent.name));
  return ts.isBinaryExpression(parent) && parent.right === node
    && parent.operatorToken.kind === ts.SyntaxKind.EqualsToken
    && credentialName.test(propertyName(ts, parent.left));
}

export function sanitizeJavaScript(ts, relativePath, sourceText) {
  const parsed = ts.createSourceFile(relativePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  let matches = 0;
  function inspect(node) {
    if (credentialLiteral(ts, node, relativePath)) matches += 1;
    ts.forEachChild(node, inspect);
  }
  inspect(parsed);
  if (!matches) return { content: sourceText, redactions: 0 };
  if (parsed.parseDiagnostics.length) throw new Error(`SOURCE_PARSE_FAILED:${relativePath}`);
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  // Format the reference copy before changing any compressed source literal.
  const formatted = printer.printFile(parsed);
  const formattedSource = ts.createSourceFile(relativePath, formatted, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const transformed = ts.transform(formattedSource, [context => {
    function visit(node) {
      if (credentialLiteral(ts, node, relativePath)) return ts.factory.createStringLiteral(redactedValue);
      return ts.visitEachChild(node, visit, context);
    }
    return node => ts.visitNode(node, visit);
  }]);
  try {
    const content = '// modified by jinlong.feng at 2026-10-29 KF源码精简入库\n'
      + '// Reference snapshot: credential literals redacted; do not deploy this copy.\n'
      + printer.printFile(transformed.transformed[0]) + '// end\n';
    return { content, redactions: matches };
  } finally { transformed.dispose(); }
}

async function exportReference() {
  try { await stat(outputRoot); throw new Error('OUTPUT_EXISTS: verify it or choose a clean checkout; existing snapshots are never deleted'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const ts = (await import('../agent-app/node_modules/typescript/lib/typescript.js')).default;
  const relativeFiles = [];
  for (const sourceRoot of sourceRoots) relativeFiles.push(...await walk(path.join(repositoryRoot, sourceRoot), sourceRoot));
  const records = [];
  // Prepare every file in memory before creating the snapshot (fail closed).
  const prepared = [];
  for (const relativePath of relativeFiles.sort()) {
    const original = await readFile(path.join(repositoryRoot, relativePath));
    const sourceText = original.toString('utf8');
    let result = { content: sourceText, redactions: 0 };
    if (/\.(?:[cm]?js|ts)$/.test(relativePath)) result = sanitizeJavaScript(ts, relativePath, sourceText);
    if (tokenPattern.test(result.content) || privateKeyPattern.test(result.content) || credentialUrl.test(result.content)) throw new Error(`SENSITIVE_CONTENT_REQUIRES_REVIEW:${relativePath}`);
    const content = result.redactions ? Buffer.from(result.content) : original;
    prepared.push({ relativePath, content });
    records.push({ path: relativePath, bytes: content.length, sha256: digest(content), originalSha256: digest(original), redactions: result.redactions });
  }
  for (const { relativePath, content } of prepared) {
    const target = path.join(outputRoot, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, { flag: 'wx' });
  }
  const manifest = {
    schemaVersion: 1, date: '2026-10-29', purpose: 'Read-only, credential-redacted KF source reference; not an installable distribution',
    sourceRoots, policy: { excludedDirectories: [...excludedDirectories].sort(), sourceExtensions: [...sourceExtensions].sort(), instanceConfigurationJson: 'excluded', fieldSiteCopies: 'excluded' },
    fileCount: records.length, totalBytes: records.reduce((sum, row) => sum + row.bytes, 0),
    redactedFiles: records.filter(row => row.redactions).length,
    redactedLiterals: records.reduce((sum, row) => sum + row.redactions, 0), files: records,
  };
  await writeFile(path.join(outputRoot, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ files: manifest.fileCount, bytes: manifest.totalBytes, redactedFiles: manifest.redactedFiles, redactedLiterals: manifest.redactedLiterals }));
}

async function verifyReference() {
  const manifest = JSON.parse(await readFile(path.join(outputRoot, 'manifest.json'), 'utf8'));
  const paths = new Set();
  for (const record of manifest.files) {
    if (paths.has(record.path) || path.isAbsolute(record.path) || record.path.split('/').includes('..') || !sourceRoots.some(root => record.path.startsWith(root + '/'))) throw new Error('INVALID_MANIFEST_PATH');
    paths.add(record.path);
    const content = await readFile(path.join(outputRoot, record.path));
    if (content.length !== record.bytes || digest(content) !== record.sha256) throw new Error(`SNAPSHOT_MISMATCH:${record.path}`);
    const text = content.toString('utf8');
    if (tokenPattern.test(text) || privateKeyPattern.test(text) || credentialUrl.test(text)) throw new Error(`SENSITIVE_CONTENT_REQUIRES_REVIEW:${record.path}`);
  }
  if (paths.size !== manifest.fileCount) throw new Error('MANIFEST_COUNT_MISMATCH');
  console.log(JSON.stringify({ verifiedFiles: paths.size, bytes: manifest.totalBytes, redactedFiles: manifest.redactedFiles }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const operation = process.argv[2];
  if (operation === '--export') await exportReference();
  else if (operation === '--verify') await verifyReference();
  else throw new Error('Usage: node scripts/export-kf-reference.mjs --export|--verify');
}
// end
