// modified by jinlong.feng at 0901 冗余功能开发
'use strict'

const assert = require('assert')
const { test } = require('./helpers/test_runner')
const { StateAdapter } = require('../../lib/services/redundancy/state_adapter')
const { HealthEvaluator } = require('../../lib/services/redundancy/health_evaluator')

const CONFIG = {
  redundancyId: 'redundancy-1',
  tenantId: 'tenant-1',
  name: '冗余配置 1',
  lifecycle: 'ENABLED',
  revision: 4,
  primaryNodeId: 'node-1',
  standbyNodeId: 'node-2',
  activeNodeId: 'node-1',
  primaryAppIds: ['app-1'],
  standbyAppIds: ['app-2'],
}

/**
 * 创建健康状态正常的快照。
 *
 * @returns {object} 状态快照。
 */
function normalSnapshot() {
  return {
    primary: {
      nodeId: 'node-1',
      online: true,
      role: 'ACTIVE',
      syncedRevision: 4,
      apps: [
        {
          appId: 'app-1',
          appName: '采集工程 A',
          exists: true,
          nodeId: 'node-1',
          deployed: true,
          running: true,
          status: 'RUNNING',
        },
      ],
    },
    standby: {
      nodeId: 'node-2',
      online: true,
      role: 'INACTIVE',
      syncedRevision: 4,
      apps: [
        {
          appId: 'app-2',
          appName: '采集工程 B',
          exists: true,
          nodeId: 'node-2',
          deployed: true,
          running: false,
          status: 'STOPPED',
        },
      ],
    },
  }
}

test('状态适配器把现有模型 getter 和节点 APP 关系转换为稳定快照', async () => {
  const nodeManager = {
    nodeHome: {
      nodes: [
        {
          nodeId: 'node-1',
          tenantId: 'tenant-1',
          nodeName: '主节点',
          getNodeStatus: () => 'running',
        },
        {
          nodeId: 'node-2',
          tenantId: 'tenant-1',
          nodeName: '从节点',
          getNodeStatus: () => 'running',
        },
      ],
    },
  }
  const appManager = {
    appsBaseInfo: [
      {
        appId: 'app-1',
        appName: '采集工程 A',
        tenantId: 'tenant-1',
        getAppDeployStatus: () => 1,
        getAppStatus: () => 'running',
      },
      {
        appId: 'app-2',
        appName: '采集工程 B',
        tenantId: 'tenant-1',
        getAppDeployStatus: () => 1,
        getAppStatus: () => 0,
      },
    ],
  }
  const nodeAppManager = {
    findNodeIdByAppId: (appId) => (appId === 'app-1' ? 'node-1' : 'node-2'),
  }
  const runtimeRegistry = {
    get: (tenantId, nodeId) => ({
      role: nodeId === 'node-1' ? 'ACTIVE' : 'INACTIVE',
      revision: 4,
      confirmed: true,
    }),
  }
  const adapter = new StateAdapter({
    nodeManager,
    appManager,
    nodeAppManager,
    runtimeRegistry,
  })

  const snapshot = await adapter.snapshot(CONFIG)

  assert.strictEqual(snapshot.primary.online, true)
  assert.strictEqual(snapshot.primary.apps[0].running, true)
  assert.strictEqual(snapshot.standby.apps[0].running, false)
  assert.strictEqual(snapshot.primary.syncedRevision, 4)
})

test('两个节点在线、角色和 revision 已确认且 APP 状态符合角色时健康正常', async () => {
  const evaluator = new HealthEvaluator({
    stateAdapter: { snapshot: () => normalSnapshot() },
    clock: () => '2026-09-01T11:00:00.000Z',
  })

  const result = await evaluator.evaluate(CONFIG)

  assert.strictEqual(result.healthStatus, 'NORMAL')
  assert.deepStrictEqual(result.reasons, [])
})

test('节点离线、激活 APP 离线和失活 APP 运行可同时形成多个原因', async () => {
  const snapshot = normalSnapshot()
  snapshot.standby.online = false
  snapshot.primary.apps[0].running = false
  snapshot.primary.apps[0].status = 'OFFLINE'
  snapshot.standby.apps[0].running = true
  snapshot.standby.apps[0].status = 'RUNNING'
  const evaluator = new HealthEvaluator({
    stateAdapter: { snapshot: () => snapshot },
  })

  const result = await evaluator.evaluate(CONFIG)
  const codes = result.reasons.map((reason) => reason.code)

  assert.ok(codes.includes('REDUNDANCY_NODE_OFFLINE'))
  assert.ok(codes.includes('REDUNDANCY_ACTIVE_APP_OFFLINE'))
  assert.ok(codes.includes('REDUNDANCY_INACTIVE_APP_RUNNING'))
})

test('节点级和 APP 异常摘要均标明发生异常的节点名称', async () => {
  const snapshot = normalSnapshot()
  snapshot.primary.nodeName = '主节点甲'
  snapshot.primary.online = false
  snapshot.primary.apps[0].running = false
  snapshot.primary.apps[0].status = 'STOPPED'
  const evaluator = new HealthEvaluator({
    stateAdapter: { snapshot: () => snapshot },
  })

  const reasons = (await evaluator.evaluate(CONFIG)).reasons
  const nodeOffline = reasons.find((reason) => reason.code === 'REDUNDANCY_NODE_OFFLINE')
  const appOffline = reasons.find(
    (reason) => reason.code === 'REDUNDANCY_ACTIVE_APP_OFFLINE',
  )

  assert.strictEqual(nodeOffline.summary, '节点「主节点甲」离线')
  assert.strictEqual(nodeOffline.nodeName, '主节点甲')
  assert.strictEqual(appOffline.summary, '节点「主节点甲」的激活 APP「采集工程 A」未运行')
  assert.strictEqual(appOffline.nodeName, '主节点甲')
})

test('各类健康异常摘要均包含对应节点和 APP 的可识别名称', async () => {
  const snapshot = normalSnapshot()
  snapshot.primary.nodeName = '主节点甲'
  snapshot.primary.online = false
  snapshot.primary.role = null
  snapshot.primary.syncedRevision = 3
  snapshot.primary.apps = [
    {
      appId: 'app-missing',
      appName: null,
      exists: false,
      nodeId: null,
      deployed: false,
      running: false,
    },
    {
      appId: 'app-mismatch',
      appName: '归属错误工程',
      exists: true,
      nodeId: 'node-3',
      deployed: true,
      running: true,
    },
    {
      appId: 'app-undeployed',
      appName: '未部署工程',
      exists: true,
      nodeId: 'node-1',
      deployed: false,
      running: true,
    },
  ]
  snapshot.standby.nodeName = '从节点乙'
  snapshot.standby.apps[0].running = true
  const evaluator = new HealthEvaluator({
    stateAdapter: { snapshot: () => snapshot },
  })

  const reasons = (await evaluator.evaluate(CONFIG)).reasons
  const summaryByCode = Object.fromEntries(
    reasons.map((reason) => [reason.code, reason.summary]),
  )

  assert.strictEqual(summaryByCode.REDUNDANCY_NODE_OFFLINE, '节点「主节点甲」离线')
  assert.strictEqual(
    summaryByCode.REDUNDANCY_ROLE_NOT_CONFIRMED,
    '节点「主节点甲」角色未确认，期望 ACTIVE',
  )
  assert.strictEqual(
    summaryByCode.REDUNDANCY_REVISION_NOT_SYNCED,
    '节点「主节点甲」revision 未同步，期望 4',
  )
  assert.strictEqual(
    summaryByCode.REDUNDANCY_APP_MISSING,
    '节点「主节点甲」的配置 APP「app-missing」不存在',
  )
  assert.strictEqual(
    summaryByCode.REDUNDANCY_APP_NODE_MISMATCH,
    '节点「主节点甲」的 APP「归属错误工程」实际归属节点与配置不一致',
  )
  assert.strictEqual(
    summaryByCode.REDUNDANCY_APP_NOT_DEPLOYED,
    '节点「主节点甲」的配置 APP「未部署工程」未部署',
  )
  assert.strictEqual(
    summaryByCode.REDUNDANCY_INACTIVE_APP_RUNNING,
    '节点「从节点乙」的失活 APP「采集工程 B」仍在运行',
  )
})

test('多个激活节点 APP 未运行时分别返回对应的 APP 名称', async () => {
  const snapshot = normalSnapshot()
  snapshot.primary.apps = [
    {
      appId: 'app-1',
      appName: '采集工程 A',
      exists: true,
      nodeId: 'node-1',
      deployed: true,
      running: false,
      status: 'STOPPED',
    },
    {
      appId: 'app-3',
      appName: '报警服务',
      exists: true,
      nodeId: 'node-1',
      deployed: true,
      running: false,
      status: 'OFFLINE',
    },
  ]
  const evaluator = new HealthEvaluator({
    stateAdapter: { snapshot: () => snapshot },
  })

  const reasons = (await evaluator.evaluate(CONFIG)).reasons.filter(
    (reason) => reason.code === 'REDUNDANCY_ACTIVE_APP_OFFLINE',
  )

  assert.deepStrictEqual(
    reasons.map((reason) => ({
      appName: reason.appName,
      summary: reason.summary,
    })),
    [
      { appName: '采集工程 A', summary: '节点「node-1」的激活 APP「采集工程 A」未运行' },
      { appName: '报警服务', summary: '节点「node-1」的激活 APP「报警服务」未运行' },
    ],
  )
})

test('APP 缺失、归属错误、未部署、revision 未同步和角色未确认均可识别', async () => {
  const snapshot = normalSnapshot()
  snapshot.primary.apps = [
    {
      appId: 'app-1',
      exists: false,
      nodeId: null,
      deployed: false,
      running: false,
    },
  ]
  snapshot.standby.apps = [
    {
      appId: 'app-2',
      exists: true,
      nodeId: 'node-3',
      deployed: false,
      running: false,
    },
  ]
  snapshot.primary.syncedRevision = 3
  snapshot.standby.role = null
  const evaluator = new HealthEvaluator({
    stateAdapter: { snapshot: () => snapshot },
  })

  const codes = (await evaluator.evaluate(CONFIG)).reasons.map((reason) => reason.code)

  assert.ok(codes.includes('REDUNDANCY_APP_MISSING'))
  assert.ok(codes.includes('REDUNDANCY_APP_NODE_MISMATCH'))
  assert.ok(codes.includes('REDUNDANCY_APP_NOT_DEPLOYED'))
  assert.ok(codes.includes('REDUNDANCY_REVISION_NOT_SYNCED'))
  assert.ok(codes.includes('REDUNDANCY_ROLE_NOT_CONFIRMED'))
})

test('连续扫描相同异常只写一次 OPEN，恢复后关闭并仅在变化时推送', async () => {
  let currentSnapshot = normalSnapshot()
  currentSnapshot.primary.apps[0].running = false
  const openEvents = new Map()
  let openCalls = 0
  let recoverCalls = 0
  const published = []
  const eventRepository = {
    queryOperationTasks: () => [],
    queryEvents: ({ redundancyId, status }) =>
      [...openEvents.values()].filter(
        (event) => event.redundancyId === redundancyId && event.status === status,
      ),
    openEvent: (input) => {
      openCalls += 1
      const event = { ...input, eventId: `event-${openCalls}`, status: 'OPEN' }
      openEvents.set(input.reasonKey, event)
      return event
    },
    recoverEvent: ({ reasonKey }) => {
      recoverCalls += 1
      const event = openEvents.get(reasonKey)
      event.status = 'RECOVERED'
      return event
    },
  }
  const evaluator = new HealthEvaluator({
    stateAdapter: { snapshot: () => currentSnapshot },
    configProvider: { listEnabledConfigs: () => [CONFIG] },
    eventRepository,
    publisher: {
      publish: (type, payload) => published.push({ type, payload }),
    },
  })

  await evaluator.scanEnabledConfigs()
  await evaluator.scanEnabledConfigs()
  currentSnapshot = normalSnapshot()
  await evaluator.scanEnabledConfigs()

  assert.strictEqual(openCalls, 1)
  assert.strictEqual(recoverCalls, 1)
  assert.strictEqual(published.length, 2)
  assert.strictEqual(published[1].payload.healthStatus, 'NORMAL')
})

test('扫描时刷新已有 OPEN 事件中的 APP 名称且不重复发布状态变化', async () => {
  const snapshot = normalSnapshot()
  snapshot.primary.apps[0].running = false
  snapshot.primary.apps[0].status = 'STOPPED'
  const reasonKey = 'REDUNDANCY_ACTIVE_APP_OFFLINE:node-1:app-1'
  const existingEvent = {
    tenantId: CONFIG.tenantId,
    redundancyId: CONFIG.redundancyId,
    reasonKey,
    status: 'OPEN',
    summary: '激活节点 APP 未运行',
  }
  const updatedEvents = []
  const published = []
  const evaluator = new HealthEvaluator({
    stateAdapter: { snapshot: () => snapshot },
    configProvider: { listEnabledConfigs: () => [CONFIG] },
    eventRepository: {
      queryOperationTasks: () => [],
      queryEvents: () => [existingEvent],
      openEvent: () => {
        throw new Error('已有原因不应重复创建事件')
      },
      updateOpenEvent: (input) => updatedEvents.push(input),
      recoverEvent: () => null,
    },
    publisher: {
      publish: (type, payload) => published.push({ type, payload }),
    },
  })

  await evaluator.scanEnabledConfigs()

  assert.strictEqual(updatedEvents.length, 1)
  assert.strictEqual(updatedEvents[0].reasonKey, reasonKey)
  assert.strictEqual(
    updatedEvents[0].summary,
    '节点「node-1」的激活 APP「采集工程 A」未运行',
  )
  assert.strictEqual(updatedEvents[0].detail.nodeName, 'node-1')
  assert.strictEqual(updatedEvents[0].detail.appName, '采集工程 A')
  assert.strictEqual(published.length, 0)
})

test('运行中任务暂停异常事件变更并在任务结束后恢复扫描', async () => {
  const snapshot = normalSnapshot()
  snapshot.primary.apps[0].running = false
  snapshot.primary.apps[0].status = 'STOPPED'
  let taskStatus = 'RUNNING'
  const openedEvents = []
  const recoveredEvents = []
  const existingEvents = [
    {
      tenantId: CONFIG.tenantId,
      redundancyId: CONFIG.redundancyId,
      reasonKey: 'REDUNDANCY_ROLE_NOT_CONFIRMED:node-2:',
      status: 'OPEN',
      summary: '节点角色未确认，期望 INACTIVE',
    },
  ]
  const evaluator = new HealthEvaluator({
    stateAdapter: { snapshot: () => snapshot },
    configProvider: { listEnabledConfigs: () => [CONFIG] },
    eventRepository: {
      queryOperationTasks: () => [{ status: taskStatus }],
      queryEvents: () => existingEvents,
      openEvent: (input) => openedEvents.push(input),
      updateOpenEvent: () => null,
      recoverEvent: (input) => recoveredEvents.push(input),
    },
    publisher: { publish: () => null },
  })

  await evaluator.scanEnabledConfigs()

  assert.strictEqual(openedEvents.length, 0)
  assert.strictEqual(recoveredEvents.length, 0)

  taskStatus = 'SUCCEEDED'
  await evaluator.scanEnabledConfigs()

  assert.strictEqual(openedEvents.length, 1)
  assert.strictEqual(openedEvents[0].appId, 'app-1')
  assert.strictEqual(recoveredEvents.length, 1)
  assert.strictEqual(recoveredEvents[0].reasonKey, 'REDUNDANCY_ROLE_NOT_CONFIRMED:node-2:')
})
// end
