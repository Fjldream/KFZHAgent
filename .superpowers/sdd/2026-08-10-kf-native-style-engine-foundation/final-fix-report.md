# Native Style Engine Final Fix Report

Date: 2026-08-10
Branch: `codex/kf-native-style-engine-foundation`

## Status

All six initial findings, all three second-review findings, and all four third-review findings are addressed within the foundation scope. No runtime deployment or live KingFusion project mutation was added.

## RED evidence

The regression tests were written and run before production changes. The initial focused run exposed 16 failing behaviors:

- 8 in `ui-implementation-compiler.test.ts`: nested `styleDataNew`/raw/native values, invalid semantic value types, requested/actual existing-capability mismatch, missing or invalid actual capability IDs, prototype-chain map lookup, invalid map values, and empty existing-control style deltas.
- 6 across compiler/patch/preview tests: direct empty preserve-only compile, customer-CSS preservation and successive managed merges, byte-preserving empty patches, empty unsupported patches, persistence-boundary nested payload rejection, and all-or-nothing preview suppression.
- 2 in `style-engine.test.ts`: empty-style registry/adapter issue enforcement and unsafe native-field assignment rejection.

The second-review RED run then exposed 10 more failing behaviors across 73 focused tests:

- 4 UI compiler cases: unknown nested native/script fields, CSS-shaped image fit, `javascript:` image URL, and CSS `url(...)` payload.
- 4 direct ChangePlan patch cases: stripped-but-persisted nested option fields, unsafe image values, unreviewed TrendChart `objectType`/`linkMng`, and unreviewed nested layout fields.
- 2 managed-CSS cases: ownership-marker text inside a quoted declaration and inside an ordinary customer comment.

The third-review focused RED run exposed 17 failing behaviors across 84 tests:

- 5 direct generative compiler cases: tag-effect injection, invalid scale steps, invalid Steps state values, prototype native-property passthrough, and configured CustomCharts arbitrary objects.
- 6 strict create-envelope cases: string/object coordinates, negative/zero dimensions, inconsistent prototype discriminators, and configured CustomCharts objects submitted directly to the patcher.
- 6 managed-CSS lexical cases: escaped selector braces, unterminated rules/quotes/comments, dangling escapes, and unmatched closing braces.

A follow-up RED refinement exposed one additional failure across 27 compiler tests: an original unknown object property was silently removed by the shape parser before capability validation instead of being rejected. The implementation now validates semantic properties from the original generated-control source.

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
10. Direct generative `compileClientProject` compilation now sends the original control's semantic properties through the same strict capability parser used by UI implementation and patch creation. Parsed canonical output is the only downstream property source, while imported-project inspection and untouched raw-package preservation remain separate and lossless.
11. CustomCharts creation is honest about the foundation's review boundary: an unconfigured shell is generatable, but `objects` and other arbitrary chart configuration are preserve-only until a positive strict chart schema exists. Existing imported CustomCharts remain byte-preserved when untouched.
12. Patch creation uses a strict canonical envelope for system fields and geometry. Capability discriminators must agree; IDs are own non-empty strings; coordinates are bounded finite numbers; dimensions are bounded, finite, and positive. Reviewed layout docking coordinates of `-1` remain supported, and invalid values are never coerced to zero.
13. The managed-style scanner is escape-aware in every lexical state and requires fully balanced CSS before append or replacement. Escaped selector braces remain literal, while unmatched braces, strings, comments, and dangling escapes fail closed without mutating customer CSS.

## Files changed

- `agent-app/packages/domain-client/src/implementation/component-properties.ts`
- `agent-app/packages/domain-client/src/implementation/ui-implementation-compiler.ts`
- `agent-app/packages/domain-client/src/ir/client-project-ir.schema.ts`
- `agent-app/packages/domain-client/src/compile/client-compiler.ts`
- `agent-app/packages/domain-client/src/style/control-capability-registry.ts`
- `agent-app/packages/domain-client/src/style/style-data-merge.ts`
- `agent-app/packages/domain-client/src/style/style-engine.ts`
- `agent-app/packages/domain-client/src/compile/control-compiler.ts`
- `agent-app/packages/domain-client/src/patch/client-patcher.ts`
- `agent-app/packages/domain-client/src/preview/client-preview.ts`
- Regression tests beside each affected module.

## GREEN verification

- Initial focused final-review suite: 5 files, 86/86 tests passed.
- Second-review focused suite: 5 files, 73/73 tests passed after observing 10 expected RED failures.
- Third-review focused suite: 6 files, 96/96 tests passed after observing 17 expected RED failures plus the one-test original-source refinement failure.
- Full `@kf/domain-client` suite: 24 files, 314/314 tests passed.
- Full `@kf/contracts` suite: 6 files, 37/37 tests passed; the focused contracts subset also passed 11/11 during the RED/GREEN cycle.
- TypeScript: all 11 agent-app project typechecks passed (`api`, `web`, `worker`, `agent-orchestrator`, `artifact-storage`, `build-jobs`, `contracts`, `domain-client`, `domain-registry`, `kf-schema-extractor`, `preview-renderer`).
- Scoped lint across every third-review changed TypeScript file reports exactly 3 pre-existing baseline errors in legacy lines (`client-compiler.ts` once and `client-patcher.ts` twice); no new finding is present.
- Exact `@kf/domain-client` package lint: 18 errors, 0 warnings, matching the recorded pre-existing baseline; no new lint finding was introduced.
- `git diff --check`: clean.

The repository-wide serial test command was not rerun at finalization because it previously reproduced the branch's known non-terminating process condition after reporting 88 passing tests. The bounded domain and contracts suites above completed normally.

## Remaining concerns

- Live KingFusion open/save/runtime validation remains a deployment-phase gate and is intentionally outside this foundation change.
- macOS still reports five legacy orphaned Node processes for this worktree in uninterruptible `U` state (including earlier contracts/style checks and the initial broken-Node run). Repeated `SIGTERM`/`SIGKILL` cannot reap them; no runnable worker from the final bounded suites remains.
- Managed CSS supports additive/update deltas only. Explicit declaration/state reset requires a future versioned operation schema.
- Positive generated CustomCharts configuration remains deferred until a bounded semantic chart schema is reviewed; this foundation permits shell creation and imported-data preservation only.
