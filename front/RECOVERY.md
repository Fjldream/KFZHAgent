# Operations Center Source Recovery

## Recovered source coverage

The following application code was restored directly from the distributed JavaScript sourcemaps: `src/App.vue`, `src/main.js`, and `src/plugins/echarts.js`; the JavaScript modules in `src/api`, `src/composables`, `src/i18n`, `src/router`, `src/stores`, and `src/utils`; and the Vue single-file components in `src/components` and `src/views`.  This covers the login/SSO flow, main operations views, load-balancer management, running-node management, maintenance logs, API calls, routing, state, localization, and WebSocket client code.

`src/assets/icons/sprite.svg` was rebuilt from the SVG symbol content in the production bundle.  `src/plugins/svg-icons-register.js` was rebuilt as a compatibility replacement for the `virtual:svg-icons-register` module, rather than restored from a sourcemap.  `src/style.scss` was recovered from the compiled global CSS.  The image assets under `src/assets/image` were recovered as binary assets needed by the restored views.

## Environment defaults

The checked-in `.env.example` provides these defaults:

```dotenv
VITE_LANGUAGE=zh
VITE_PROXY_DOMAIN=/api
VITE_ROUTE_DEFAULT=/login
VITE_ROUTE_MAIN=["calculationProject","collectProject","clientProject","dataSourceProject","alarmProject"]
```

## Build

Use Node.js 22.14.0.  From the repository root, run:

```bash
cd front && npm run build
```

Vite writes the production output to `front/build`; the original `front/dist` is not used as the output directory.

## Runtime limitation

This repository restores the frontend code and its production build only.  Login/SSO, the Axios API wrapper, and the WebSocket monitoring client still require the real backend, proxy configuration, credentials, and reachable WebSocket endpoints.  They cannot be validated as end-to-end functionality with a static frontend build alone.

## Verification (2026-09-04)

Using Node.js 22.14.0 (`PATH=/Users/fengjinlong/.nvm/versions/node/v22.14.0/bin:$PATH`):

- `cd front && npm test` — PASS, 4/4 tests passed, 0 failed.
- `cd front && npm run build` — PASS, Vite 6.4.3 built `front/build`; the existing `front/dist` was not used as the output directory. The build emitted only the existing `::v-deep` deprecation and large-chunk warnings.
- `cd front && npm run dev -- --host 127.0.0.1 --port 4177` — PASS. Vite reported `http://127.0.0.1:4177/` ready in 574 ms with no startup module-resolution errors. The process was stopped with SIGINT and confirmed stopped.
- `curl --fail --silent --show-error http://127.0.0.1:4177/` — PASS, HTTP 200. The response contained `<div id="app"></div>` and `/src/main.js`.

These checks validate the local static entry and development server only.  Login/SSO, API calls, WebSocket monitoring, and other functions requiring a real backend were not validated end to end.
