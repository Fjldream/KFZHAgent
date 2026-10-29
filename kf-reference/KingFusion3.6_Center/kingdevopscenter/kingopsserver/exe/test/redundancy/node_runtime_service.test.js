// modified by jinlong.feng at 0901 冗余功能开发
'use strict'

const assert = require('assert')
const { test } = require('./helpers/test_runner')
const {
  NodeRuntimeService,
  NodeRuntimeRegistry,
  NodeRuntimeSynchronizer,
  isNodeRuntimePath,
} = require('../../lib/services/redundancy/node_runtime_service')

/**
 * 创建节点运行态测试夹具。
 *
 * @param {object} [overrides] 配置覆盖项。
 * @returns {{service: NodeRuntimeService, registry: NodeRuntimeRegistry, setConfig: Function}} 测试夹具。
 */
function createFixture(overrides = {}) {
  let config = {
    redundancyId: 'redundancy-1',
    tenantId: 'tenant-1',
    lifecycle: 'ENABLED',
    revision: 8,
    primaryNodeId: 'node-1',
    standbyNodeId: 'node-2',
    activeNodeId: 'node-1',
    primaryAppIds: ['app-1', 'app-2'],
    standbyAppIds: ['app-3'],
    ...overrides,
  }
  const registry = new NodeRuntimeRegistry()
  const service = new NodeRuntimeService({
    configProvider: {
      list: (tenantId) => (config && config.tenantId === tenantId ? [{ ...config }] : []),
    },
    runtimeRegistry: registry,
    clock: () => '2026-09-01T14:00:00.000Z',
  })
  return {
    service,
    registry,
    setConfig: (nextConfig) => {
      config = nextConfig
    },
  }
}

test('激活节点运行态包含受管 APP 的 RUNNING 目标状态', async () => {
  const { service } = createFixture()
  const runtime = await service.getRuntime('tenant-1', 'node-1')

  assert.strictEqual(runtime.enabled, true)
  assert.strictEqual(runtime.role, 'ACTIVE')
  assert.deepStrictEqual(runtime.appIds, ['app-1', 'app-2'])
  assert.deepStrictEqual(runtime.desiredStates, {
    'app-1': 'RUNNING',
    'app-2': 'RUNNING',
  })
  assert.strictEqual(runtime.reconcileRequired, true)
})

test('失活节点运行态包含受管 APP 的 STOPPED 目标状态', async () => {
  const { service } = createFixture()
  const runtime = await service.getRuntime('tenant-1', 'node-2')

  assert.strictEqual(runtime.enabled, true)
  assert.strictEqual(runtime.role, 'INACTIVE')
  assert.deepStrictEqual(runtime.appIds, ['app-3'])
  assert.deepStrictEqual(runtime.desiredStates, { 'app-3': 'STOPPED' })
})

test('未纳入配置的节点返回未启用和空 APP 列表', async () => {
  const { service } = createFixture()
  const runtime = await service.getRuntime('tenant-1', 'node-ordinary')

  assert.deepStrictEqual(runtime, {
    redundancyId: null,
    enabled: false,
    role: 'UNMANAGED',
    appIds: [],
    revision: 0,
    desiredStates: {},
    reconcileRequired: false,
  })
})

test('已停用配置不再要求节点收敛 APP 状态', async () => {
  const { service } = createFixture({ lifecycle: 'DISABLED', activeNodeId: null })
  const runtime = await service.getRuntime('tenant-1', 'node-1')

  assert.strictEqual(runtime.redundancyId, 'redundancy-1')
  assert.strictEqual(runtime.enabled, false)
  assert.strictEqual(runtime.role, 'UNMANAGED')
  assert.deepStrictEqual(runtime.appIds, [])
  assert.deepStrictEqual(runtime.desiredStates, {})
  assert.strictEqual(runtime.reconcileRequired, false)
})

test('节点成功同步当前 revision 后无需重复收敛', async () => {
  const { service } = createFixture()
  const result = await service.recordSyncResult({
    tenantId: 'tenant-1',
    nodeId: 'node-1',
    revision: 8,
    role: 'ACTIVE',
    success: true,
  })
  const runtime = await service.getRuntime('tenant-1', 'node-1')

  assert.strictEqual(result.accepted, true)
  assert.strictEqual(runtime.reconcileRequired, false)
})

test('强制切换后旧激活节点恢复时必须按新角色重新收敛', async () => {
  const fixture = createFixture()
  await fixture.service.recordSyncResult({
    tenantId: 'tenant-1',
    nodeId: 'node-1',
    revision: 8,
    role: 'ACTIVE',
    success: true,
  })
  fixture.setConfig({
    redundancyId: 'redundancy-1',
    tenantId: 'tenant-1',
    lifecycle: 'ENABLED',
    revision: 9,
    primaryNodeId: 'node-1',
    standbyNodeId: 'node-2',
    activeNodeId: 'node-2',
    primaryAppIds: ['app-1', 'app-2'],
    standbyAppIds: ['app-3'],
  })

  const runtime = await fixture.service.getRuntime('tenant-1', 'node-1')

  assert.strictEqual(runtime.role, 'INACTIVE')
  assert.strictEqual(runtime.revision, 9)
  assert.strictEqual(runtime.reconcileRequired, true)
})

test('过期同步结果不会覆盖中心记录的最新角色', async () => {
  const { service, registry } = createFixture()
  const result = await service.recordSyncResult({
    tenantId: 'tenant-1',
    nodeId: 'node-1',
    revision: 7,
    role: 'ACTIVE',
    success: true,
  })

  assert.strictEqual(result.accepted, false)
  assert.strictEqual(result.reason, 'STALE_REVISION')
  assert.strictEqual(registry.get('tenant-1', 'node-1'), null)
  assert.strictEqual((await service.getRuntime('tenant-1', 'node-1')).reconcileRequired, true)
})

test('心跳提示只返回 revision 和待收敛标识', async () => {
  const { service } = createFixture()
  const hint = await service.getHeartbeatHint('tenant-1', 'node-2')

  assert.deepStrictEqual(hint, {
    redundancyRevision: 8,
    reconcileRequired: true,
  })
})

test('免用户令牌路径严格限制为两个节点运行态接口', () => {
  assert.strictEqual(isNodeRuntimePath('/nodes/node-1/redundancy-runtime'), true)
  assert.strictEqual(isNodeRuntimePath('/nodes/node-1/redundancy-sync-result'), true)
  assert.strictEqual(isNodeRuntimePath('/nodes/node-1/redundancy-runtime/extra'), false)
  assert.strictEqual(isNodeRuntimePath('/redundancies'), false)
  assert.strictEqual(isNodeRuntimePath('/nodes//redundancy-runtime'), false)
})

test('Center 操作编排等待节点确认当前角色和 revision', async () => {
  const registry = new NodeRuntimeRegistry()
  let now = 0
  const synchronizer = new NodeRuntimeSynchronizer({
    runtimeRegistry: registry,
    now: () => now,
    wait: async () => {
      now += 10
      registry.set('tenant-1', 'node-1', {
        role: 'ACTIVE',
        revision: 8,
        confirmed: true,
      })
    },
    timeoutMs: 100,
  })

  const record = await synchronizer.syncNode({
    tenantId: 'tenant-1',
    nodeId: 'node-1',
    role: 'ACTIVE',
    revision: 8,
  })

  assert.strictEqual(record.confirmed, true)
})
// end
