// modified by jinlong.feng at 0901 冗余功能开发
'use strict'

const assert = require('assert')
const { test } = require('./helpers/test_runner')
const { AppMembershipService } = require('../../lib/services/redundancy/app_membership_service')
const { KeyedAsyncMutex } = require('../../lib/services/redundancy/async_mutex')

/**
 * 创建在线 APP 维护测试夹具。
 *
 * @param {object} [options] 故障选项。
 * @returns {object} 测试夹具。
 */
function createFixture(options = {}) {
  let config = {
    redundancyId: 'redundancy-1',
    tenantId: 'tenant-1',
    name: '冗余配置 1',
    lifecycle: 'ENABLED',
    revision: 4,
    primaryNodeId: 'node-1',
    standbyNodeId: 'node-2',
    activeNodeId: 'node-1',
    primaryAppIds: options.primaryAppIds || ['app-a1'],
    standbyAppIds: options.standbyAppIds || ['app-b1'],
  }
  const apps = {
    'app-a1': { appId: 'app-a1', nodeId: 'node-1', deployed: true },
    'app-a2': { appId: 'app-a2', nodeId: 'node-1', deployed: true },
    'app-b1': { appId: 'app-b1', nodeId: 'node-2', deployed: true },
    'app-b2': { appId: 'app-b2', nodeId: 'node-2', deployed: true },
  }
  const repository = {
    findById: () => JSON.parse(JSON.stringify(config)),
    withExpectedRevision: (tenantId, redundancyId, expectedRevision, updater) => {
      assert.strictEqual(expectedRevision, config.revision)
      config = updater(JSON.parse(JSON.stringify(config)))
      return JSON.parse(JSON.stringify(config))
    },
  }
  const calls = []
  const tasks = new Map()
  let taskSequence = 0
  const eventRepository = {
    findByRequestId: () => null,
    createOperationTask: (input) => {
      const task = { ...input, taskId: `task-${++taskSequence}`, status: 'RUNNING' }
      tasks.set(task.taskId, task)
      return { ...task }
    },
    updateOperationTask: (tenantId, taskId, patch) => {
      Object.assign(tasks.get(taskId), patch)
      return { ...tasks.get(taskId) }
    },
    addAppStep: (input) => ({ ...input, stepId: `${input.action}-${input.appId}` }),
    updateAppStep: () => {},
  }
  const service = new AppMembershipService({
    configRepository: repository,
    stateProvider: {
      getApp: (tenantId, appId) => apps[appId] || null,
      // modified by jinlong.feng at 2026-10-09 冗余APP列表每侧至少一个
      getNode: (tenantId, nodeId) => ({
        nodeId,
        nodeName: nodeId === 'node-1' ? '主节点' : '从节点',
        online: true,
        exists: true,
      }),
      // end modified by jinlong.feng at 2026-10-09 冗余APP列表每侧至少一个
      // modified by jinlong.feng at 2026-10-08 冗余提示显示APP名称
      getAppDisplayName: (tenantId, appId) =>
        (apps[appId] && apps[appId].appName) || appId,
      // end modified by jinlong.feng at 2026-10-08 冗余提示显示APP名称
    },
    commandGateway: {
      executeAndObserve: async ({ nodeId, appId, action }) => {
        calls.push(`${action}:${nodeId}:${appId}`)
        if (options.failStart && action === 'START') throw new Error('start failed')
        return {
          commandId: `cmd-${appId}`,
          observedStatus: action === 'START' ? 'RUNNING' : 'STOPPED',
        }
      },
    },
    runtimeSynchronizer: {
      syncNode: async ({ nodeId, role, revision }) => {
        calls.push(`SYNC:${nodeId}:${role}:${revision}`)
      },
    },
    eventRepository,
    mutex: new KeyedAsyncMutex(),
    clock: () => '2026-09-01T14:00:00.000Z',
  })
  return { service, calls, getConfig: () => config }
}

test('混合 APP 变更先停失活端新增，再一次写配置和同步，最后启动激活端新增', async () => {
  const fixture = createFixture()
  const task = await fixture.service.applyChanges({
    tenantId: 'tenant-1',
    redundancyId: 'redundancy-1',
    expectedRevision: 4,
    requestId: 'app-change-1',
    operator: 'admin001',
    changes: [
      { nodeId: 'node-1', addAppIds: ['app-a2'], removeAppIds: ['app-a1'] },
      { nodeId: 'node-2', addAppIds: ['app-b2'], removeAppIds: ['app-b1'] },
    ],
  })

  assert.deepStrictEqual(fixture.calls, [
    'STOP:node-2:app-b2',
    'SYNC:node-2:INACTIVE:5',
    'SYNC:node-1:ACTIVE:5',
    'START:node-1:app-a2',
  ])
  assert.deepStrictEqual(fixture.getConfig().primaryAppIds, ['app-a2'])
  assert.deepStrictEqual(fixture.getConfig().standbyAppIds, ['app-b2'])
  assert.strictEqual(fixture.getConfig().revision, 5)
  assert.strictEqual(task.status, 'SUCCEEDED')
})

test('任一 APP 归属或成员关系校验失败时整项不执行', async () => {
  const fixture = createFixture()

  await assert.rejects(
    () =>
      fixture.service.applyChanges({
        tenantId: 'tenant-1',
        redundancyId: 'redundancy-1',
        expectedRevision: 4,
        requestId: 'app-change-invalid',
        operator: 'admin001',
        changes: [{ nodeId: 'node-1', addAppIds: ['app-b2'], removeAppIds: [] }],
      }),
    (error) => error.code === 'REDUNDANCY_APP_INVALID',
  )
  assert.deepStrictEqual(fixture.calls, [])
  assert.strictEqual(fixture.getConfig().revision, 4)
})

test('配置写入后激活端新增 APP 启动失败不回退列表和 revision', async () => {
  const fixture = createFixture({ failStart: true })
  const task = await fixture.service.applyChanges({
    tenantId: 'tenant-1',
    redundancyId: 'redundancy-1',
    expectedRevision: 4,
    requestId: 'app-change-failed',
    operator: 'admin001',
    changes: [{ nodeId: 'node-1', addAppIds: ['app-a2'], removeAppIds: [] }],
  })

  assert.strictEqual(task.status, 'FAILED')
  assert.ok(fixture.getConfig().primaryAppIds.includes('app-a2'))
  assert.strictEqual(fixture.getConfig().revision, 5)
})

test('只移出 APP 时仅解除管控，不发送启动或停止命令', async () => {
  // modified by jinlong.feng at 2026-10-09 冗余APP列表每侧至少一个
  // 两侧各保留一个 APP，否则会先命中「每侧至少一个」校验。
  const fixture = createFixture({
    primaryAppIds: ['app-a1', 'app-a2'],
    standbyAppIds: ['app-b1', 'app-b2'],
  })
  // end modified by jinlong.feng at 2026-10-09 冗余APP列表每侧至少一个
  await fixture.service.applyChanges({
    tenantId: 'tenant-1',
    redundancyId: 'redundancy-1',
    expectedRevision: 4,
    requestId: 'app-change-remove',
    operator: 'admin001',
    changes: [
      { nodeId: 'node-1', addAppIds: [], removeAppIds: ['app-a1'] },
      { nodeId: 'node-2', addAppIds: [], removeAppIds: ['app-b1'] },
    ],
  })

  assert.ok(fixture.calls.every((call) => call.startsWith('SYNC:')))
})

// modified by jinlong.feng at 2026-10-09 冗余APP列表每侧至少一个
test('在线维护不能把某一侧 APP 列表清空', async () => {
  const fixture = createFixture()

  await assert.rejects(
    () =>
      fixture.service.applyChanges({
        tenantId: 'tenant-1',
        redundancyId: 'redundancy-1',
        expectedRevision: 4,
        requestId: 'app-change-empty',
        operator: 'admin001',
        changes: [{ nodeId: 'node-1', addAppIds: [], removeAppIds: ['app-a1'] }],
      }),
    (error) =>
      error.code === 'REDUNDANCY_APP_LIST_EMPTY' &&
      error.message === '节点「主节点」的冗余 APP 列表不能为空，请至少保留一个 APP'
  )

  // 整批拒绝：不下发任何命令，配置和 revision 都不变
  assert.deepStrictEqual(fixture.calls, [])
  assert.strictEqual(fixture.getConfig().revision, 4)
  assert.deepStrictEqual(fixture.getConfig().primaryAppIds, ['app-a1'])
})

test('在线维护不能把两侧 APP 列表同时清空', async () => {
  const fixture = createFixture()

  await assert.rejects(
    () =>
      fixture.service.applyChanges({
        tenantId: 'tenant-1',
        redundancyId: 'redundancy-1',
        expectedRevision: 4,
        requestId: 'app-change-empty-both',
        operator: 'admin001',
        changes: [
          { nodeId: 'node-1', addAppIds: [], removeAppIds: ['app-a1'] },
          { nodeId: 'node-2', addAppIds: [], removeAppIds: ['app-b1'] },
        ],
      }),
    (error) => error.code === 'REDUNDANCY_APP_LIST_EMPTY'
  )
  assert.deepStrictEqual(fixture.calls, [])
})

test('移出一个 APP 但同侧仍保留其他 APP 时正常执行', async () => {
  const fixture = createFixture({ primaryAppIds: ['app-a1', 'app-a2'] })
  const task = await fixture.service.applyChanges({
    tenantId: 'tenant-1',
    redundancyId: 'redundancy-1',
    expectedRevision: 4,
    requestId: 'app-change-keep-one',
    operator: 'admin001',
    changes: [{ nodeId: 'node-1', addAppIds: [], removeAppIds: ['app-a2'] }],
  })

  assert.strictEqual(task.status, 'SUCCEEDED')
  assert.deepStrictEqual(fixture.getConfig().primaryAppIds, ['app-a1'])
})
// end modified by jinlong.feng at 2026-10-09 冗余APP列表每侧至少一个
// end
