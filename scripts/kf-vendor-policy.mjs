// modified by jinlong.feng at 2026-10-29 KF客户端完整入库与启动审计
import path from 'node:path';

export const vendorRoots = [
  'KingFusion3.6_Center/kingdevopscenter/kingclient/exe/public/javascripts/ThirdParty',
  'KingFusion3.6_Center/kingexedb/kingclient/exe/public/javascripts/ThirdParty',
  'KingFusion3.6_Node/kingexedb/kingclient/exe/public/javascripts/ThirdParty',
];

export const vendorExcludedDirectories = new Set([
  'node_modules', 'doc', 'docs', 'documentation', 'example', 'examples',
  'demo', 'demos', 'test', 'tests', '__tests__', '__mocks__', 'coverage',
  'cache', 'tmp', 'temp', 'backup', 'backups',
]);

export const vendorExtensions = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.vue', '.css', '.scss', '.less', '.styl',
  '.json', '.html', '.htm', '.properties', '.bcmap', '.png', '.gif', '.jpg',
  '.jpeg', '.svg', '.webp', '.ico', '.cur', '.woff', '.woff2', '.ttf',
  '.eot', '.otf', '.wasm', '.md', '.txt',
]);

function vendorParts(relativePath) {
  if (path.isAbsolute(relativePath) || relativePath.includes('\\')) return undefined;
  const root = vendorRoots.find(candidate => relativePath === candidate || relativePath.startsWith(candidate + '/'));
  if (!root) return undefined;
  const parts = relativePath.slice(root.length).split('/').filter(Boolean);
  if (parts.some(part => part === '.' || part === '..')) return undefined;
  return parts;
}

function excludedPart(part) {
  return part.startsWith('.') || vendorExcludedDirectories.has(part.toLowerCase())
    || part.includes('副本') || /\.(?:bak|backup)$/i.test(part);
}

export function includeVendorDirectory(relativePath) {
  const parts = vendorParts(relativePath);
  return parts !== undefined && !parts.some(excludedPart);
}

export function includeVendorFile(relativePath) {
  const parts = vendorParts(relativePath);
  if (!parts?.length || parts.slice(0, -1).some(excludedPart)) return false;
  const name = parts.at(-1);
  if (name.startsWith('.') || /^(?:test|demo|example)(?:[-_.]|$)/i.test(name)) return false;
  return vendorExtensions.has(path.extname(name).toLowerCase())
    || ['LICENSE', 'LICENCE', 'NOTICE', 'COPYING', 'AUTHORS'].includes(name.toUpperCase());
}

export function isVendorReference(relativePath) {
  return vendorRoots.some(root => relativePath.startsWith(root + '/'));
}

export function vendorSummary(records) {
  const vendorFiles = records.filter(record => isVendorReference(record.path));
  const unique = new Map(vendorFiles.map(record => [record.sha256, record.bytes]));
  return {
    vendorFileCount: vendorFiles.length,
    vendorBytes: vendorFiles.reduce((sum, row) => sum + row.bytes, 0),
    vendorUniqueFileCount: unique.size,
    vendorUniqueBytes: [...unique.values()].reduce((sum, size) => sum + size, 0),
  };
}

export function vendorPolicy() {
  return {
    roots: vendorRoots,
    excludedDirectories: [...vendorExcludedDirectories].sort(),
    extensions: [...vendorExtensions].sort(),
    sourceMaps: 'excluded', explicitCopyDirectories: 'excluded',
    contentPolicy: 'byte-identical to installed sources; no minification, formatting or redaction',
    minifiedRuntimeFiles: 'included', fontsAndImages: 'included',
    distributionSubdirectories: 'included',
  };
}
// end
