import { fileURLToPath, URL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import AutoImport from 'unplugin-auto-import/vite';
import Icons from 'unplugin-icons/vite';
import IconsResolver from 'unplugin-icons/resolver';
import Components from 'unplugin-vue-components/vite';
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers';

export default defineConfig(({ mode }) => {
  const root = fileURLToPath(new URL('.', import.meta.url));
  const env = loadEnv(mode, root, 'VITE_');

  return {
    base: './',
    plugins: [
      vue({
        template: {
          compilerOptions: {
            isCustomElement: tag => tag === 'l-dot-spinner',
          },
        },
      }),
      AutoImport({
        imports: ['vue', 'pinia'],
        resolvers: [ElementPlusResolver()],
        dts: false,
      }),
      Components({
        resolvers: [
          ElementPlusResolver(),
          IconsResolver({ prefix: 'i', enabledCollections: ['ep'] }),
        ],
        dts: false,
      }),
      Icons({ compiler: 'vue3' }),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      proxy: {
        '/opscenter': {
          target: env.VITE_BACKEND_ORIGIN,
          changeOrigin: true,
          secure: false,
        },
      },
    },
    build: {
      outDir: 'build',
    },
  };
});
