# Native Style Engine Final Fix Report

Date: 2026-08-10
Branch: `codex/kf-native-style-engine-foundation`

## Status

All six initial findings and all three second-review findings are addressed within the foundation scope. No runtime deployment or live KingFusion project mutation was added.

## RED evidence

The regression tests were written and run before production changes. The initial focused run exposed 16 failing behaviors:

- 8 in `ui-implementation-compiler.test.ts`: nested `styleDataNew`/raw/native values, invalid semantic value types, requested/actual existing-capability mismatch, missing or invalid actual capability IDs, prototype-chain map lookup, invalid map values, and empty existing-control style deltas.
- 6 across compiler/patch/preview tests: direct empty preserve-only compile, customer-CSS preservation and successive managed merges, byte-preserving empty patches, empty unsupported patches, persistence-boundary nested payload rejection, and all-or-nothing preview suppression.
- 2 in `style-engine.test.ts`: empty-style registry/adapter issue enforcement and unsafe native-field assignment rejection.

The second-review RED run then exposed 10 more failing behaviors across 73 focused tests:

- 4 UI compiler cases: unknown nested native/script fields, CSS-shaped image fit, `javascript:` image URL, and CSS `url(...)` payload.
- 4 direct ChangePlan patch cases: stripped-but-persisted nested option fields, unsafe image values, unreviewed TrendChart `objectType`/`linkMng`, and unreviewed nested layout fields.
- 2 managed-CSS cases: ownership-marker text inside a quoted declaration and inside an ordinary customer comment.

## Implementation decisions

1. Component properties are recursively screened for reserved native/style keys and validated with capability-specific Zod fields reused from semantic ControlIR schemas. The same validator runs again at create persistence. Raw-preservation capabilities retain their reviewed structures but cannot carry nested style/native payloads.
2. Generated CSS is stored in one deterministic, versioned, CSS-comment-delimited managed block. New declaration/state deltas merge into that block; customer CSS outside it remains byte-preserved. Empty deltas do not write. Malformed or duplicate managed blocks fail closed. Reset/removal semantics remain out of scope.
3. `ImplementationCompileContext` now requires an actual capability map for existing controls. Page GUID, existing GUID, and actual capability resolution require own properties and non-empty runtime strings. Existing controls compile/report against the actual capability and exact mismatches fail closed.
4. Registry status, unsupported tokens, adapter/selector warnings, and reviewed native-field/value checks are centralized in the style engine and enforced at planner, direct compiler, patch, and preview boundaries, including empty styles.
5. Context maps use `Object.hasOwn`; prototype-chain IDs are never accepted.
6. Preview uses the shared acceptance decision and suppresses the entire requested style when any state, warning, capability, or native-field issue exists.
7. Patch create reconstructs downstream properties from reviewed system fields plus the canonical Zod result. Every creatable static, EasyUI, layout, and prototype capability now resolves to an explicit strict schema; unknown capabilities and unreviewed properties fail closed. Known nested option/chart/layout schemas are strict.
8. Image fit is the reviewed KF/Element enum (`fill`, `contain`, `cover`, `none`, `scale-down`). Generated URL fields accept only HTTP(S) or local relative resources and reject control characters, protocol-relative URLs, unsafe schemes, and CSS `url(...)`. Numeric ranges, date formats, upload accept syntax, recursive menu options, and embedded chart JSON also have bounded policies while semantic text remains unrestricted content.
9. Managed-style ownership is located by a CSS-aware scanner. It recognizes marker comments only at top level outside strings, comments, and rules, requires exactly one ordered pair, rejects corrupt/ambiguous ownership, and preserves every byte outside the owned envelope.

## Files changed

- `agent-app/packages/domain-client/src/implementation/component-properties.ts`
- `agent-app/packages/domain-client/src/implementation/ui-implementation-compiler.ts`
- `agent-app/packages/domain-client/src/ir/client-project-ir.schema.ts`
- `agent-app/packages/domain-client/src/compile/client-compiler.ts`
- `agent-app/packages/domain-client/src/style/style-data-merge.ts`
- `agent-app/packages/domain-client/src/style/style-engine.ts`
- `agent-app/packages/domain-client/src/compile/control-compiler.ts`
- `agent-app/packages/domain-client/src/patch/client-patcher.ts`
- `agent-app/packages/domain-client/src/preview/client-preview.ts`
- Regression tests beside each affected module.

## GREEN verification

- Initial focused final-review suite: 5 files, 86/86 tests passed.
- Second-review focused suite: 5 files, 73/73 tests passed after observing 10 expected RED failures.
- Full `@kf/domain-client` suite: 24 files, 295/295 tests passed.
- Full `@kf/contracts` suite: 6 files, 37/37 tests passed; the focused contracts subset also passed 11/11 during the RED/GREEN cycle.
- TypeScript: all 11 agent-app project typechecks passed (`api`, `web`, `worker`, `agent-orchestrator`, `artifact-storage`, `build-jobs`, `contracts`, `domain-client`, `domain-registry`, `kf-schema-extractor`, `preview-renderer`).
- Scoped lint for the new/shared boundary, implementation compiler, style engine, and preview files: 0 errors.
- Exact `@kf/domain-client` package lint: 18 errors, 0 warnings, matching the recorded pre-existing baseline; no new lint finding was introduced.
- `git diff --check`: clean.

The repository-wide serial test command was not rerun at finalization because it previously reproduced the branch's known non-terminating process condition after reporting 88 passing tests. The bounded domain and contracts suites above completed normally.

## Remaining concerns

- Live KingFusion open/save/runtime validation remains a deployment-phase gate and is intentionally outside this foundation change.
- macOS still reports five legacy orphaned Node processes for this worktree in uninterruptible `U` state (including earlier contracts/style checks and the initial broken-Node run). Repeated `SIGTERM`/`SIGKILL` cannot reap them; no runnable worker from the final bounded suites remains.
- Managed CSS supports additive/update deltas only. Explicit declaration/state reset requires a future versioned operation schema.
