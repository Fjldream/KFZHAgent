# KF Module Generation V1 — Acceptance Evidence

Date: 2026-08-12

Runtime target: KingFusion 3.6 SP4

Release conclusion: **not eligible for stable module promotion**. Automatic generation is fail-closed until native KF runtime evidence is completed.

## Automated acceptance

- Golden fixtures: personal portal, industrial dashboard, and admin console.
- Orchestrator golden integration: 7/7 passed. Portal and admin compile with exact beta maturity warnings; the dashboard remains blocked on `kf36-static-chart-series-mapping-unverified`.
- Worker golden packaging and native round-trip: 18/18 passed. Portal and admin packages validate and retain traced native controls and approved assets. The dashboard package is deliberately not emitted because its chart is blocked.
- API: 227/227 passed. Explicit module generation remains on the module workflow and returns `MODULE_STABLE_CATALOG_EMPTY` before any build when no definition is stable.
- Web: 120/120 passed; typecheck and lint passed.
- Task 13 browser E2E: 2/2 passed. New module generation shows the exact stable-catalog block with no preview/download. Imported-package modification completes upload, blueprint confirmation, approval, build, export, byte-preservation, and unknown-field preservation.
- Root serial suite: 95 files / 1272 tests passed in 64.49 seconds.

Generated packages are evidence artifacts outside the repository:

| Golden | Path | SHA-256 | Result |
| --- | --- | --- | --- |
| Personal portal | `/tmp/kf-module-generation-v1-acceptance/personal-portal.gz` | `7f166d6046dc025e7835b0c320e545178dbac3a1fdd6daf88303d6d45a39d125` | Agent validation/round-trip pass; native KF pending |
| Admin console | `/tmp/kf-module-generation-v1-acceptance/admin-console.gz` | `384af4f6c2a899c252e6c1230461d2d4272d944be2012ca52a3e0ef982f6e142` | Agent validation/round-trip pass; native KF pending |
| Industrial dashboard | not emitted | n/a | blocked on exact chart-series mapping gap |

## Real DeepSeek smoke

API, worker, and Web were started on isolated local ports with a real DeepSeek key supplied from an ignored local environment file. No key value was printed or stored. The first model request persisted a V2 customer blueprint and reached `design-review`. The confirmation initially exposed a legacy fallback error (`UNSUPPORTED_COMPONENT_CONTENT: navLinks for tabs`). The integration was corrected so an explicit module request keeps its module-workflow identity and now fails closed at `MODULE_STABLE_CATALOG_EMPTY`; it does not fall back to per-control generation or consume beta modules.

## Native KF acceptance

Chrome contained existing KF pages, but the current authenticated state could not be verified: claiming/opening the server tab timed out three times before DOM or screenshot evidence was available. No safe environment/ignored-secret KF credential source existed, and a historical plaintext credential found in repository documentation was not used. Consequently:

- no package was uploaded through the native KF development UI;
- no runtime navigation, tabs, form, table, chart, or status interaction was claimed;
- no KF screenshot exists for this Task;
- no module definition was promoted.

## Exact maturity decisions

All exact `@1.0.0` definitions remain `beta`: `navigation.top`, `navigation.sidebar`, `content.hero`, `metric.kpi-grid`, `content.card-grid`, `content.timeline`, `interaction.tabs-filter`, `form.record-editor`, `content.contact-footer`, `data.chart-panel`, `data.status-grid`, `data.table`, `data.detail`, `action.toolbar`, and `feedback.alert-list`.

`data.chart-panel@1.0.0` additionally retains the blocking gap `kf36-static-chart-series-mapping-unverified`. Static Trend/Bar/Pie fields were not guessed. The remaining modules have strong automated compile/package evidence, but that is not a substitute for native KF runtime evidence.

## Commands and release checks

Representative commands used with the bundled arm64 Node runtime:

```text
pnpm --dir agent-app --filter @kf/agent-orchestrator test
pnpm --dir agent-app --filter worker test
pnpm --dir agent-app --filter api test
pnpm --dir agent-app --filter web test
E2E_API_PORT=3018 E2E_WEB_PORT=5188 pnpm --dir agent-app exec playwright test tests/e2e/module-generation.spec.ts
pnpm --dir agent-app test
git diff --check
```

All affected package tests/typechecks passed. Workspace lint has a pre-existing baseline failure in `packages/preview-renderer/src/renderer.ts` (three `no-unnecessary-type-assertion` findings); the file was not changed by Task 13 and all changed scopes lint clean.

Credential audit found no new secret in changed files. A pre-existing plaintext KF server credential remains in `docs/kf-control-acceptance.md`; its value is intentionally omitted here. Generated packages, screenshots, cookies, environment files, and secrets are not committed.
