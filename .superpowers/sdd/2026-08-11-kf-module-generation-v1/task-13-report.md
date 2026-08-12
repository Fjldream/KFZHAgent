# Task 13 Report — Golden Flows, Real KF Acceptance, Release Evidence

## Outcome

Automated golden, API, worker, Web, imported-project, and root serial gates pass. Real DeepSeek produced and persisted a customer blueprint. Native KF runtime acceptance is externally blocked, therefore all exact module definitions truthfully remain beta and new module generation fails closed before build. No false stable promotion or runtime claim was made.

## RED → GREEN record

1. Golden fixture wiring: first database-backed run had 3 failures / 4 passes because duplicate accepted interaction facts were present; after fixture correction, one assertion used the wrong diff field; final orchestrator result is 7/7. These were fixture/test corrections, not production defects.
2. Worker packaging: first valid run had 2 failures / 16 passes because a hand-written base package did not match native `Pages` shape. Replaced with the real `client-unknown-field` fixture; final result is 18/18.
3. API module path: new Task 13 test RED with `buildJobId=null`. The expected release behavior was corrected to the exact fail-closed assertion `MODULE_STABLE_CATALOG_EMPTY`; 54/54 integration tests pass and full API is 227/227.
4. Real DeepSeek confirmation exposed legacy fallback `UI_IMPLEMENTATION_INVALID:UNSUPPORTED_COMPONENT_CONTENT: navLinks for tabs`. Production routing now persists an explicit module-workflow marker and routes unmapped V2 module requests to module planning. Stable-catalog absence is checked before mapping; `module-plan.test.ts` is 14/14.
5. E2E first exposed non-canonical test HMAC setup, occupied fixed ports, HTTP-200 empty delivery JSON parsing, and missing imported-workspace routing identity. E2E now supports isolated ports, Web accepts a nullable empty delivery body, and server-owned workspace mode preserves imported-package legacy patching. Final Task 13 E2E is 2/2.
6. Review P1 RED: workflow selection was temporarily sticky and derived from user/model text. GREEN: `SolutionWorkspace.generationWorkflow` is server-owned and tenant-scoped; migration default/backfill is `legacy`; creation explicitly assigns new=`module-v1`, upload=`legacy`; routing contains no keyword regex. Negated and ordinary module wording remain legacy, while an unmapped V2 in a server-owned module-v1 workspace stays on the module path and stops at the stable-empty gate.
7. Review Web P2 RED: the generic JSON helper silently returned `null` for every empty success response. GREEN: only delivery uses `nullableJsonResponse`; delivery empty resolves `null`, while login/workspace/build empty responses reject. Web is 124/124.
8. Review Golden P2 RED: same-module sibling overlap was exempted. Tightening it exposed four real portal card title/summary-to-image overlaps; the compiler now reserves the image column, and the gate blocks all non-ancestor overlaps. Portal/admin deterministic recompilation has `unexpectedChanges=[]`; dashboard status expands while all blocking owners remain the chart. Worker round-trip verifies portal asset path, bytes, hash, and image `src`.

## Verification counts

- contracts: 81
- domain-client: 565
- agent-orchestrator: 119
- build-jobs: 61
- API: 227
- worker: 29
- Web: 124
- Task 13 E2E: 2
- fresh root serial review run: API integration slice 55/55 and exit 0; the current Vitest environment printed no trustworthy final root-wide count

All 11 package typechecks pass. `git diff --check` passes. Full workspace lint is blocked only by three pre-existing `@typescript-eslint/no-unnecessary-type-assertion` findings in unchanged `packages/preview-renderer/src/renderer.ts`; changed scopes pass lint.

Prisma Node 20 evidence: generate and validate pass; an isolated pre-migration clone reports only `20260812123000_module_generation_workflow` pending; deploy and final status pass. A row created before deploy reads `generationWorkflow=legacy` after deploy. `migrate diff --exit-code` reports the pre-existing `DomainProjectRevision` index-name discrepancy and no workflow-column discrepancy.

## DeepSeek and native runtime evidence

- DeepSeek configuration: present via ignored local environment; secret value never recorded.
- First request: `NEW_REQUIREMENT`, final stage `design-review`, persisted design hash present, no build job.
- Confirmation before routing fix: fail-closed at `UNSUPPORTED_COMPONENT_CONTENT: navLinks for tabs`.
- Confirmation after routing fix is covered deterministically by API/E2E and stops at `MODULE_STABLE_CATALOG_EMPTY` without beta planning.
- KF safe credentials: missing. Existing Chrome KF tabs were present, but three browser control attempts timed out before authenticated DOM/screenshot evidence. Historical plaintext documentation credential was not used.
- KF screenshots: none; no native UI claim is made.

## Packages and maturity

- `/tmp/kf-module-generation-v1-acceptance/personal-portal.gz`, SHA-256 `7f166d6046dc025e7835b0c320e545178dbac3a1fdd6daf88303d6d45a39d125`.
- `/tmp/kf-module-generation-v1-acceptance/admin-console.gz`, SHA-256 `384af4f6c2a899c252e6c1230461d2d4272d944be2012ca52a3e0ef982f6e142`.
- Industrial dashboard not packaged: `kf36-static-chart-series-mapping-unverified`.

Every V1 definition remains beta because none has native KF 3.6 runtime evidence. Portal/admin automated packages passed; chart stays exactly blocked. No definition file maturity change was made.

## Credential/staging audit

No changed file contains a real API key, server password, generated package, cookie, or screenshot. A pre-existing plaintext credential finding exists in `docs/kf-control-acceptance.md`; value omitted and file untouched. Intended files are Task 13 tests/fixtures/docs plus minimal integration fixes for workflow identity, nullable delivery parsing, and isolated E2E ports.

## Concern / external blocker

Release cannot claim stable-only golden readiness until a safe KF login/session is available and the generated packages are uploaded, opened, and interacted with in native KF 3.6. Static chart serialization requires separate exact native evidence and must not be inferred.
