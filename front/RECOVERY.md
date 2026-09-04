# Operations Center Source Recovery

## Recovered source coverage

The following application code was restored directly from the distributed JavaScript sourcemaps: `src/App.vue`, `src/main.js`, and `src/plugins/echarts.js`; the JavaScript modules in `src/api`, `src/composables`, `src/i18n`, `src/router`, `src/stores`, and `src/utils`; and the Vue single-file components in `src/components` and `src/views`.  This covers the login/SSO flow, main operations views, load-balancer management, running-node management, maintenance logs, API calls, routing, state, localization, and WebSocket client code.

`src/assets/icons/sprite.svg` was rebuilt from the SVG symbol content in the production bundle.  `src/plugins/svg-icons-register.js` was rebuilt as a compatibility replacement for the `virtual:svg-icons-register` module, rather than restored from a sourcemap.  `src/style.scss` was recovered from the compiled global CSS.  The image assets under `src/assets/image` were recovered as binary assets needed by the restored views.

## Build-time recovery

`vite.config.js` restores the original compile-time conventions used by the recovered source:

- Vue and Pinia APIs, plus Element Plus APIs, are imported on demand with `unplugin-auto-import`.
- Element Plus components and `IEp*` icons are resolved on demand with `unplugin-vue-components` and `unplugin-icons` using the `ep` icon collection.
- The `l-dot-spinner` element registered by `ldrs` is compiled as a native custom element.

The checked-in `.env` is loaded by Vite in a clean checkout.  `.env.example` contains the same non-sensitive defaults:

```dotenv
VITE_LANGUAGE=zh
VITE_PROXY_DOMAIN=/opscenter
VITE_ROUTE_DEFAULT=/login
VITE_ROUTE_MAIN=["calculationProject","collectProject","clientProject","dataSourceProject","alarmProject"]
VITE_BACKEND_ORIGIN=https://127.0.0.1
```

During local development, Vite proxies `/opscenter` to `https://127.0.0.1` with `changeOrigin: true` and `secure: false` for the local self-signed certificate.  The prefix is not rewritten.  Production application code continues to use the relative `/opscenter` prefix, so the development backend origin is not embedded in the browser bundle.

## Build

Use Node.js 22.14.0.  From the repository root, run:

```bash
cd front && npm run build
```

Vite writes the production output to `front/build`; the original `front/dist` is not used as the output directory.

## Source recovery CLI

Direct execution requires an explicit output directory and never defaults to the post-processed `front/src` tree:

```bash
cd front
node scripts/recover-sourcemaps.mjs --output .recovery-staging
```

The exported `recoverSources({ mapDirectory, outputDirectory })` API remains available for programmatic use.  Sourcemap `sourcesContent` is written byte-for-byte, including CRLF line endings.  `front/.gitattributes` scopes Git's `cr-at-eol` whitespace handling to `src/**`; it does not normalize or rewrite recovered files.

## Fidelity boundary

The `opsResourceStore` persistence declaration, including its `enabled`, `pick`, and state fields, remains exactly as recovered from the original sourcemap.  Its behavior is inherited product behavior and was deliberately not changed during source recovery.

## Runtime limitation

This repository restores the frontend code and its production build.  The browser smoke isolates only the OEM configuration request; login/SSO, authenticated API calls, and WebSocket monitoring still require real credentials and reachable backend endpoints and were not validated end to end.

## Verification (2026-09-04)

Using Node.js 22.14.0 (`PATH=/Users/fengjinlong/.nvm/versions/node/v22.14.0/bin:$PATH`):

- `cd front && npm test` — PASS, 9/9 tests passed, 0 failed.  The suite includes a real Vite production build in a temporary output directory and source-transform assertions for Vue/Pinia/Element Plus APIs, Element Plus components, and `IEp*` icons.
- Clean `cd front && npm run build` — PASS, Vite 6.4.3 built `front/build`; the existing `front/dist` was not used as the output directory. The build emitted only inherited `::v-deep` deprecation and large-chunk warnings.
- `cd front && npm run dev -- --host 127.0.0.1 --port 4177 --strictPort` — PASS. Vite reported `http://127.0.0.1:4177/` ready with no startup module-resolution errors, and the process was stopped after the browser smoke.
- Playwright 1.62.1 with installed Google Chrome — PASS.  A real browser loaded `/` (HTTP 200), executed JavaScript, mounted the Vue app, redirected to `#/login`, and displayed the Element Plus login form with two inputs, one password input, one login button, and two rendered `IEp` SVGs.  `/opscenter/oemConfig` was intercepted with a store-shaped response.  Captured page errors, console errors, and Vue unresolved-component/directive warnings were all empty.
- `front/dist` preservation — PASS, 70 files and manifest SHA-256 `ea1f01cfaf668cf34f3fb49574481d8d1d0d86226b7c64d6934fa950710042cd`.

These checks validate the restored build chain and login-page startup.  They do not claim authenticated or WebSocket end-to-end coverage.
