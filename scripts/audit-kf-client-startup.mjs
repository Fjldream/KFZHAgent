// modified by jinlong.feng at 2026-10-29 KF客户端完整入库与启动审计
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { clientContentRoots, clientContentExclusion } from './complete-kf-client-reference.mjs';

const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const snapshot = path.join(root, 'kf-reference');
const builtin = new Set(builtinModules.flatMap(name => [name, name.replace(/^node:/, ''), `node:${name}`]));
const exists = name => stat(name).then(info => info.isFile(), () => false);
const directoryExists = name => stat(name).then(info => info.isDirectory(), () => false);

export function auditOutputPath(repositoryRoot, filename) {
  const normalizedRoot = path.resolve(repositoryRoot);
  const output = path.resolve(normalizedRoot, filename);
  if (!output.startsWith(normalizedRoot + path.sep)) throw new Error('AUDIT_OUTPUT_OUTSIDE_REPOSITORY');
  return output;
}

export function literalDependencies(source) {
  const packages = new Set();
  const relative = new Set();
  for (const match of source.matchAll(/\brequire\(\s*(["'])([^"'\r\n]+)\1\s*\)/g)) {
    const name = match[2];
    if (name.startsWith('.')) relative.add(name);
    else if (!builtin.has(name) && !name.startsWith('node:') && !path.isAbsolute(name)) {
      packages.add(name.startsWith('@') ? name.split('/').slice(0, 2).join('/') : name.split('/')[0]);
    }
  }
  return { packages: [...packages].sort(), relative: [...relative].sort() };
}

export function requireScopes(ts, sourceText, request) {
  const source = ts.createSourceFile('audit.js', sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const sites = [];
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require'
      && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text === request) {
      const functions = [];
      let conditional = false;
      let guardedByCatch = false;
      let catchRethrows = false;
      for (let ancestor = node.parent; ancestor; ancestor = ancestor.parent) {
        if (ts.isFunctionLike(ancestor)) functions.push(ancestor.name?.getText(source) ?? '<anonymous>');
        if (ts.isIfStatement(ancestor) || ts.isConditionalExpression(ancestor) || ts.isCaseClause(ancestor)) conditional = true;
        if (ts.isTryStatement(ancestor) && ancestor.catchClause
          && node.pos >= ancestor.tryBlock.pos && node.end <= ancestor.tryBlock.end) {
          guardedByCatch = true;
          function inspectCatch(statement) {
            if (ts.isFunctionLike(statement)) return;
            if (ts.isThrowStatement(statement)) catchRethrows = true;
            ts.forEachChild(statement, inspectCatch);
          }
          inspectCatch(ancestor.catchClause.block);
        }
      }
      sites.push({ functionScopes: functions, eagerTopLevel: functions.length === 0 && !conditional, guardedByCatch, catchRethrows });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return sites;
}

async function jsFiles(base) {
  if (!await directoryExists(base)) return [];
  const files = [];
  for (const item of await readdir(base, { withFileTypes: true })) {
    if (item.isSymbolicLink() || ['node_modules', '.git'].includes(item.name)) continue;
    const name = path.join(base, item.name);
    if (item.isDirectory()) files.push(...await jsFiles(name));
    else if (item.isFile() && item.name.endsWith('.js')) files.push(name);
  }
  return files;
}

async function sourceFile(relative) {
  if (await exists(path.join(root, relative))) return path.join(root, relative);
  return path.join(snapshot, relative);
}

async function resolveRelative(source, request, base) {
  const target = path.resolve(base, path.dirname(source), request);
  if (!target.startsWith(base + path.sep)) return undefined;
  for (const candidate of [target, target + '.js', target + '.json', target + '.node', path.join(target, 'index.js'), path.join(target, 'index.json')]) {
    if (await exists(candidate)) return path.relative(base, candidate).split(path.sep).join('/');
  }
  return undefined;
}

async function nativeBindings(packageRoot) {
  if (!await directoryExists(packageRoot)) return [];
  const results = [];
  async function walk(directory) {
    for (const item of await readdir(directory, { withFileTypes: true })) {
      if (item.isSymbolicLink() || item.name === 'node_modules') continue;
      const name = path.join(directory, item.name);
      if (item.isDirectory()) await walk(name);
      else if (item.isFile() && item.name.endsWith('.node')) {
        const data = await readFile(name);
        let format = 'unknown';
        let architecture = 'unknown';
        if (data[0] === 0x4d && data[1] === 0x5a) { format = 'Windows PE'; architecture = 'platform-specific'; }
        else if (data.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46]))) {
          format = 'Linux ELF'; const machine = data[5] === 1 ? data.readUInt16LE(18) : data.readUInt16BE(18);
          architecture = machine === 62 ? 'x86_64' : machine === 183 ? 'arm64' : String(machine);
        }
        results.push({ path: path.relative(packageRoot, name).split(path.sep).join('/'), format, architecture });
      }
    }
  }
  await walk(packageRoot);
  return results;
}

async function auditClient(relativeRoot) {
  const installation = relativeRoot.split('/')[0];
  const originalAvailable = await directoryExists(path.join(root, relativeRoot));
  const base = originalAvailable ? root : snapshot;
  const files = [];
  for (const directory of ['core', 'lib', 'server']) files.push(...await jsFiles(path.join(base, relativeRoot, directory)));
  files.push(...await jsFiles(path.join(base, installation, 'common')));
  for (const name of ['index.js', 'app.js']) if (await exists(path.join(base, relativeRoot, name))) files.push(path.join(base, relativeRoot, name));
  const packages = new Map();
  const missingRelativeModules = [];
  const unresolvedOriginalImports = [];
  for (const file of files) {
    const relative = path.relative(base, file).split(path.sep).join('/');
    const dependencies = literalDependencies(await readFile(file, 'utf8'));
    for (const name of dependencies.packages) packages.set(name, (packages.get(name) ?? 0) + 1);
    for (const request of dependencies.relative) {
      const target = await resolveRelative(relative, request, base);
      if (!target) unresolvedOriginalImports.push({ source: relative, request });
      else if (!await exists(path.join(snapshot, target))) missingRelativeModules.push({ source: relative, request, target });
    }
  }
  const packageJson = JSON.parse(await readFile(await sourceFile(relativeRoot + '/package.json'), 'utf8'));
  const declarations = packageJson.dependencies ?? {};
  const dependencies = [];
  for (const [name, consumers] of [...packages].sort((a, b) => a[0].localeCompare(b[0], 'en'))) {
    const packageRoot = path.join(root, installation, 'node_modules', name);
    const installed = await exists(path.join(packageRoot, 'package.json')) ? JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8')) : undefined;
    dependencies.push({ name, literalConsumerCount: consumers, declared: name in declarations,
      installedVersion: installed?.version ?? null, engines: installed?.engines ?? null,
      nativeBindings: await nativeBindings(packageRoot), linuxRebuildVerified: false });
  }
  return {
    root: relativeRoot, originalInstallationAvailable: originalAvailable, backendFilesScanned: files.length,
    dependencyDeclarationCount: Object.keys(declarations).length,
    undeclaredDependencies: dependencies.filter(item => !item.declared).map(item => item.name), dependencies,
    packageLockPresent: await exists(path.join(snapshot, relativeRoot, 'package-lock.json')),
    startScriptPresent: Boolean(packageJson.scripts?.start), missingRelativeModules, unresolvedOriginalImports,
  };
}

async function contentCoverage(manifest) {
  const records = new Set(manifest.files.map(record => record.path));
  const groups = [];
  for (const relativeRoot of clientContentRoots) {
    if (!await directoryExists(path.join(root, relativeRoot))) { groups.push({ root: relativeRoot, originalComparisonAvailable: false }); continue; }
    let expectedFiles = 0;
    const missing = [];
    const excluded = [];
    async function walk(relative) {
      for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
        const name = `${relative}/${entry.name}`;
        if (entry.isSymbolicLink()) { excluded.push({ path: name, reason: 'symlink' }); continue; }
        const reason = clientContentExclusion(name, entry.isDirectory());
        if (reason) { excluded.push({ path: name, reason }); continue; }
        if (entry.isDirectory()) await walk(name);
        else if (entry.isFile()) { expectedFiles += 1; if (!records.has(name)) missing.push(name); }
      }
    }
    await walk(relativeRoot);
    groups.push({ root: relativeRoot, originalComparisonAvailable: true, expectedFiles, missingFiles: missing, explicitExclusions: excluded.length });
  }
  return { groups, missingFileCount: groups.reduce((sum, item) => sum + (item.missingFiles?.length ?? 0), 0), allRootsCompared: groups.every(item => item.originalComparisonAvailable) };
}

function dockerStatus() {
  const result = spawnSync('docker', ['version', '--format', '{{json .}}'], { encoding: 'utf8', timeout: 12000 });
  if (result.error?.code === 'ENOENT') return { cliAvailable: false, daemonReachable: false };
  if (result.status !== 0) return { cliAvailable: true, daemonReachable: false, errorCode: 'DOCKER_DAEMON_UNREACHABLE' };
  const info = JSON.parse(result.stdout);
  return { cliAvailable: true, daemonReachable: true, clientVersion: info.Client?.Version, serverVersion: info.Server?.Version, os: info.Server?.Os, architecture: info.Server?.Arch };
}

async function main() {
  const manifest = JSON.parse(await readFile(path.join(snapshot, 'manifest.json'), 'utf8'));
  const clients = [];
  for (const relative of clientContentRoots.slice(0, 3)) clients.push(await auditClient(relative));
  let astValidationAvailable = false;
  try {
    const ts = (await import('../agent-app/node_modules/typescript/lib/typescript.js')).default;
    astValidationAvailable = true;
    for (const client of clients) for (const entry of client.unresolvedOriginalImports) {
      entry.astCallSites = requireScopes(ts, await readFile(await sourceFile(entry.source), 'utf8'), entry.request);
    }
  } catch (error) {
    if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  }
  const eagerImportGaps = [...new Map(clients.flatMap(client => client.unresolvedOriginalImports)
    .filter(entry => entry.astCallSites?.some(site => site.eagerTopLevel && (!site.guardedByCatch || site.catchRethrows)))
    .map(entry => [entry.source + '|' + entry.request, entry])).values()];
  const guardedImportGaps = [...new Map(clients.flatMap(client => client.unresolvedOriginalImports)
    .filter(entry => entry.astCallSites?.some(site => site.eagerTopLevel && site.guardedByCatch && !site.catchRethrows))
    .map(entry => [entry.source + '|' + entry.request, entry])).values()];
  const coverage = await contentCoverage(manifest);
  const docker = process.argv.includes('--docker') ? dockerStatus() : { checked: false };
  const licenseStatus = process.argv.includes('--no-license') ? 'user-reported-unavailable' : 'not-verified';
  const report = {
    date: '2026-10-29', target: 'Linux / Docker', method: 'read-only installed-source and snapshot audit; static literal require scan does not prove dynamic dependency closure',
    runtimeStartupAttempted: false, dockerBuildAttempted: false, independentStartupVerified: false,
    sourceManifestFiles: manifest.fileCount, sourceManifestBytes: manifest.totalBytes,
    contentCoverage: coverage, clients, docker, licenseStatus,
    astValidationAvailable, unguardedModuleLevelImportGaps: eagerImportGaps,
    entryPointReachabilityVerified: false,
    guardedOriginalImportGaps: guardedImportGaps,
    sourceFindings: eagerImportGaps.length ? [{ id: 'KF_SOURCE_UNRESOLVED_MODULE_LEVEL_IMPORT', detail: 'checkProjectPermission.js requires absent core/enums/public at module scope. Entry-point reachability is not established; this is a source gap, not a reproduced startup failure' }] : [],
    capabilityFindings: guardedImportGaps.length ? [{ id: 'KF_RUNTIME_THIRD_TOKEN_MODULE_UNAVAILABLE', detail: 'Runtime catches missing checkThirdToken during controller loading, but the checkThirdToken handler dereferences it without a null guard; that endpoint remains unavailable' }] : [],
    blockingFindings: [
      ...(coverage.missingFileCount ? [{ id: 'KF_STARTUP_CONTENT_MISSING', detail: 'Program or resource files still missing from declared client content scope' }] : []),
      { id: 'KF_STARTUP_DEPENDENCIES_UNDECLARED', detail: 'Client package manifests do not declare their observed server dependencies; a reproducible Linux install manifest and lockfile are required' },
      { id: 'KF_STARTUP_NATIVE_REBUILD_UNVERIFIED', detail: 'SQLite native modules must be rebuilt or installed for the selected Linux architecture and Node ABI; installed better-sqlite3 binaries observed here are Windows PE' },
      { id: 'KF_STARTUP_CONFIGURATION_NOT_INITIALIZED', detail: 'Configuration samples contain redacted private values; runtime configuration and secret injection are not implemented' },
      { id: 'KF_STARTUP_PROJECT_BOOTSTRAP_MISSING', detail: 'Runtime requires an explicit project path, externalconfig.json and parent project.json; isolated sdb and demo-project initialization are required' },
      { id: 'KF_STARTUP_SERVICE_STACK_MISSING', detail: 'Gateway, OAuth, authorization and other configured services need a real deployment stack, routing and health checks; the existing agent-app stack is a different product' },
      { id: 'KF_STARTUP_AUTHORIZATION_UNAVAILABLE', detail: 'No usable standalone KF test authorization was provided; authentication and licensed runtime acceptance remain unverified' },
      ...(!docker.daemonReachable && process.argv.includes('--docker') ? [{ id: 'KF_STARTUP_DOCKER_UNAVAILABLE', detail: 'Docker CLI is installed but the Docker daemon is not reachable on this host' }] : []),
    ],
  };
  const outputIndex = process.argv.indexOf('--output');
  if (outputIndex !== -1) {
    const output = auditOutputPath(root, process.argv[outputIndex + 1]);
    await writeFile(output, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ output: path.relative(root, output), missingClientContent: coverage.missingFileCount, clients: clients.map(client => ({ root: client.root, undeclaredDependencies: client.undeclaredDependencies.length, missingRelativeModules: client.missingRelativeModules.length })), blockers: report.blockingFindings.map(item => item.id), independentStartupVerified: false }));
  } else console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
// end
