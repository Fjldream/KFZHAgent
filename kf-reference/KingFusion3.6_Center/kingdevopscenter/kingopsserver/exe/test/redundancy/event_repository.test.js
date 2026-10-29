// modified by jinlong.feng at 0901 冗余功能开发
'use strict'

const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { test } = require('./helpers/test_runner')
const { EventRepository } = require('../../lib/services/redundancy/event_repository')

const Database = require(process.env.KF_BETTER_SQLITE3_MODULE || 'better-sqlite3')

/**
 * 创建独立 SQLite 事件仓库夹具。
 *
 * @returns {{repository: EventRepository, databasePath: string}} 测试夹具。
 */
function createFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kf-redundancy-events-'))
  const databasePath = path.join(directory, 'redundancy.db')
  let idSequence = 0
  const repository = new EventRepository({
    databasePath,
    Database,
    idFactory: () => `id-${++idSequence}`,
    clock: () => '2026-09-01T10:00:00.000Z',
  })
  return { repository, databasePath }
}

test('事件映射同时返回数据库领域字段和前端兼容字段', () => {
  const repository = Object.create(EventRepository.prototype)
  const event = repository.mapEvent({
    event_id: 'event-1',
    redundancy_id: 'redundancy-1',
    redundancy_name_snapshot: '冗余配置 1',
    tenant_id: 'tenant-1',
    reason_key: 'REDUNDANCY_NODE_OFFLINE:node-1:',
    event_type: 'REDUNDANCY_NODE_OFFLINE',
    severity: 'ERROR',
    node_id: 'node-1',
    app_id: null,
    summary: '节点离线',
    detail_json: '{}',
    status: 'RECOVERED',
    occurred_at: '2026-09-03T08:04:04.410Z',
    recovered_at: '2026-09-03T08:04:09.410Z',
    acknowledged_by: null,
    acknowledged_at: null,
  })

  assert.strictEqual(event.eventType, 'REDUNDANCY_NODE_OFFLINE')
  assert.strictEqual(event.reasonCode, 'REDUNDANCY_NODE_OFFLINE')
  assert.strictEqual(event.occurredAt, '2026-09-03T08:04:04.410Z')
  assert.strictEqual(event.openedAt, '2026-09-03T08:04:04.410Z')
  assert.strictEqual(event.recoveredAt, '2026-09-03T08:04:09.410Z')
})

test('事件数据库启用 WAL、外键和 busy timeout', () => {
  const { repository } = createFixture()

  assert.strictEqual(repository.getDatabase().pragma('journal_mode', { simple: true }), 'wal')
  assert.strictEqual(repository.getDatabase().pragma('foreign_keys', { simple: true }), 1)
  assert.strictEqual(repository.getDatabase().pragma('busy_timeout', { simple: true }), 5000)
  repository.close()
})

test('同一异常原因只保留一条 OPEN 事件并支持恢复和确认', () => {
  const { repository } = createFixture()
  const input = {
    tenantId: 'tenant-1',
    redundancyId: 'redundancy-1',
    redundancyName: '冗余配置 1',
    reasonKey: 'ACTIVE_APP_OFFLINE:node-1:app-1',
    eventType: 'ACTIVE_APP_OFFLINE',
    severity: 'ERROR',
    nodeId: 'node-1',
    appId: 'app-1',
    summary: '激活节点 APP 离线',
    detail: { actualStatus: 'OFFLINE' },
  }

  const first = repository.openEvent(input)
  const duplicate = repository.openEvent(input)
  assert.strictEqual(duplicate.eventId, first.eventId)
  assert.strictEqual(repository.queryEvents({ tenantId: 'tenant-1', status: 'OPEN' }).length, 1)

  const acknowledged = repository.acknowledgeEvent('tenant-1', first.eventId, 'admin001')
  assert.strictEqual(acknowledged.acknowledgedBy, 'admin001')

  const recovered = repository.recoverEvent({
    tenantId: 'tenant-1',
    redundancyId: 'redundancy-1',
    reasonKey: input.reasonKey,
  })
  assert.strictEqual(recovered.status, 'RECOVERED')
  assert.strictEqual(recovered.recoveredAt, '2026-09-01T10:00:00.000Z')
  repository.close()
})

test('刷新 OPEN 事件时保留事件 ID 和发生时间并更新摘要与详情', () => {
  const { repository } = createFixture()
  const event = repository.openEvent({
    tenantId: 'tenant-1',
    redundancyId: 'redundancy-1',
    reasonKey: 'REDUNDANCY_ACTIVE_APP_OFFLINE:node-1:app-1',
    eventType: 'REDUNDANCY_ACTIVE_APP_OFFLINE',
    severity: 'ERROR',
    nodeId: 'node-1',
    appId: 'app-1',
    summary: '激活节点 APP 未运行',
    detail: { appId: 'app-1' },
  })

  const updated = repository.updateOpenEvent({
    tenantId: 'tenant-1',
    redundancyId: 'redundancy-1',
    reasonKey: event.reasonKey,
    summary: '激活节点 APP「采集工程 A」未运行',
    detail: { appId: 'app-1', appName: '采集工程 A' },
  })

  assert.strictEqual(updated.eventId, event.eventId)
  assert.strictEqual(updated.occurredAt, event.occurredAt)
  assert.strictEqual(updated.summary, '激活节点 APP「采集工程 A」未运行')
  assert.strictEqual(updated.detail.appName, '采集工程 A')
  repository.close()
})

test('操作任务按 tenantId 和 requestId 幂等并保存结构化输入', () => {
  const { repository } = createFixture()
  const input = {
    tenantId: 'tenant-1',
    requestId: 'request-1',
    redundancyId: 'redundancy-1',
    redundancyName: '冗余配置 1',
    operationType: 'SWITCH',
    configRevision: 3,
    operator: 'admin001',
    input: { targetNodeId: 'node-2' },
  }

  const first = repository.createOperationTask(input)
  const duplicate = repository.createOperationTask(input)

  assert.strictEqual(duplicate.taskId, first.taskId)
  assert.deepStrictEqual(duplicate.input, { targetNodeId: 'node-2' })
  assert.strictEqual(repository.findByRequestId('tenant-1', 'request-1').taskId, first.taskId)
  repository.close()
})

test('操作任务记录逐 APP 步骤并可中断运行中任务', () => {
  const { repository } = createFixture()
  const task = repository.createOperationTask({
    tenantId: 'tenant-1',
    requestId: 'request-2',
    redundancyId: 'redundancy-1',
    operationType: 'ENABLE',
    configRevision: 1,
    operator: 'admin001',
    input: {},
  })
  const step = repository.addAppStep({
    tenantId: 'tenant-1',
    taskId: task.taskId,
    nodeId: 'node-1',
    appId: 'app-1',
    action: 'START',
  })
  const updatedStep = repository.updateAppStep('tenant-1', step.stepId, {
    commandStatus: 'SUCCEEDED',
    observedStatus: 'RUNNING',
  })
  assert.strictEqual(updatedStep.observedStatus, 'RUNNING')
  assert.strictEqual(
    repository.queryOperationTasks({
      tenantId: 'tenant-1',
      operationType: 'ENABLE',
    }).length,
    1,
  )
  assert.strictEqual(
    repository.getOperationTaskDetail('tenant-1', task.taskId).appSteps[0].appId,
    'app-1',
  )

  assert.strictEqual(repository.interruptRunningTasks('center restarted'), 1)
  assert.strictEqual(repository.findByRequestId('tenant-1', 'request-2').status, 'INTERRUPTED')
  repository.close()
})

test('90 天清理只删除已恢复事件和已成功完成任务', () => {
  const { repository } = createFixture()
  const oldTime = '2026-05-01T00:00:00.000Z'
  const openEvent = repository.openEvent({
    tenantId: 'tenant-1',
    redundancyId: 'redundancy-1',
    reasonKey: 'NODE_OFFLINE:node-1',
    eventType: 'NODE_OFFLINE',
    severity: 'ERROR',
    nodeId: 'node-1',
    summary: '节点离线',
    occurredAt: oldTime,
    detail: {},
  })
  const recoveredEvent = repository.openEvent({
    tenantId: 'tenant-1',
    redundancyId: 'redundancy-1',
    reasonKey: 'APP_OFFLINE:app-old',
    eventType: 'ACTIVE_APP_OFFLINE',
    severity: 'ERROR',
    appId: 'app-old',
    summary: '历史 APP 离线',
    occurredAt: oldTime,
    detail: {},
  })
  repository.recoverEvent({
    tenantId: 'tenant-1',
    redundancyId: 'redundancy-1',
    reasonKey: 'APP_OFFLINE:app-old',
    recoveredAt: oldTime,
  })

  const succeededTask = repository.createOperationTask({
    tenantId: 'tenant-1',
    requestId: 'request-old-success',
    redundancyId: 'redundancy-1',
    operationType: 'ENABLE',
    configRevision: 1,
    operator: 'admin001',
    startedAt: oldTime,
    input: {},
  })
  repository.updateOperationTask('tenant-1', succeededTask.taskId, {
    status: 'SUCCEEDED',
    finishedAt: oldTime,
  })
  const failedTask = repository.createOperationTask({
    tenantId: 'tenant-1',
    requestId: 'request-old-failed',
    redundancyId: 'redundancy-1',
    operationType: 'SWITCH',
    configRevision: 2,
    operator: 'admin001',
    startedAt: oldTime,
    input: {},
  })
  repository.updateOperationTask('tenant-1', failedTask.taskId, {
    status: 'FAILED',
    finishedAt: oldTime,
  })

  repository.cleanupBefore('2026-06-03T00:00:00.000Z')

  assert.ok(
    repository
      .queryEvents({ tenantId: 'tenant-1' })
      .some((item) => item.eventId === openEvent.eventId),
  )
  assert.ok(
    !repository
      .queryEvents({ tenantId: 'tenant-1' })
      .some((item) => item.eventId === recoveredEvent.eventId),
  )
  assert.strictEqual(repository.findByRequestId('tenant-1', 'request-old-success'), null)
  assert.strictEqual(repository.findByRequestId('tenant-1', 'request-old-failed').status, 'FAILED')
  repository.close()
})
// end
