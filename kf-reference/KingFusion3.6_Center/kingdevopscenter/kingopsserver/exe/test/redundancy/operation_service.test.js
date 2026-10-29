// modified by jinlong.feng at 0901 冗余功能开发
'use strict'

const assert = require('assert')
const { test } = require('./helpers/test_runner')
const { OperationService } = require('../../lib/services/redundancy/operation_service')
const { CommandGateway } = require('../../lib/services/redundancy/command_gateway')
const { KeyedAsyncMutex } = require('../../lib/services/redundancy/async_mutex')

// modified by jinlong.feng at 2026-10-08 冗余停用关闭异常事件
// 服务内部使用全局 logger，测试环境需提供桩实现，
// 否则停用流程的容错分支会因 logger 未定义而抛错。
// 桩只暴露真实的 log(level, message)，误用其它方法应被测试暴露。
global.logger = global.logger || { log() {} }
// end modified by jinlong.feng at 2026-10-08 冗余停用关闭异常事件

/**
 * 创建操作服务夹具。
 *
 * @param {object} [options] 故障和初始状态选项。
 * @returns {object} 测试夹具。
 */
function createFixture(options = {}) {
  let config = {
    redundancyId: 'redundancy-1',
    tenantId: 'tenant-1',
    name: '冗余配置 1',
    lifecycle: options.lifecycle || 'DISABLED',
    revision: options.revision || 1,
    primaryNodeId: 'node-1',
    standbyNodeId: 'node-2',
    initialActiveNodeId: 'node-1',
    activeNodeId: options.activeNodeId || null,
    primaryAppIds: ['app-1'],
    standbyAppIds: options.twoTargetApps ? ['app-2', 'app-3'] : ['app-2'],
  }
  const repository = {
    findById: () => JSON.parse(JSON.stringify(config)),
    withExpectedRevision: (tenantId, redundancyId, expectedRevision, updater) => {
      if (config.revision !== expectedRevision) {
        const error = new Error('revision conflict')
        error.code = 'REDUNDANCY_REVISION_CONFLICT'
        throw error
      }
      config = updater(JSON.parse(JSON.stringify(config)))
      return JSON.parse(JSON.stringify(config))
    },
  }
  const snapshot = {
    primary: {
      nodeId: 'node-1',
      online: options.sourceOffline ? false : true,
      apps: [{ appId: 'app-1', exists: true, deployed: true, running: true }],
    },
    standby: {
      nodeId: 'node-2',
      online: true,
      apps: [
        { appId: 'app-2', exists: true, deployed: true, running: false },
        ...(options.twoTargetApps
          ? [{ appId: 'app-3', exists: true, deployed: true, running: false }]
          : []),
      ],
    },
  }
  const calls = []
  const commandGateway = {
    executeManyAndObserve: async ({ nodeId, appIds, action, onProgress }) => {
      calls.push(`${action}:${nodeId}:${appIds.join(',')}`)
      const commandId = `cmd-${action.toLowerCase()}-${nodeId}`
      const results = appIds.map((appId) => {
        const failed = options.failAppId === appId && action === 'START'
        const result = {
          appId,
          commandId,
          commandStatus: failed ? 'FAILED' : 'SUCCEEDED',
          observedStatus: failed ? null : action === 'START' ? 'RUNNING' : 'STOPPED',
          message: failed ? `start failed: ${appId}` : null,
        }
        onProgress({ phase: failed ? 'COMMAND_RESULT' : 'OBSERVED_RESULT', result })
        return result
      })
      return { mode: 'BATCH', commandId, results }
    },
  }
  const runtimeSynchronizer = {
    syncNode: async ({ nodeId, role, revision }) => {
      calls.push(`SYNC:${nodeId}:${role}:${revision}`)
      return { nodeId, role, revision }
    },
  }
  const tasks = new Map()
  const requestTasks = new Map()
  let taskSequence = 0
  let stepSequence = 0
  const steps = []
  // modified by jinlong.feng at 2026-10-08 冗余停用关闭异常事件
  const recoverCalls = []
  // end modified by jinlong.feng at 2026-10-08 冗余停用关闭异常事件
  // modified by jinlong.feng at 2026-10-08 冗余提示显示APP名称
  const appNames = options.appNames || { 'app-1': 'KIO_XLZ', 'app-2': 'KIO_SCADA' }
  // end modified by jinlong.feng at 2026-10-08 冗余提示显示APP名称
  const eventRepository = {
    findByRequestId: (tenantId, requestId) => requestTasks.get(`${tenantId}:${requestId}`) || null,
    createOperationTask: (input) => {
      const task = {
        ...input,
        taskId: `task-${++taskSequence}`,
        status: 'RUNNING',
        currentStage: 'CREATED',
      }
      tasks.set(task.taskId, task)
      requestTasks.set(`${input.tenantId}:${input.requestId}`, task)
      return { ...task }
    },
    updateOperationTask: (tenantId, taskId, patch) => {
      Object.assign(tasks.get(taskId), patch)
      return { ...tasks.get(taskId) }
    },
    addAppStep: (input) => {
      const step = { ...input, stepId: `step-${++stepSequence}`, commandStatus: 'PENDING' }
      steps.push(step)
      return { ...step }
    },
    updateAppStep: (tenantId, stepId, patch) => {
      Object.assign(steps.find((step) => step.stepId === stepId), patch)
      return { ...steps.find((step) => step.stepId === stepId) }
    },
    // modified by jinlong.feng at 2026-10-08 冗余停用关闭异常事件
    recoverOpenEventsByRedundancy: (tenantId, redundancyId) => {
      if (options.recoverEventsThrows) {
        throw new Error('recover open events failed')
      }
      recoverCalls.push({ tenantId, redundancyId })
      return options.openEventCount || 0
    },
    // end modified by jinlong.feng at 2026-10-08 冗余停用关闭异常事件
  }
  const service = new OperationService({
    configRepository: repository,
    // modified by jinlong.feng at 2026-10-08 冗余提示显示APP名称
    stateAdapter: {
      snapshot: async () => snapshot,
      getAppDisplayName: (tenantId, appId) =>
        (appNames && appNames[appId]) || appId,
    },
    // end modified by jinlong.feng at 2026-10-08 冗余提示显示APP名称
    commandGateway,
    runtimeSynchronizer,
    eventRepository,
    mutex: new KeyedAsyncMutex(),
    clock: () => '2026-09-01T13:00:00.000Z',
  })
  return { service, calls, tasks, steps, recoverCalls, getConfig: () => config }
}

test('首次生效先停失活端，再同步角色，最后启动激活端', async () => {
  const fixture = createFixture()
  const task = await fixture.service.enable({
    tenantId: 'tenant-1',
    redundancyId: 'redundancy-1',
    expectedRevision: 1,
    requestId: 'enable-1',
    operator: 'admin001',
  })

  assert.deepStrictEqual(fixture.calls, [
    'STOP:node-2:app-2',
    'SYNC:node-2:INACTIVE:2',
    'SYNC:node-1:ACTIVE:2',
    'START:node-1:app-1',
  ])
  assert.strictEqual(fixture.getConfig().lifecycle, 'ENABLED')
  assert.strictEqual(fixture.getConfig().activeNodeId, 'node-1')
  assert.strictEqual(task.status, 'SUCCEEDED')
})

test('正常切换先停止源节点全部 APP，再更新角色并启动目标 APP', async () => {
  const fixture = createFixture({ lifecycle: 'ENABLED', activeNodeId: 'node-1', revision: 4 })
  const task = await fixture.service.switchNode({
    tenantId: 'tenant-1',
    redundancyId: 'redundancy-1',
    targetNodeId: 'node-2',
    expectedRevision: 4,
    requestId: 'switch-1',
    operator: 'admin001',
    force: false,
  })

  assert.deepStrictEqual(fixture.calls, [
    'STOP:node-1:app-1',
    'SYNC:node-1:INACTIVE:5',
    'SYNC:node-2:ACTIVE:5',
    'START:node-2:app-2',
  ])
  assert.strictEqual(fixture.getConfig().activeNodeId, 'node-2')
  assert.strictEqual(task.status, 'SUCCEEDED')
})

test('源节点离线时普通切换拒绝，强制切换必须填写原因', async () => {
  const fixture = createFixture({
    lifecycle: 'ENABLED',
    activeNodeId: 'node-1',
    revision: 4,
    sourceOffline: true,
  })

  await assert.rejects(
    () =>
      fixture.service.switchNode({
        tenantId: 'tenant-1',
        redundancyId: 'redundancy-1',
        targetNodeId: 'node-2',
        expectedRevision: 4,
        requestId: 'switch-normal',
        operator: 'admin001',
        force: false,
      }),
    (error) => error.code === 'REDUNDANCY_NODE_OFFLINE',
  )
  await assert.rejects(
    () =>
      fixture.service.switchNode({
        tenantId: 'tenant-1',
        redundancyId: 'redundancy-1',
        targetNodeId: 'node-2',
        expectedRevision: 4,
        requestId: 'switch-force',
        operator: 'admin001',
        force: true,
        reason: '   ',
      }),
    (error) => error.code === 'REDUNDANCY_FORCE_REASON_REQUIRED',
  )
})

test('强制切换跳过离线源节点并在任务中记录跳过信息', async () => {
  const fixture = createFixture({
    lifecycle: 'ENABLED',
    activeNodeId: 'node-1',
    revision: 4,
    sourceOffline: true,
  })

  const task = await fixture.service.switchNode({
    tenantId: 'tenant-1',
    redundancyId: 'redundancy-1',
    targetNodeId: 'node-2',
    expectedRevision: 4,
    requestId: 'switch-force-success',
    operator: 'admin001',
    force: true,
    reason: '用户已确认强制切换',
  })

  assert.deepStrictEqual(fixture.calls, [
    'SYNC:node-2:ACTIVE:5',
    'START:node-2:app-2',
  ])
  assert.deepStrictEqual(task.input.skippedActions, [
    {
      action: 'STOP_SOURCE_APPS',
      nodeId: 'node-1',
      reasonCode: 'SOURCE_NODE_OFFLINE',
    },
    {
      action: 'CONFIRM_SOURCE_ROLE',
      nodeId: 'node-1',
      reasonCode: 'SOURCE_NODE_OFFLINE',
    },
  ])
  assert.strictEqual(fixture.getConfig().activeNodeId, 'node-2')
  assert.strictEqual(task.status, 'SUCCEEDED')
})

test('目标 APP 部分启动失败时保留新角色和已启动 APP，不自动回滚', async () => {
  const fixture = createFixture({
    lifecycle: 'ENABLED',
    activeNodeId: 'node-1',
    revision: 4,
    twoTargetApps: true,
    failAppId: 'app-3',
  })
  const task = await fixture.service.switchNode({
    tenantId: 'tenant-1',
    redundancyId: 'redundancy-1',
    targetNodeId: 'node-2',
    expectedRevision: 4,
    requestId: 'switch-partial',
    operator: 'admin001',
    force: false,
  })

  assert.strictEqual(task.status, 'FAILED')
  assert.strictEqual(fixture.getConfig().activeNodeId, 'node-2')
  assert.strictEqual(fixture.getConfig().revision, 5)
  assert.ok(fixture.calls.includes('START:node-2:app-2,app-3'))
  assert.ok(!fixture.calls.includes('STOP:node-2:app-2'))
})

test('APP 集合先创建全部 PENDING 步骤再一次交给命令网关', async () => {
  const fixture = createFixture({
    lifecycle: 'ENABLED', activeNodeId: 'node-1', revision: 4, twoTargetApps: true,
  })
  const task = await fixture.service.switchNode({
    tenantId: 'tenant-1', redundancyId: 'redundancy-1', targetNodeId: 'node-2',
    expectedRevision: 4, requestId: 'switch-batch', operator: 'admin001', force: false,
  })

  assert.strictEqual(task.status, 'SUCCEEDED')
  assert.strictEqual(fixture.calls.filter((call) => call.startsWith('START:')).length, 1)
  assert.ok(fixture.calls.includes('START:node-2:app-2,app-3'))
  const targetSteps = fixture.steps.filter((step) => step.nodeId === 'node-2')
  assert.strictEqual(targetSteps.length, 2)
  assert.strictEqual(new Set(targetSteps.map((step) => step.commandId)).size, 1)
})

test('相同 requestId 重试直接返回原任务且不重复下发命令', async () => {
  const fixture = createFixture()
  const input = {
    tenantId: 'tenant-1',
    redundancyId: 'redundancy-1',
    expectedRevision: 1,
    requestId: 'enable-idempotent',
    operator: 'admin001',
  }

  const first = await fixture.service.enable(input)
  const callCount = fixture.calls.length
  const second = await fixture.service.enable(input)

  assert.strictEqual(second.taskId, first.taskId)
  assert.strictEqual(fixture.calls.length, callCount)
})

test('命令网关同时确认命令成功和 APP 实际状态', async () => {
  let tick = 0
  const gateway = new CommandGateway({
    adapter: {
      enqueue: () => ({ commandId: 'cmd-1' }),
      getCommandStatus: () => (tick >= 1 ? { status: 'SUCCEEDED' } : { status: 'PENDING' }),
      getAppState: () => ({ running: tick >= 2 }),
    },
    wait: async () => {
      tick += 1
    },
    now: () => tick * 100,
    pollIntervalMs: 100,
  })

  const result = await gateway.executeAndObserve({
    nodeId: 'node-1',
    appId: 'app-1',
    action: 'START',
    timeoutMs: 1000,
    metadata: {},
  })

  assert.strictEqual(result.commandId, 'cmd-1')
  assert.strictEqual(result.observedStatus, 'RUNNING')
})

test('命令网关收到明确失败结果时立即返回失败', async () => {
  const gateway = new CommandGateway({
    adapter: {
      enqueue: () => ({ commandId: 'cmd-failed' }),
      getCommandStatus: () => ({ status: 'FAILED', message: 'pm2 start failed' }),
      getAppState: () => ({ running: false }),
    },
    wait: async () => {},
    now: () => 0,
  })

  await assert.rejects(
    () =>
      gateway.executeAndObserve({
        nodeId: 'node-1',
        appId: 'app-1',
        action: 'START',
        timeoutMs: 1000,
        metadata: {},
      }),
    /pm2 start failed/,
  )
})

// modified by jinlong.feng at 2026-10-08 冗余停用关闭异常事件
test('停用配置时关闭该配置下全部未恢复异常', async () => {
  const fixture = createFixture({
    lifecycle: 'ENABLED',
    activeNodeId: 'node-1',
    openEventCount: 2,
  })

  const task = await fixture.service.disable({
    tenantId: 'tenant-1',
    redundancyId: 'redundancy-1',
    expectedRevision: 1,
    requestId: 'disable-close-events',
    operator: 'admin001',
  })

  assert.deepStrictEqual(fixture.recoverCalls, [
    { tenantId: 'tenant-1', redundancyId: 'redundancy-1' },
  ])
  assert.strictEqual(fixture.getConfig().lifecycle, 'DISABLED')
  assert.strictEqual(task.status, 'SUCCEEDED')
})

test('关闭未恢复异常失败时不阻断停用结果', async () => {
  const fixture = createFixture({
    lifecycle: 'ENABLED',
    activeNodeId: 'node-1',
    recoverEventsThrows: true,
  })

  const task = await fixture.service.disable({
    tenantId: 'tenant-1',
    redundancyId: 'redundancy-1',
    expectedRevision: 1,
    requestId: 'disable-recover-failed',
    operator: 'admin001',
  })

  assert.strictEqual(fixture.recoverCalls.length, 0)
  assert.strictEqual(fixture.getConfig().lifecycle, 'DISABLED')
  assert.strictEqual(task.status, 'SUCCEEDED')
})
// end modified by jinlong.feng at 2026-10-08 冗余停用关闭异常事件

// modified by jinlong.feng at 2026-10-08 冗余提示显示APP名称
test('部分 APP 操作失败时提示显示 APP 名称而非 APP ID', async () => {
  const fixture = createFixture({ failAppId: 'app-1' })

  const task = await fixture.service.enable({
    tenantId: 'tenant-1',
    redundancyId: 'redundancy-1',
    expectedRevision: 1,
    requestId: 'enable-app-name',
    operator: 'admin001',
  })

  assert.strictEqual(task.status, 'FAILED')
  const message = task.failureMessage || ''
  assert.ok(
    message.includes('KIO_XLZ'),
    `失败信息应包含 APP 名称，实际为: ${message}`,
  )
  assert.ok(
    !message.includes('app-1'),
    `失败信息不应再出现 APP ID，实际为: ${message}`,
  )
})
// end modified by jinlong.feng at 2026-10-08 冗余提示显示APP名称
// end
