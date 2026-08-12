# Final Review Fix Report — Conversation Boundaries

## Outcome

The two confirmed P1 findings are fixed without changing previous-artifact
trust, KF module promotion, or native-runtime maturity. Module-planning
failures now persist only fixed public codes and bounded customer messages;
raw exception text is discarded because this node has no server logger. SSE
state frames remain progress-only, the final `done` projection sanitizes both
new and legacy checkpoint error values, the SSE controller already emits a
fixed error frame, and the REST resume path now also emits a fixed graph error.

Recent conversation context now queries the newest 20 rows using
`createdAt DESC, id DESC`, then reverses them into stable chronological order
before graph/model consumption. The DeepSeek-side newest-message selection was
not changed.

## P1-1 — Customer-safe graph failures

- Added a closed public module-failure map with actionable codes for stable
  catalog absence, blueprint mapping, unavailable stable capability, required
  assets, and exhausted repair. Internal planning and compilation failures map
  to `MODULE_PLANNING_FAILED` or `MODULE_COMPILATION_FAILED`.
- Removed all `error.message` interpolation from the module-planning node.
- Fixed assistant messages are appended for every module failure; no raw
  exception, correlation detail, module JSON, path, signature, or secret is
  persisted.
- Exact compiler delivery gaps remain in the independently validated
  `moduleDeliveryReport` and owner mapping fields, preserving Task 12 blocked
  delivery projection and recovery behavior.
- `finalStateData()` strips legacy `:<detail>` suffixes through an allowlist and
  maps unknown checkpoint values to `CONVERSATION_FAILED`.
- REST graph-resume exceptions now return only
  `GRAPH_ERROR / 对话处理失败，请重试`.

## P1-2 — Latest persisted message window

- Prisma query: `orderBy: [{ createdAt: "desc" }, { id: "desc" }]`, bounded to
  20 rows.
- Returned rows are reversed to chronological order.
- The port test uses 25 rows and a same-timestamp pair to verify the ID
  tie-break, newest inclusion, oldest exclusion, and final order.
- A real API/Prisma/checkpointer integration test creates 24 historical rows,
  sends message 25 through the HTTP endpoint, and verifies that the just-
  persisted user turn is the final model input while message 1 is excluded.

## RED → GREEN evidence

1. Module-plan RED: 5 failed / 9 passed. Existing raw codes still contained
   blueprint IDs, delivery reasons, and a compiler exception containing an
   absolute path, complete ModulePlan JSON, signature, and secret sentinel.
   GREEN: focused module-plan 14/14.
2. SSE done RED: 1/1 failed because a legacy raw checkpoint value was returned
   verbatim. GREEN: projection 1/1.
3. Recent-window RED: 1/1 failed at the old scalar ascending `orderBy`; GREEN:
   graph-port suite 7/7, including 25-row/tie-break coverage.
4. REST resume RED: 1/1 exposed the full injected compiler exception in
   `GRAPH_ERROR.message`; GREEN: fixed HTTP response 1/1.
5. Real recent-message integration: 1/1 after initializing checkpoint tables
   in the isolated migrated database.
6. API lint initially found one test-only unbound method reference. Binding the
   saved graph method made API lint/typecheck green; the HTTP regression test
   was rerun 1/1 after that change.

## Fresh verification

Runtime: bundled arm64 Node v24.14.0. Database:
`kf_agent_finalfix_20260812_1349`, with all 8 Prisma migrations and LangGraph
checkpoint setup applied.

- `@kf/agent-orchestrator`: 14 files / 119 tests passed.
- `@kf/api`: 11 files / 232 tests passed in the final post-fix full run.
- Focused post-lint regression: module plan 14/14; graph port and done
  projection 8/8; REST graph error 1/1.
- Orchestrator typecheck and lint: passed.
- API typecheck and lint: passed.
- Prisma validate: passed.
- `git diff --check`: passed.
- Credential scan of every changed source/test file: no API key, bearer token,
  private key, password-bearing database URL, or real credential found. The
  explicit `KF_SECRET_SENTINEL_*` values are synthetic negative-test fixtures.

The first orchestrator full command accidentally inherited the old default
database and reported 116 passed / 3 checkpoint tests failed because that
database lacked the existing `generationWorkflow` column. Re-running the same
full suite with the migrated isolated database produced 119/119. No
`ECONNRESET` occurred in either final API full run.

## Scope and remaining concern

Only the two confirmed P1 findings and their tests were changed. Contracts were
not affected. Previous-artifact hardening and KF stable promotion remain
outside this fix. Native KF runtime acceptance is still the previously
documented external condition; this patch does not make a new runtime-ready
claim.
