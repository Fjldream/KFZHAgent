// modified by jinlong.feng at 0901 冗余功能开发
'use strict'

const assert = require('assert')
const { test } = require('./helpers/test_runner')
const { ReconcileService } = require('../../lib/services/redundancy/reconcile_service')
const { RuntimeCoordinator } = require('../../lib/services/redundancy/runtime_coordinator')

/**
 * 创建启动收敛测试夹具。
 *
 * @param {object} options 测试选项。
 * @returns {object} 测试夹具。
 */
function createFixture(options = {}) {
  const calls = []
  let cachedRuntime = options.cachedRuntime || {
    enabled: true,
    role: 'ACTIVE',
    revision: 7,
    appIds: ['old-app'],
    desiredStates: { 'old-app': 'RUNNING' },
  }
  const cacheManager = {
    read: () => (cachedRuntime ? JSON.parse(JSON.stringify(cachedRuntime)) : null),
    write: (runtime) => {
      cachedRuntime = JSON.parse(JSON.stringify(runtime))
      calls.push(`CACHE:${runtime.revision}:${runtime.role}`)
    },
  }
  const runtimeClient = {
    getRuntime: async () => {
      calls.push('GET_RUNTIME')
      if (options.centerUnavailable) throw new Error('center unavailable')
      return (
        options.runtime || {
          redundancyId: 'redundancy-1',
          enabled: true,
          role: 'ACTIVE',
          revision: 8,
          appIds: ['new-app'],
          desiredStates: { 'new-app': 'RUNNING' },
          reconcileRequired: true,
        }
      )
    },
    reportSyncResult: async (nodeInfo, payload) => {
      calls.push(`REPORT:${payload.revision}:${payload.success}`)
      return { accepted: true }
    },
  }
  const appControl = {
    AppStart: async (appId) => {
      calls.push(`START:${appId}`)
      return { cmdStatus: 2 }
    },
    AppStop: async (appId) => {
      calls.push(`STOP:${appId}`)
      return { cmdStatus: 2 }
    },
  }
  const reconcileService = new ReconcileService({ appControl })
  const coordinator = new RuntimeCoordinator({
    nodeInfo: { nodeId: 'node-1', tenantId: 'tenant-1' },
    runtimeClient,
    cacheManager,
    reconcileService,
    logger: { info: () => {}, warn: () => {}, error: () => {} },
  })
  return { coordinator, calls, getCache: () => cachedRuntime }
}

test('节点启动先停止缓存中的受管 APP，再获取中心角色并按 ACTIVE 启动', async () => {
  const fixture = createFixture()
  const result = await fixture.coordinator.initializeAfterRegistration()

  assert.deepStrictEqual(fixture.calls, [
    'STOP:old-app',
    'GET_RUNTIME',
    'CACHE:8:ACTIVE',
    'REPORT:8:true',
    'START:new-app',
  ])
  assert.deepStrictEqual(result.managedAppIds, ['new-app'])
})

test('节点启动时 Center 不可访问则缓存中的受管 APP 保持停止', async () => {
  const fixture = createFixture({ centerUnavailable: true })
  const result = await fixture.coordinator.initializeAfterRegistration()

  assert.deepStrictEqual(fixture.calls, ['STOP:old-app', 'GET_RUNTIME'])
  assert.strictEqual(result.centerAvailable, false)
  assert.strictEqual(fixture.getCache().revision, 7)
})

test('Center 返回 INACTIVE 时所有当前配置 APP 保持停止', async () => {
  const fixture = createFixture({
    runtime: {
      redundancyId: 'redundancy-1',
      enabled: true,
      role: 'INACTIVE',
      revision: 9,
      appIds: ['app-2', 'app-3'],
      desiredStates: { 'app-2': 'STOPPED', 'app-3': 'STOPPED' },
      reconcileRequired: true,
    },
  })

  await fixture.coordinator.initializeAfterRegistration()

  assert.deepStrictEqual(fixture.calls, [
    'STOP:old-app',
    'GET_RUNTIME',
    'CACHE:9:INACTIVE',
    'REPORT:9:true',
    'STOP:app-2',
    'STOP:app-3',
  ])
})

test('正常运行后心跳刷新失败不会停止当前 APP', async () => {
  const fixture = createFixture()
  await fixture.coordinator.initializeAfterRegistration()
  fixture.calls.splice(0)
  fixture.coordinator.runtimeClient.getRuntime = async () => {
    fixture.calls.push('GET_RUNTIME_FAILED')
    throw new Error('center unavailable')
  }

  const result = await fixture.coordinator.onHeartbeatHint({
    redundancyRevision: 9,
    reconcileRequired: true,
  })

  assert.strictEqual(result.refreshed, false)
  assert.deepStrictEqual(fixture.calls, ['GET_RUNTIME_FAILED'])
})

test('正常运行时角色 revision 变化只确认角色，不在同步阶段启停 APP', async () => {
  const fixture = createFixture({
    cachedRuntime: {
      enabled: true,
      role: 'INACTIVE',
      revision: 7,
      appIds: ['old-app'],
      desiredStates: { 'old-app': 'STOPPED' },
    },
    runtime: {
      redundancyId: 'redundancy-1',
      enabled: true,
      role: 'ACTIVE',
      revision: 8,
      appIds: ['new-app'],
      desiredStates: { 'new-app': 'RUNNING' },
      reconcileRequired: true,
    },
  })

  const result = await fixture.coordinator.onHeartbeatHint({
    redundancyRevision: 8,
    reconcileRequired: true,
  })

  assert.strictEqual(result.refreshed, true)
  assert.deepStrictEqual(fixture.calls, [
    'GET_RUNTIME',
    'CACHE:8:ACTIVE',
    'REPORT:8:true',
  ])
})

test('心跳 revision 未变化且无需收敛时不重复查询完整运行态', async () => {
  const fixture = createFixture()
  await fixture.coordinator.initializeAfterRegistration()
  fixture.calls.splice(0)

  const result = await fixture.coordinator.onHeartbeatHint({
    redundancyRevision: 8,
    reconcileRequired: false,
  })

  assert.strictEqual(result.refreshed, false)
  assert.deepStrictEqual(fixture.calls, [])
})

test('兼容尚未附带冗余提示的旧 Center 心跳响应', async () => {
  const fixture = createFixture()
  await fixture.coordinator.initializeAfterRegistration()
  fixture.calls.splice(0)

  const result = await fixture.coordinator.onHeartbeatHint({
    redundancyRevision: undefined,
    reconcileRequired: false,
  })

  assert.strictEqual(result.refreshed, false)
  assert.deepStrictEqual(fixture.calls, [])
})
// end
