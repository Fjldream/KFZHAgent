# Redundancy Batch APP Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the fake node-agent batch APP start/stop implementation with real bounded-concurrency execution, and use one batch command per APP stage in redundancy enable and node-switch operations while preserving per-APP audit rows and truthful frontend progress.

**Architecture:** `OperationService` continues to own the three-stage enable/switch state machine. For an APP stage it creates every SQLite APP-step row first, then asks `CommandGateway` to execute the set. When the rollout flag is enabled, the gateway enqueues one existing KF batch command and the node agent runs the current single-APP primitives with action-specific bounded concurrency (START 4, STOP 8); otherwise it uses the existing single-command path as a compatibility fallback. The center stores the returned `cmdResults`, observes actual APP state with one shared deadline, maps each final result back to its existing APP-step row, and only then advances or fails the stage. Role synchronization remains role-only and never starts or stops APPs.

**Tech Stack:** Node.js/CommonJS, existing KF command queue and polling protocol, PM2 through the existing `pm2Delegate`, SQLite through `better-sqlite3`, Vue 3, Pinia, Element Plus, `CustomStyleTable`, Vue I18n, existing custom Node test runners and frontend `node:test` suite.

**Spec:** [`docs/superpowers/specs/2026-09-08-kf-redundancy-batch-app-command-design.md`](/Users/fengjinlong/YK/KingFusion3.6/docs/superpowers/specs/2026-09-08-kf-redundancy-batch-app-command-design.md)

## Global Constraints

- Scope is limited to APP start/stop stages used by redundancy **enable** and **switch**. Do not modify ordinary APP management pages/APIs/multi-select behavior, and do not batch `disable`, online APP membership maintenance, deploy, restart, undeploy, delete, health scanning, or role reconciliation.
- Preserve the three-stage order:
  - Enable: `STOP_INACTIVE_APPS` → `SYNC_ROLES` → `START_ACTIVE_APPS`.
  - Switch: `STOP_SOURCE_APPS` → `SYNC_ROLES` → `START_TARGET_APPS`.
- `SYNC_ROLES` must remain role/revision acknowledgement only. Do not reintroduce APP reconciliation into the role-confirmation request.
- Send at most one batch command to one node for one APP stage. Never use `pm2 stop all`, because a node may host APPs outside the selected redundancy configuration and some project types do not use PM2.
- The agent must validate the entire APP ID array through the existing redundancy command guard before starting any item. A rejected batch executes zero APP actions.
- The agent executes all accepted START items with maximum concurrency 4 and STOP items with maximum concurrency 8, catches item failures independently, and returns results in the same order as the input APP IDs.
- Result contract for each agent item is `{ appId, cmdStatus, message }`, using the existing numeric command status (`2` success, `3` failure). The center converts an accepted child to intermediate `OBSERVING`, then to final `SUCCEEDED`; explicit failure becomes `FAILED`, and missing/unconfirmed output becomes `UNKNOWN`.
- Command success is not final success. The center must still observe actual APP running/stopped state. One shared stage deadline applies to the whole batch: start 120 seconds, stop 60 seconds.
- A missing item result or state-observation timeout is `UNKNOWN`, not a fabricated failure. The operation task still ends `FAILED` because the requested state could not be confirmed.
- Before role persistence, any failed/unknown stop item aborts the operation. After role persistence, any failed/unknown target start item fails the task without rolling the new role back and without stopping APPs that did start.
- Forced switch with an offline source continues to skip source APP stop and source role confirmation exactly as it does now.
- Create all APP-step rows before enqueuing the stage command so the frontend can show the complete batch immediately. Reuse the existing SQLite schema; do not add or migrate tables.
- Do not modify `CustomStyleTable` or global table/message styles. All new frontend styling stays scoped to `OperationTaskDrawer.vue`.
- No new npm dependency is required in the center, agent, or frontend.
- Mixed-version rollout must remain safe. `KF_REDUNDANCY_BATCH_APP_COMMANDS` defaults to disabled; upgrade both agents first, then enable the flag on the center. With the flag disabled, the same gateway contract uses the legacy single-APP queue path.

---

## Task 1: Implement a Real Node-Agent Batch Executor

**Files:**

- Create: `KingFusion3.6_Node/kingopsproxy/exe/kingopsagent/exe/lib/services/commands/batch_app_executor.js`
- Create: `KingFusion3.6_Node/kingopsproxy/exe/kingopsagent/exe/test/redundancy/batch_app_executor.test.js`
- Modify: `KingFusion3.6_Node/kingopsproxy/exe/kingopsagent/exe/test/redundancy/run_all.js`

- [ ] **Step 1: Write the failing bounded-concurrency and stable-order tests**

Add tests that invoke a pure executor with enough APP IDs to exercise both limits, intentionally complete them out of order, and assert:

```js
assert.deepStrictEqual(
  results.map((item) => item.appId),
  ['app-1', 'app-2', 'app-3', 'app-4', 'app-5', 'app-6'],
)
assert.ok(maxActive <= 4)
assert.deepStrictEqual(results[2], {
  appId: 'app-3',
  cmdStatus: 3,
  message: 'pm2 start failed',
})
```

Run the same worker-pool fixture with `concurrency: 8` and assert `maxActive <= 8` and `maxActive > 4`, proving STOP can use the higher bound. Also test an empty array returns `[]`, a thrown string/Error becomes one failed item, and one failure does not prevent later items from executing.

- [ ] **Step 2: Run the node redundancy suite and confirm the new test fails**

Run:

```bash
cd KingFusion3.6_Node/kingopsproxy/exe/kingopsagent/exe
npm run test:redundancy
```

Expected: failure because `batch_app_executor.js` does not exist or does not yet enforce concurrency/order.

- [ ] **Step 3: Implement the pure worker-pool helper**

Export one function with an injectable action:

```js
async function executeBatchAppAction(appIds, action, { concurrency = 4 } = {}) {
  // Preallocate results by input index.
  // Run min(concurrency, appIds.length) workers.
  // Each worker awaits action(appId) and normalizes exceptions.
  // Return the preallocated result array in input order.
}
```

Do not import PM2 or global KF state in this helper. Keep it independently testable and do not add a concurrency library.

- [ ] **Step 4: Register and run the new test**

Add `require('./batch_app_executor.test')` to the node `run_all.js`, then rerun `npm run test:redundancy`.

Expected: all node redundancy tests pass.

- [ ] **Step 5: Commit the isolated executor**

```bash
git add KingFusion3.6_Node/kingopsproxy/exe/kingopsagent/exe/lib/services/commands/batch_app_executor.js \
  KingFusion3.6_Node/kingopsproxy/exe/kingopsagent/exe/test/redundancy/batch_app_executor.test.js \
  KingFusion3.6_Node/kingopsproxy/exe/kingopsagent/exe/test/redundancy/run_all.js
git commit -m "feat(redundancy): add bounded batch app executor"
```

---

## Task 2: Wire Real Batch Start/Stop into the Agent Command Path

**Files:**

- Modify: `KingFusion3.6_Node/kingopsproxy/exe/kingopsagent/exe/lib/services/commands/AppControlExPm2.js`
- Modify: `KingFusion3.6_Node/kingopsproxy/exe/kingopsagent/exe/lib/services/commands/commandExe.js`
- Modify: `KingFusion3.6_Node/kingopsproxy/exe/kingopsagent/exe/lib/services/commands/command/batchStartCommand.js`
- Create: `KingFusion3.6_Node/kingopsproxy/exe/kingopsagent/exe/test/redundancy/batch_command_execution.test.js`
- Modify: `KingFusion3.6_Node/kingopsproxy/exe/kingopsagent/exe/test/redundancy/run_all.js`

- [ ] **Step 1: Write failing command-integration tests**

Cover these cases:

1. `AppBatchStart(['a', 'b'])` calls the existing `AppStart` once per ID and returns both item results.
2. `AppBatchStop(['a', 'b'])` calls the existing `AppStop` once per ID.
3. The batch guard checks every ID before `AppControlExPm2` is called and rejects the whole command if any ID is forbidden.
4. `isAllSucceed` recognizes the correctly spelled `APP_DEPLOYCOMMAND_BATCHSTOP` enum.
5. `batchStartCommand` uses `NODE_DEPLOYCOMMAND_BATCHSTART`, not the current single-start enum.
6. A guard-rejected batch still returns a valid `cmdResults` array for every requested ID, and executes zero actions.
7. A sufficiently large START batch never runs more than 4 actions concurrently, while STOP never runs more than 8.

Use dependency injection or a lightweight object created from the prototype so the test does not launch PM2.

- [ ] **Step 2: Run the suite and verify the fake implementation is exposed**

Run `npm run test:redundancy` in the agent `exe` directory.

Expected: failures showing batch methods returned success without calling `AppStart`/`AppStop`, and the batch-start enum is wrong.

- [ ] **Step 3: Replace only the two fake batch methods**

In `AppControlExPm2.js`, keep all existing single-APP logic and replace only:

```js
async AppBatchStart(appIds) {
  return executeBatchAppAction(appIds, (appId) => this.AppStart(appId), {
    concurrency: 4,
  })
}

async AppBatchStop(appIds) {
  return executeBatchAppAction(appIds, (appId) => this.AppStop(appId), {
    concurrency: 8,
  })
}
```

Leave batch deploy/restart/undeploy outside this change. This deliberately supports PM2 and non-PM2 projects because `AppStart`/`AppStop` already dispatch by project type.

- [ ] **Step 4: Correct the agent batch command bookkeeping**

- Change `batchStartCommand.js` to `NODE_DEPLOYCOMMAND_BATCHSTART`.
- Add the correctly spelled batch-stop enum to `commandExe.isAllSucceed`.
- Keep the pre-execution guard where it currently runs so every ID is validated before the batch executor starts. When any ID is rejected, return a batch-shaped failure containing one failed child result per requested ID; keep the current single-result shape for single-APP commands.
- Make `isAllSucceed` treat a missing/non-array `cmdResults` as failure rather than throwing.
- Preserve the upload envelope:

```json
{
  "cmdId": "batch-command-id",
  "cmdResults": [
    { "appId": "app-1", "cmdStatus": 2, "message": "succeed" },
    { "appId": "app-2", "cmdStatus": 3, "message": "pm2 start failed" }
  ]
}
```

- [ ] **Step 5: Run node tests and inspect the changed minified source carefully**

Run:

```bash
npm run test:redundancy
node --check lib/services/commands/AppControlExPm2.js
node --check lib/services/commands/commandExe.js
node --check lib/services/commands/command/batchStartCommand.js
```

Expected: all tests pass and all three syntax checks exit 0.

- [ ] **Step 6: Commit the agent integration**

```bash
git add KingFusion3.6_Node/kingopsproxy/exe/kingopsagent/exe/lib/services/commands/AppControlExPm2.js \
  KingFusion3.6_Node/kingopsproxy/exe/kingopsagent/exe/lib/services/commands/commandExe.js \
  KingFusion3.6_Node/kingopsproxy/exe/kingopsagent/exe/lib/services/commands/command/batchStartCommand.js \
  KingFusion3.6_Node/kingopsproxy/exe/kingopsagent/exe/test/redundancy/batch_command_execution.test.js \
  KingFusion3.6_Node/kingopsproxy/exe/kingopsagent/exe/test/redundancy/run_all.js
git commit -m "feat(redundancy): execute batch start and stop on agent"
```

---

## Task 3: Preserve Per-APP Batch Results in the Center Command System

**Files:**

- Modify: `KingFusion3.6_Center/kingdevopscenter/kingopsserver/exe/lib/services/commands/commandExe.js`
- Modify: `KingFusion3.6_Center/kingdevopscenter/kingopsserver/exe/lib/services/commands/AppCommands.js`
- Modify: `KingFusion3.6_Center/kingdevopscenter/kingopsserver/exe/lib/controllers/apps.js`
- Modify: `KingFusion3.6_Center/kingdevopscenter/kingopsserver/exe/lib/services/redundancy/legacy_command_adapter.js`
- Create: `KingFusion3.6_Center/kingdevopscenter/kingopsserver/exe/test/redundancy/batch_command_pipeline.test.js`
- Modify: `KingFusion3.6_Center/kingdevopscenter/kingopsserver/exe/test/redundancy/run_all.js`

- [ ] **Step 1: Write failing transport tests**

The tests must prove:

- `enqueueBatch({ nodeId, appIds, action, metadata })` constructs the matching batch command, assigns all IDs and redundancy metadata, and queues it under the requested node.
- `AppCommands.getCommands(nodeId)` creates `BatchCommandResult` for batch start/stop commands.
- Uploading a mixed `cmdResults` array stores the complete array even when the overall command status is failed.
- Missing/non-array or incomplete `cmdResults` cannot be accepted as a successful batch response.
- `LegacyCommandAdapter.getCommandStatus(commandId)` returns terminal status plus normalized child results:

```js
{
  status: 'FAILED',
  results: [
    { appId: 'app-1', status: 'SUCCEEDED', message: 'succeed' },
    { appId: 'app-2', status: 'FAILED', message: 'pm2 start failed' },
  ],
}
```

- [ ] **Step 2: Run center tests and confirm failure**

```bash
cd KingFusion3.6_Center/kingdevopscenter/kingopsserver/exe
npm run test:redundancy
```

Expected: failures because the queue currently always creates the base `CommandResult`, the controller discards `cmdResults`, and the adapter only supports single APP commands.

- [ ] **Step 3: Correct the center batch queue methods**

Change only batch start/stop signatures in `commandExe.js` to match single-command queueing:

```js
AppBatchStart(nodeId, command) {
  AppCommands.addCommand(nodeId, command)
}

AppBatchStop(nodeId, command) {
  AppCommands.addCommand(nodeId, command)
}
```

Do not route redundancy commands through the legacy `AppDelete` workaround used by unrelated old bulk endpoints.

- [ ] **Step 4: Store batch child results without changing the database**

- In `AppCommands.js`, instantiate existing `BatchCommandResult` for batch start/stop command types and retain `CommandResult` for all other types.
- In `apps.js::uploadResult`, normalize `P.cmdResults` to an array, call `setResult(...)` whenever the executing result object supports it, and verify that every requested APP ID has exactly one child result before the batch can be marked successful.
- Store the array on both overall success and overall failure.
- Keep existing single-command side effects unchanged; actual APP running state still comes from normal APP status reporting.

- [ ] **Step 5: Add the adapter batch contract**

Add:

```js
enqueueBatch({ nodeId, appIds, action, metadata })
```

It selects `batchStartCommand` or `batchStopCommand`, calls `setAppId(appIds)`, applies the same redundancy metadata as `enqueue`, and calls the corrected center batch queue method.

Extend `getCommandStatus` to include `results` when `getResult()` exists. Normalize child numeric statuses at this boundary so the gateway never depends on magic numbers.

- [ ] **Step 6: Run tests and syntax checks**

```bash
npm run test:redundancy
node --check lib/services/commands/commandExe.js
node --check lib/services/commands/AppCommands.js
node --check lib/controllers/apps.js
node --check lib/services/redundancy/legacy_command_adapter.js
```

Expected: all center redundancy tests pass and syntax checks exit 0.

- [ ] **Step 7: Commit the command pipeline**

```bash
git add KingFusion3.6_Center/kingdevopscenter/kingopsserver/exe/lib/services/commands/commandExe.js \
  KingFusion3.6_Center/kingdevopscenter/kingopsserver/exe/lib/services/commands/AppCommands.js \
  KingFusion3.6_Center/kingdevopscenter/kingopsserver/exe/lib/controllers/apps.js \
  KingFusion3.6_Center/kingdevopscenter/kingopsserver/exe/lib/services/redundancy/legacy_command_adapter.js \
  KingFusion3.6_Center/kingdevopscenter/kingopsserver/exe/test/redundancy/batch_command_pipeline.test.js \
  KingFusion3.6_Center/kingdevopscenter/kingopsserver/exe/test/redundancy/run_all.js
git commit -m "feat(redundancy): retain batch command item results"
```

---

## Task 4: Add Batch Execution, State Observation, and Safe Fallback to the Gateway

**Files:**

- Modify: `KingFusion3.6_Center/kingdevopscenter/kingopsserver/exe/lib/services/redundancy/command_gateway.js`
- Modify: `KingFusion3.6_Center/kingdevopscenter/kingopsserver/exe/lib/services/redundancy/bootstrap.js`
- Create: `KingFusion3.6_Center/kingdevopscenter/kingopsserver/exe/test/redundancy/command_gateway_batch.test.js`
- Modify: `KingFusion3.6_Center/kingdevopscenter/kingopsserver/exe/test/redundancy/run_all.js`
- Modify: `KingFusion3.6_Center/kingdevopscenter/kingopsserver/exe/test/redundancy/bootstrap.test.js`

- [ ] **Step 1: Write failing gateway contract tests**

Test `executeManyAndObserve` for:

1. Batch mode enqueues exactly one command for 17 APP IDs.
2. Successful command items are observed concurrently against the same deadline.
3. An explicit failed child remains `FAILED` while successful siblings still undergo observation.
4. A missing child result becomes `UNKNOWN`.
5. An observation timeout becomes `UNKNOWN` and does not erase other results.
6. Disabled batch mode uses `executeAndObserve` once per APP and returns the same normalized result shape.
7. Result order always matches input order.
8. Progress callbacks first report command results and then final observed states without changing item order.

Use a deterministic fake clock and fake `wait`; do not wait real seconds in tests.

- [ ] **Step 2: Run the center suite and verify the new API is absent**

Run `npm run test:redundancy` in the center `exe` directory.

Expected: failure because `executeManyAndObserve` and batch feature configuration do not exist.

- [ ] **Step 3: Implement one normalized gateway API**

Add this return contract:

```js
{
  mode: 'BATCH',
  commandId: 'cmd-batch-1',
  results: [
    {
      appId: 'app-1',
      commandId: 'cmd-batch-1',
      commandStatus: 'SUCCEEDED',
      observedStatus: 'RUNNING',
      message: null,
    },
  ],
}
```

Accept an optional progress callback in the input:

```js
onProgress({
  phase: 'COMMAND_RESULT',
  result: {
    appId: 'app-1',
    commandId: 'cmd-batch-1',
    commandStatus: 'OBSERVING',
    observedStatus: null,
    message: null,
  },
})
```

Implementation rules:

- Batch path: `enqueueBatch` once → wait for the overall terminal response without throwing away failed child details → normalize every requested ID → emit `COMMAND_RESULT` (`OBSERVING`, `FAILED`, or `UNKNOWN`) → observe accepted items concurrently → emit `OBSERVED_RESULT` → return all final items.
- Compatibility path: call the existing `executeAndObserve` sequentially for each ID, emit equivalent progress events, catch per-item errors, and return the same item shape.
- For a whole-command timeout, return every still-unresolved item as `UNKNOWN` with the timeout message.
- Use 120 seconds for START and 60 seconds for STOP as one stage-wide deadline. Do not multiply the timeout by APP count.

- [ ] **Step 4: Wire the rollout flag in bootstrap**

Add a pure `RedundancyBootstrap.readBatchAppCommandsEnabled(environment)` helper, test missing/`false`/`true` values, and construct the gateway with:

```js
batchEnabled: process.env.KF_REDUNDANCY_BATCH_APP_COMMANDS === 'true'
```

Default is `false`. Pass an explicit environment object to the parser in tests so process state is not mutated.

- [ ] **Step 5: Run tests and commit**

```bash
npm run test:redundancy
node --check lib/services/redundancy/command_gateway.js
node --check lib/services/redundancy/bootstrap.js
git add KingFusion3.6_Center/kingdevopscenter/kingopsserver/exe/lib/services/redundancy/command_gateway.js \
  KingFusion3.6_Center/kingdevopscenter/kingopsserver/exe/lib/services/redundancy/bootstrap.js \
  KingFusion3.6_Center/kingdevopscenter/kingopsserver/exe/test/redundancy/command_gateway_batch.test.js \
  KingFusion3.6_Center/kingdevopscenter/kingopsserver/exe/test/redundancy/bootstrap.test.js \
  KingFusion3.6_Center/kingdevopscenter/kingopsserver/exe/test/redundancy/run_all.js
git commit -m "feat(redundancy): add observable batch command gateway"
```

Expected: all center redundancy tests pass.

---

## Task 5: Use One APP-Set Operation in Both Enable and Switch

**Files:**

- Modify: `KingFusion3.6_Center/kingdevopscenter/kingopsserver/exe/lib/services/redundancy/operation_service.js`
- Modify: `KingFusion3.6_Center/kingdevopscenter/kingopsserver/exe/test/redundancy/operation_service.test.js`
- Modify: `KingFusion3.6_Center/kingdevopscenter/kingopsserver/exe/test/redundancy/event_repository.test.js`

- [ ] **Step 1: Rewrite the operation fixture around `executeManyAndObserve`**

Capture calls as stage-level entries:

```js
calls.push({ action, nodeId, appIds: [...appIds] })
```

Add assertions that enable makes two APP-set calls and switch makes two APP-set calls, with role sync between them. A two-APP target must produce one START call containing two IDs, not two gateway calls.

- [ ] **Step 2: Add failure-semantics tests before implementation**

Required cases:

- All APP-step rows exist with `PENDING` before the gateway receives the batch.
- A stop result containing one `FAILED` or `UNKNOWN` prevents `persistRole` and prevents role sync.
- A target-start result containing one failure updates all returned step rows, keeps the new role/revision, and marks the task failed without compensating stops.
- One batch command ID is written to every item from that batch.
- A gateway exception marks every still-pending step `UNKNOWN` before the task fails.
- Forced switch with offline source still creates no source STOP steps and records the existing skipped actions.
- Zero APP IDs produces no command and advances normally.

- [ ] **Step 3: Run the suite and confirm the old per-APP loop fails the tests**

Run `npm run test:redundancy` in the center `exe` directory.

Expected: failures because `runAppActions` currently adds and executes one step at a time.

- [ ] **Step 4: Replace the per-APP loop with a precreated APP-set stage**

Keep the method name `runAppActions` to limit the diff, but change its behavior:

1. Add all step rows first and retain an `appId → step` map.
2. Return immediately if the APP list is empty.
3. Call `commandGateway.executeManyAndObserve` once with the node, ordered APP IDs, action, metadata, and existing timeout defaults.
4. Pass an `onProgress` callback that updates the matching step immediately. `COMMAND_RESULT` stores `OBSERVING`, `FAILED`, or `UNKNOWN`; `OBSERVED_RESULT` stores the final status, observed state, message, and `finishedAt`.
5. If any item is not `SUCCEEDED`, throw one aggregate error whose `details.failures` contains the per-APP status/message.
6. If the gateway itself throws, update every unresolved step to `UNKNOWN` and then rethrow.

Remove the obsolete `continueOnError` argument. Both batch start and batch stop attempt all accepted items, then the stage decides whether it can advance.

- [ ] **Step 5: Verify no database migration is needed**

Use the existing free-form `command_status` text column for `UNKNOWN` and the existing `detail_json` for any batch metadata. Add an event repository round-trip test for `UNKNOWN`; do not change `CREATE TABLE`, database version, or cleanup behavior.

- [ ] **Step 6: Run tests and commit**

```bash
npm run test:redundancy
node --check lib/services/redundancy/operation_service.js
git add KingFusion3.6_Center/kingdevopscenter/kingopsserver/exe/lib/services/redundancy/operation_service.js \
  KingFusion3.6_Center/kingdevopscenter/kingopsserver/exe/test/redundancy/operation_service.test.js \
  KingFusion3.6_Center/kingdevopscenter/kingopsserver/exe/test/redundancy/event_repository.test.js
git commit -m "feat(redundancy): batch enable and switch app stages"
```

Expected: enable/switch ordering, forced-switch behavior, and failure semantics all pass.

---

## Task 6: Present Truthful Batch Progress in the Task Drawer

**Files:**

- Modify: `front/src/modules/redundancy/utils/operationTaskProgress.js`
- Modify: `front/src/modules/redundancy/utils/redundancyUtils.js`
- Modify: `front/src/modules/redundancy/components/OperationTaskDrawer.vue`
- Modify: `front/scripts/redundancy-front-integration.test.mjs`

- [ ] **Step 1: Write failing progress-model tests**

Add tests for a stage containing mixed APP step states. The helper should return:

```js
{
  action: 'START',
  total: 17,
  returned: 10,
  succeeded: 8,
  failed: 1,
  unknown: 1,
  observing: 0,
  pending: 7,
  running: true,
}
```

Rules:

- While a task is running, counts are scoped to the current APP stage (`STOP` or `START`), not stale rows from the earlier stage.
- `OBSERVING`, `FAILED`, and `UNKNOWN` count as returned because the agent has answered; only `SUCCEEDED`, `FAILED`, and `UNKNOWN` count as completed.
- `UNKNOWN` remains visually warning-level.
- On task completion/failure, the final summary may aggregate all APP steps.
- Existing task terminal detection remains based on task status, not APP row status.

- [ ] **Step 2: Run frontend tests and confirm failure**

```bash
cd front
npm test
```

Expected: failure because the current helper only reports completed/total and treats only success/failure as terminal.

- [ ] **Step 3: Add the batch status strip from the approved design**

In `OperationTaskDrawer.vue`, directly below “APP 执行明细”, render a compact strip only during an APP stage:

- Spinner and `正在批量启动 {total} 个 APP` or `正在批量停止 {total} 个 APP` for the logical APP stage; the rollout flag is an internal transport detail and does not change the user-facing task model.
- Secondary text `等待运维代理返回执行结果` while `returned === 0`.
- Secondary text `正在确认 APP 实际状态` when command results exist but rows are not all terminal.
- An Element Plus indeterminate progress bar; do not derive a fake percentage from APP count.
- Right-aligned `已返回 {returned} / {total}`.
- At terminal state, replace the running strip with `共 {total} / 成功 {succeeded} / 失败 {failed} / 未确认 {unknown}`.

The compatibility path uses the same logical batch wording because the user requested one multi-APP operation even when the center temporarily falls back to single-command transport.

- [ ] **Step 4: Keep the table stable and internally scrollable**

- Continue using `CustomStyleTable`; do not edit the shared component.
- Keep rows centered through the existing `redundancy-centered-table` class.
- Reserve a ten-row viewport at normal desktop height: table header plus ten 42 px rows. Cap it with `calc(100vh - 560px)` and retain a 282 px minimum for shorter screens.
- Use the table’s own `max-height`/scroll container; the drawer body must not become the primary table scroller.
- Preserve row order. Auto-follow only when a new row is added, not when a status update arrives.
- Add `OBSERVING` and `UNKNOWN` as warning-level values in `getRedundancyStatusTagType`; render an `UNKNOWN` row with localized “结果未确认” execution information.

- [ ] **Step 5: Run frontend tests and build**

```bash
npm test
npm run build
```

Expected: all frontend tests pass; Vite build succeeds; no unresolved Element Plus component/icon imports.

- [ ] **Step 6: Commit the task progress UI**

```bash
git add front/src/modules/redundancy/utils/operationTaskProgress.js \
  front/src/modules/redundancy/utils/redundancyUtils.js \
  front/src/modules/redundancy/components/OperationTaskDrawer.vue \
  front/scripts/redundancy-front-integration.test.mjs
git commit -m "feat(redundancy): show batch app task progress"
```

---

## Task 7: Complete Four-Language Copy and Update the Design Contract

**Files:**

- Modify: `front/src/i18n/i18nLaguage/zh.js`
- Modify: `front/src/i18n/i18nLaguage/en.js`
- Modify: `front/src/i18n/i18nLaguage/ja.js`
- Modify: `front/src/i18n/i18nLaguage/ko.js`
- Modify: `front/scripts/redundancy-front-integration.test.mjs`
- Modify: `docs/superpowers/specs/2026-09-01-kf-cold-redundancy-design.md`

- [ ] **Step 1: Add a failing four-locale key-completeness test**

Require the same new keys in all four language files:

```text
batchStartingApps
batchStoppingApps
waitingForAgentBatchResult
confirmingObservedAppState
returnedAppResults
batchResultSummary
unconfirmedAppResult
OBSERVING
```

- [ ] **Step 2: Add concise translations**

Use natural UI language, not literal machine translations. The Chinese source text is:

```text
正在批量启动 {total} 个 APP
正在批量停止 {total} 个 APP
等待运维代理返回执行结果
正在确认 APP 实际状态
已返回 {returned} / {total}
共 {total} / 成功 {succeeded} / 失败 {failed} / 未确认 {unknown}
结果未确认
确认状态中
```

Ensure Japanese and Korean layouts do not depend on fixed text width; let the secondary line ellipsize and expose the full text via tooltip/title.

- [ ] **Step 3: Correct the base design document**

Update sections 3, 4.3, 9, and the implementation notes that currently say “逐个投递” or “不使用批量返回值”. Replace them with the implemented contract:

- One guarded batch command per enable/switch APP stage.
- Agent concurrency START 4 / STOP 8 using existing single-APP primitives.
- Ordered `cmdResults` plus center-side actual-state observation.
- Safe feature-flag fallback for mixed-version rollout.
- No change to the role-sync stage.

- [ ] **Step 4: Run tests and commit**

```bash
cd front
npm test
npm run build
git add src/i18n/i18nLaguage/zh.js \
  src/i18n/i18nLaguage/en.js \
  src/i18n/i18nLaguage/ja.js \
  src/i18n/i18nLaguage/ko.js \
  scripts/redundancy-front-integration.test.mjs \
  ../docs/superpowers/specs/2026-09-01-kf-cold-redundancy-design.md
git commit -m "docs(redundancy): define batch operation contract"
```

Expected: locale-completeness test and frontend build pass.

---

## Task 8: End-to-End Verification and Controlled Rollout

**Files:**

- Verify only; no database file or generated build output is committed.

- [ ] **Step 1: Run all automated verification from clean package roots**

```bash
cd KingFusion3.6_Node/kingopsproxy/exe/kingopsagent/exe
npm run test:redundancy

cd ../../../../../KingFusion3.6_Center/kingdevopscenter/kingopsserver/exe
npm run test:redundancy

cd ../../../../front
npm test
npm run build

cd ..
git diff --check
```

Expected: all test suites and build pass; `git diff --check` prints nothing.

- [ ] **Step 2: Verify the command count with a local integration fixture**

For a configuration with 6 source APPs and 17 target APPs, assert the center creates:

- one batch STOP command containing exactly the 6 source IDs;
- zero APP commands during `SYNC_ROLES`;
- one batch START command containing exactly the 17 target IDs;
- 23 APP-step rows, each linked to its stage’s batch command ID;
- no command for an APP outside the two configured lists.

- [ ] **Step 3: Verify partial failures and timeouts**

Inject one explicit agent failure and one omitted child result. Confirm:

- all accepted agent items execute despite one failure;
- explicit failure is red/`FAILED`;
- omitted or timed-out result is warning/`UNKNOWN`;
- stop-stage uncertainty blocks role persistence;
- target-start uncertainty preserves the new role but fails the task;
- the task drawer never displays a fake percentage.

- [ ] **Step 4: Roll out without exposing a new center to old agents**

1. Keep `KF_REDUNDANCY_BATCH_APP_COMMANDS=false` on the center.
2. Upgrade and restart both node agents.
3. Verify each agent’s normal heartbeat, role acknowledgement, single APP start/stop, and one test batch command.
4. Upgrade center/backend and frontend while the flag remains false; verify legacy sequential enable/switch still works.
5. Set `KF_REDUNDANCY_BATCH_APP_COMMANDS=true` and restart only the center service.
6. Run enable, switch A→B, and switch B→A with controlled test APPs. Confirm command counts, APP states, task rows, and event history.
7. If any batch protocol issue appears, set the flag back to `false` and restart the center; no database rollback is required.

- [ ] **Step 5: Confirm packaging impact**

Record in the delivery manifest:

- Agent patch: new executor, agent command integration, and tests.
- Center patch: command result plumbing, gateway, operation orchestration, bootstrap flag, and tests.
- Frontend patch: task drawer, progress utility, four locale files, and tests.
- Database: no `.db` file and no SQL migration; existing SQLite columns are reused.
- Dependencies: no new `package.json` or lockfile entries.
- Ordinary APP management: no source files included and no behavior changed.

---

## Acceptance Checklist

- [ ] Enable and switch each issue one STOP batch and one START batch when the flag is enabled.
- [ ] Role synchronization issues no APP commands and cannot be delayed by APP startup.
- [ ] Agent START concurrency never exceeds 4, STOP concurrency never exceeds 8, and neither action touches unlisted APPs.
- [ ] Agent result order exactly matches request order.
- [ ] Center retains child results even when the overall batch is failed.
- [ ] Center verifies actual APP state before advancing/completing.
- [ ] Stop-stage failure/unknown leaves the original role unchanged.
- [ ] Target-start failure/unknown leaves the new role in place and marks the task failed.
- [ ] Forced switch still skips the offline source and shows its persisted skip reason.
- [ ] The drawer shows all APP rows immediately, truthful indeterminate progress, and per-APP final states.
- [ ] Ten-row table viewport scrolls internally and does not modify `CustomStyleTable`.
- [ ] Chinese, English, Japanese, and Korean copy all build successfully.
- [ ] Legacy sequential behavior remains available by disabling the feature flag.
- [ ] Ordinary APP management related source and behavior remain unchanged.
- [ ] No SQLite migration, generated `.db`, or new npm dependency is included.
