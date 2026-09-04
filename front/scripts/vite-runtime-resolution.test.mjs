import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build, createServer } from 'vite';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));

test('production build resolves recovered auto imports without embedding the development backend', async () => {
  const outputDirectory = await mkdtemp(path.join(tmpdir(), 'kf-vite-build-'));

  try {
    await build({
      root: projectRoot,
      logLevel: 'silent',
      build: {
        outDir: outputDirectory,
        emptyOutDir: true,
      },
    });

    const outputFiles = await readdir(outputDirectory, { recursive: true });
    const javascriptFiles = outputFiles.filter(file => file.endsWith('.js'));
    const productionJavaScript = (
      await Promise.all(javascriptFiles.map(file => readFile(path.join(outputDirectory, file), 'utf8')))
    ).join('\n');

    const unresolvedRuntimeCall = productionJavaScript.match(/(?<![\w$])(ref|reactive|computed|watch|nextTick|onMounted|onUnmounted|useTemplateRef|storeToRefs|ElMessage|ElMessageBox)\s*\(/)?.[0] ?? null;
    assert.equal(unresolvedRuntimeCall, null, `unresolved runtime call: ${unresolvedRuntimeCall}`);
    assert.doesNotMatch(productionJavaScript, /https:\/\/127\.0\.0\.1/);
  } finally {
    await rm(outputDirectory, { recursive: true, force: true });
  }
});

test('Vue transforms resolve Element Plus components and icons while preserving ldrs as a custom element', async () => {
  const server = await createServer({
    root: projectRoot,
    logLevel: 'silent',
    server: { middlewareMode: true },
    optimizeDeps: { noDiscovery: true },
  });

  try {
    const loginTransform = (await server.transformRequest('/src/views/Login/LoginPage.vue')).code;
    const loadingTransform = (await server.transformRequest('/src/components/Loading/LoadingComponent.vue')).code;
    assert.match(loginTransform, /import \{ ElForm as __unplugin_components_/);
    assert.match(loginTransform, /from ["']\/@id\/~icons\/ep\/user-filled["']/);
    assert.doesNotMatch(loginTransform, /resolveComponent\(["'](?:el-|IEp)/);
    assert.doesNotMatch(loadingTransform, /resolveComponent\(["']l-dot-spinner/);
  } finally {
    await server.close();
  }
});
