# KF Module Generation V1 — Acceptance Evidence

Date: 2026-08-12

Runtime target: KingFusion 3.6 SP4

Release conclusion: **five exact module definitions are eligible for stable promotion** after native KF runtime isolation. All other definitions remain beta; chart generation remains fail-closed.

## Automated acceptance

- Golden fixtures: personal portal, industrial dashboard, and admin console.
- Orchestrator: 14 files / 119 tests passed. Golden coverage checks every fixture module against its Registry quality contract, rejects overflow and sibling/inter-module overlap while allowing ancestor containment, and verifies deterministic portal/admin recompilation with `unexpectedChanges=[]`. Dashboard status expands while its chart remains blocked on the exact native-series gap.
- Worker: 4 files / 29 tests passed. Portal/admin packages round-trip; portal evidence also verifies the unpacked asset target path, exact bytes, SHA-256, and native image `src`. Dashboard is deliberately not emitted.
- API aggregate: 228 tests. The focused review run visibly completed `api.integration.test.ts` 55/55, including server-owned workflow creation semantics.
- Domain client: 36 files / 565 tests passed. The stronger geometry gate exposed and fixed four real card text-to-image overlaps rather than exempting same-module siblings.
- Web: 10 files / 124 tests passed. Generic JSON responses reject empty success bodies; only conversation delivery has an explicit nullable contract.
- Task 13 browser E2E: 2/2 passed. New module generation shows the exact stable-catalog block with no preview/download. Imported-package modification completes upload, blueprint confirmation, approval, build, export, byte-preservation, and unknown-field preservation.
- Fresh root serial was invoked once after review fixes. Captured output completed the API integration slice at 55/55 and returned exit 0, but the current Vitest environment did not print a trustworthy final root-wide count; package-level gates above and E2E are the review counts. A prior independent fresh run at Task 13 commit `7a0fe5a` produced 95 files / 1272 tests, but that historical count is not presented as the current review run.

Generated packages are evidence artifacts outside the repository:

| Golden | Path | SHA-256 | Result |
| --- | --- | --- | --- |
| Personal portal | `/tmp/kf-module-generation-v1-acceptance/personal-portal.gz` | `7f166d6046dc025e7835b0c320e545178dbac3a1fdd6daf88303d6d45a39d125` | Agent validation/round-trip and native import/readback/publish pass; isolated runtime bisection accepted navigation and hero only |
| Admin console | `/tmp/kf-module-generation-v1-acceptance/admin-console.gz` | `384af4f6c2a899c252e6c1230461d2d4272d944be2012ca52a3e0ef982f6e142` | Agent validation/round-trip and native import/readback/publish pass; isolated runtime bisection accepted table, alerts, and status only |
| Industrial dashboard | not emitted | n/a | blocked on exact chart-series mapping gap |

## Real DeepSeek smoke

API, worker, and Web were started on isolated local ports with a real DeepSeek key supplied from an ignored local environment file. No key value was printed or stored. The first model request persisted a V2 customer blueprint and reached `design-review`. The confirmation initially exposed a legacy fallback error (`UNSUPPORTED_COMPONENT_CONTENT: navLinks for tabs`). Review removed the temporary text/model-derived workflow inference entirely. `SolutionWorkspace.generationWorkflow` is now a server-owned, tenant-scoped discriminator: migration backfills existing rows to `legacy`, new workspaces are explicitly `module-v1`, and uploads are explicitly `legacy`. Routing reads only this field, workspace mode, and accepted artifacts/module plans; negated or ordinary user wording cannot change it. New module-v1 generation now fails closed at `MODULE_STABLE_CATALOG_EMPTY` rather than falling back or consuming beta modules.

## Native KF acceptance

After the initial blocked run, the operator explicitly supplied a KF account and confirmed that the unlicensed/demo runtime is allowed to execute applications. The credential value was used only for the live login and was not written to the repository, evidence files, or this report. The acceptance used the same APIs as the KF development and operations frontends and produced the following verified results on `192.168.3.32`:

- both generated packages were imported into the native development system;
- their resulting project IDs were `82f5a270-961d-11f1-8d55-dd6d09cce4d4` (personal portal) and `8c469550-961d-11f1-8d55-dd6d09cce4d4` (admin console);
- Page1 was read back as native KF JSON at 1380×720 and 1280×720 respectively;
- the portal readback contained the approved packaged image at `static/agent-assets/431ced6916a2a21a156e38701afe55bbd7f88969fbbfc56d7fe099d47f265460.png`, navigation, hero, KPI, cards, tabs, form inputs, and submit action;
- the admin readback contained native Datagrid table data, alerts/status, sidebar, and toolbar controls;
- both projects were published successfully and appeared in the operations center's published-project catalog;
- isolated APP records on ports 13435 and 13436 were created and deployed without touching the existing 3434/3435 services;
- the first full portal/admin processes exited even though deployment/start commands succeeded; the node authorization flag was therefore not treated as the root cause after the operator clarification;
- a known native baseline opened port 3437 on the same node, proving the unlicensed/demo runtime can execute;
- every candidate module was then packaged with that baseline and started in isolation. `navigation.top`, `content.hero`, `data.table`, `feedback.alert-list`, and `data.status-grid` opened their assigned TCP ports and exposed the expected native Page1 JSON; KPI, card grid, tabs, contact/form, sidebar, and toolbar candidates did not survive runtime start and remain beta;
- two combined acceptance applications were created without modifying existing applications: `PortalStable` on port 3451 contains navigation and hero; `AdminStable` on port 3452 contains table, alerts, and status. Both report `running` and return HTTP 200 from the KF runtime entrance;
- native readback confirms the expected KF control types, module ownership, text/table data, image source binding, and navigation action configuration. Browser automation against the heavy KF runtime timed out, so this evidence does not claim screenshot fidelity or an executed click/form interaction.

The promotion is deliberately exact: passing one KF capability does not promote any other definition that happens to reuse it.

## Exact maturity decisions

The following exact definitions are promoted to `stable` through reviewed runtime evidence:

- `navigation.top@1.0.0`
- `content.hero@1.0.0`
- `data.status-grid@1.0.0`
- `data.table@1.0.0`
- `feedback.alert-list@1.0.0`

The following exact definitions remain `beta`: `navigation.sidebar`, `metric.kpi-grid`, `content.card-grid`, `content.timeline`, `interaction.tabs-filter`, `form.record-editor`, `content.contact-footer`, `data.chart-panel`, `data.detail`, and `action.toolbar`.

`data.chart-panel@1.0.0` additionally retains the blocking gap `kf36-static-chart-series-mapping-unverified`. Static Trend/Bar/Pie fields were not guessed. The other beta modules have strong automated compile/package evidence, but either failed the native runtime isolation or have not yet supplied the required exact runtime interaction evidence.

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

E2E destructive reset is guarded before any Prisma import, connection, seed, or `TRUNCATE`. The pure guard requires PostgreSQL, a loopback host, a database name beginning `kf_agent_e2e_`, and the explicit test-only `KF_E2E_ALLOW_DESTRUCTIVE_RESET=1` sentinel. Global setup and the directly runnable seed both enforce it; failures omit the URL and credentials. Guard tests are 13/13 and the protected E2E remains 2/2.

Credential audit found no new secret in changed files. A pre-existing plaintext KF server credential remains in `docs/kf-control-acceptance.md`; its value is intentionally omitted here. The operator-supplied acceptance credential and all temporary access tokens were excluded from the repository and removed after use. Generated packages, screenshots, cookies, environment files, and secrets are not committed.
