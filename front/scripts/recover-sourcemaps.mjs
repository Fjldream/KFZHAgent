import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export async function recoverSources({ mapDirectory, outputDirectory }) {
  const mapFiles = (await readdir(mapDirectory)).filter(name => name.endsWith('.js.map')).sort();
  const collected = new Map();
  const duplicates = new Set();

  for (const mapFile of mapFiles) {
    const map = JSON.parse(await readFile(path.join(mapDirectory, mapFile), 'utf8'));
    for (let index = 0; index < map.sources.length; index += 1) {
      const source = map.sources[index];
      if (!source.startsWith('../../../src/')) continue;
      const relativePath = source.slice('../../../'.length);
      const sourceRoot = path.resolve(outputDirectory, 'src');
      const destination = path.resolve(outputDirectory, relativePath);
      if (destination !== sourceRoot && !destination.startsWith(`${sourceRoot}${path.sep}`)) {
        throw new Error(`Source path escapes src directory: ${relativePath}`);
      }
      const content = map.sourcesContent?.[index];
      if (typeof content !== 'string') throw new Error(`Missing sourcesContent for ${relativePath}`);
      if (collected.has(relativePath)) {
        if (collected.get(relativePath) !== content) {
          throw new Error(`Conflicting sourcemap content for ${relativePath}`);
        }
        duplicates.add(relativePath);
      } else {
        collected.set(relativePath, content);
      }
    }
  }

  for (const [relativePath, content] of collected) {
    const destination = path.join(outputDirectory, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, content);
  }

  return {
    recovered: [...collected.keys()].sort(),
    duplicates: [...duplicates].sort(),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const result = await recoverSources({
    mapDirectory: path.join(root, 'dist/static/js'),
    outputDirectory: root,
  });
  console.log(JSON.stringify(result, null, 2));
}
