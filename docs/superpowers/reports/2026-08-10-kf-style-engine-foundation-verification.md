# KF Native Style Engine Foundation — Verification

## Result

The local preview now safely renders approved `ControlIR.style` intent as deterministic inline declarations. It remains inert: user text is escaped, no scripts or remote resources are emitted, the CSP includes `default-src 'none'`, and preview markup never contains KF `styleDataNew` output. This is a local fidelity check only, not real KingFusion runtime verification.

## Task 8 Test Evidence

| Command | Result |
| --- | --- |
| `pnpm --filter @kf/domain-client exec vitest run src/preview/client-preview.test.ts` (RED) | Expected failure: styled button output lacked `background-color:#2563eb`; 1 failed, 6 passed. |
| Same command (GREEN) | Passed: 7/7. |
| `pnpm --filter @kf/contracts test` | Passed: 37/37. |
| `pnpm --filter @kf/domain-client test` | Passed: 257/257. |
| `pnpm --filter @kf/contracts typecheck` | Passed. |
| `pnpm --filter @kf/domain-client typecheck` | Passed. |
| `pnpm --filter @kf/contracts lint` | Passed. |
| `pnpm --filter @kf/domain-client exec eslint src/preview/client-preview.ts src/preview/client-preview.test.ts` | Passed. |
| `pnpm --filter @kf/domain-client lint` | Baseline failure: 18 errors in untouched compile, inspect, and patch files; no preview-file error. |
| `pnpm typecheck` | Passed: all 11 scoped workspace projects completed. |
| `pnpm lint` | Same 18 domain-client baseline lint errors. |
| `pnpm test` | Inconclusive. One bounded run emitted Vitest startup only and no suite result after more than two minutes. The shell tree was terminated; two workers remained in uninterruptible macOS state after `SIGTERM` and `SIGKILL`. |
| `git diff --check` | Passed. |

The bounded root-test run did not produce the known shared-DB baseline collision. That separate historical failure is `apps/api/src/artifacts/preview.service.test.ts:107`: `Tenant name or admin username already exists`. The focused packages pass and provide the relevant regression evidence.

## Capability Inventory

There are 74 explicit control capability records. `full` is 0 and real-runtime `verified` is 0.

| Dimension | pending-verification | partial | preserve-only | unsupported |
| --- | ---: | ---: | ---: | ---: |
| Generation | 19 | 55 | 0 | 0 |
| Style | 19 | 0 | 54 | 1 |
| Preview | 19 | 0 | 55 | 0 |
| Data binding | 19 | 0 | 55 | 0 |
| Interaction | 19 | 0 | 55 | 0 |
| Runtime verification | 74 unverified | 0 verified | 0 failed | — |

### First-Batch Reviewed Adapter IDs

`text`, `richtext`, `image`, `tag`, `button`, `easyui.2`, `input`, `inputnumber`, `select`, `checkbox`, `radio`, `switch`, `datetimepicker`, `tabs`, `spacer`, `layout.2`, `layout.4`, `layout.5`, `layout.6`.

### Unsupported Controls and Tokens

- `webcontainer` structured style is explicitly unsupported.
- The other 54 non-first-batch capabilities are preserve-only for style: `table`, `radiolegacy`, `checkboxlegacy`, `combobox`, `scale`, `list`, `treeview`, `gantt`, `factorycalendar`, `cascader`, `dropdown`, `navmenu`, `tree`, `upload`, `transfer`, `timeline`, `steps`; EasyUI `0`, `1`, `3`–`22`, `24`–`29`; layouts `0` and `3`; and prototypes `CustomCharts`, `AlarmWindow`, `EventWindow`, `TrendChart`, `BarChart`, `PieChart`, and `XYChart`.
- For a capability without a reviewed adapter, every `declarations.*` and `states.*.*` style token is reported unsupported by `compileControlStyle()`.
- First-batch state support is deliberately limited: text/image exclude `selected` and `error`; form adapters exclude `selected`; selectable adapters exclude `error`; spacer and reviewed layouts have no supported states.

## Known Limitations and Next Plan

- Local preview emits base declarations only. It does not simulate hover, active, focus, disabled, selected, or error interactions.
- The preview uses the reviewed default direct-IR theme and does not represent a live KF page/theme runtime.
- Selector roles, KF native fields, and `styleDataNew` remain compiler/runtime implementation details and are intentionally absent from the preview document.
- Real KingFusion 3.6 runtime verification, screenshot baselines, and any promotion to `full` are explicitly deferred to the next plan.

## Credential Scan

The report and changed preview files were scanned for credential-shaped values before staging. No credentials, server-specific secrets, authorization headers, or private-key blocks were found.
