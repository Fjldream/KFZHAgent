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
