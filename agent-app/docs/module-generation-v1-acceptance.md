# KF Module Generation V1 — Acceptance Evidence

Date: 2026-08-12

Runtime target: KingFusion 3.6 SP4

Release conclusion: **not eligible for stable module promotion**. Automatic generation is fail-closed until native KF runtime evidence is completed.

## Automated acceptance

- Golden fixtures: personal portal, industrial dashboard, and admin console.
- Orchestrator: 14 files / 119 tests passed. Golden coverage checks every fixture module against its Registry quality contract, rejects overflow and sibling/inter-module overlap while allowing ancestor containment, and verifies deterministic portal/admin recompilation with `unexpectedChanges=[]`. Dashboard status expands while its chart remains blocked on the exact native-series gap.
- Worker: 4 files / 29 tests passed. Portal/admin packages round-trip; portal evidence also verifies the unpacked asset target path, exact bytes, SHA-256, and native image `src`. Dashboard is deliberately not emitted.
- API root-serial slice: `api.integration.test.ts` 55/55 passed, including server-owned workflow creation semantics.
- Domain client: 36 files / 565 tests passed. The stronger geometry gate exposed and fixed four real card text-to-image overlaps rather than exempting same-module siblings.
- Web: 10 files / 124 tests passed. Generic JSON responses reject empty success bodies; only conversation delivery has an explicit nullable contract.
- Task 13 browser E2E: 2/2 passed. New module generation shows the exact stable-catalog block with no preview/download. Imported-package modification completes upload, blueprint confirmation, approval, build, export, byte-preservation, and unknown-field preservation.
- Fresh root serial was invoked once after review fixes. Captured output completed the API integration slice at 55/55 and returned exit 0, but the current Vitest environment did not print a trustworthy final root-wide count; package-level gates above and E2E are the review counts.

Generated packages are evidence artifacts outside the repository:

| Golden | Path | SHA-256 | Result |
| --- | --- | --- | --- |
| Personal portal | `/tmp/kf-module-generation-v1-acceptance/personal-portal.gz` | `7f166d6046dc025e7835b0c320e545178dbac3a1fdd6daf88303d6d45a39d125` | Agent validation/round-trip pass; native KF pending |
| Admin console | `/tmp/kf-module-generation-v1-acceptance/admin-console.gz` | `384af4f6c2a899c252e6c1230461d2d4272d944be2012ca52a3e0ef982f6e142` | Agent validation/round-trip pass; native KF pending |
| Industrial dashboard | not emitted | n/a | blocked on exact chart-series mapping gap |

## Real DeepSeek smoke

API, worker, and Web were started on isolated local ports with a real DeepSeek key supplied from an ignored local environment file. No key value was printed or stored. The first model request persisted a V2 customer blueprint and reached `design-review`. The confirmation initially exposed a legacy fallback error (`UNSUPPORTED_COMPONENT_CONTENT: navLinks for tabs`). Review removed the temporary text/model-derived workflow inference entirely. `SolutionWorkspace.generationWorkflow` is now a server-owned, tenant-scoped discriminator: migration backfills existing rows to `legacy`, new workspaces are explicitly `module-v1`, and uploads are explicitly `legacy`. Routing reads only this field, workspace mode, and accepted artifacts/module plans; negated or ordinary user wording cannot change it. New module-v1 generation now fails closed at `MODULE_STABLE_CATALOG_EMPTY` rather than falling back or consuming beta modules.

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
pnpm --dir agent-app --filter @kf/domain-client test
pnpm --dir agent-app --filter @kf/worker test
pnpm --dir agent-app --filter @kf/web test
TEST_DATABASE_URL=<isolated-db> pnpm --dir agent-app test
E2E_DATABASE_URL=<isolated-db> E2E_API_PORT=31313 E2E_WEB_PORT=5273 pnpm --dir agent-app exec playwright test tests/e2e/module-generation.spec.ts
DATABASE_URL=<isolated-db> pnpm --dir agent-app exec prisma validate
DATABASE_URL=<isolated-db> pnpm --dir agent-app exec prisma migrate deploy
git diff --check
```

Prisma generate/validate/deploy/status passed on Node 20 and an isolated clone. A row inserted before the migration read back exactly `legacy` afterwards. Migration diff reports only the pre-existing `DomainProjectRevision` index-name discrepancy. All affected package tests and all 11 package typechecks passed. Workspace lint has a pre-existing baseline failure in `packages/preview-renderer/src/renderer.ts` (three `no-unnecessary-type-assertion` findings); the file was not changed by Task 13 and all changed scopes lint clean.

Credential audit found no new secret in changed files. A pre-existing plaintext KF server credential remains in `docs/kf-control-acceptance.md`; its value is intentionally omitted here. Generated packages, screenshots, cookies, environment files, and secrets are not committed.
