// modified by jinlong.feng at 0901 冗余功能开发
'use strict'

const assert = require('assert')
const { test } = require('./helpers/test_runner')
const { OperationGuard } = require('../../lib/services/redundancy/operation_guard')
const {
  PermissionService,
  LegacyUserTypePermissionProvider
} = require('../../lib/services/redundancy/permission_service')
const { RedundancyController } = require('../../lib/controllers/redundancy')

const ENABLED_CONFIG = {
  redundancyId: 'redundancy-1',
  tenantId: 'tenant-1',
  lifecycle: 'ENABLED',
  activeNodeId: 'node-1',
  primaryNodeId: 'node-1',
  standbyNodeId: 'node-2',
  primaryAppIds: ['app-active'],
  standbyAppIds: ['app-inactive']
}

const DISABLED_CONFIG = {
  redundancyId: 'redundancy-2',
  tenantId: 'tenant-1',
  lifecycle: 'DISABLED',
  activeNodeId: null,
  primaryNodeId: 'node-3',
  standbyNodeId: 'node-4',
  primaryAppIds: ['app-disabled'],
  standbyAppIds: []
}

/**
 * 创建操作限制服务。
 *
 * @returns {OperationGuard} 操作限制服务。
 */
function createGuard() {
  return new OperationGuard({
    configProvider: { list: () => [ENABLED_CONFIG, DISABLED_CONFIG] }
  })
}

// modified by jinlong.feng at 2026-10-09 冗余受管APP禁止删除
test('已生效配置的受管 APP 两侧都禁止删除，启动停止和重启均允许', () => {
  const guard = createGuard()

  for (const action of ['START', 'STOP', 'RESTART', 'DEPLOY', 'EDIT', 'MOVE']) {
    assert.doesNotThrow(() =>
      guard.assertAppOperation('tenant-1', 'app-active', action)
    )
  }
  // 激活端：原先就禁止删除，错误码改为统一的 APP_DELETE_FORBIDDEN
  assert.throws(
    () => guard.assertAppOperation('tenant-1', 'app-active', 'DELETE'),
    (error) => error.code === 'REDUNDANCY_APP_DELETE_FORBIDDEN'
  )
  // 失活端：本次由「允许删除」改为「同样禁止删除」
  assert.throws(
    () => guard.assertAppOperation('tenant-1', 'app-inactive', 'DELETE'),
    (error) =>
      error.code === 'REDUNDANCY_APP_DELETE_FORBIDDEN' &&
      error.message ===
        'APP「app-inactive」已纳入冗余关系，请先在「修改 APP 列表」中移除后再删除'
  )
})

test('受管 APP 删除受限提示带名称并指明先移除冗余关系', () => {
  const guard = createNamedGuard()

  assert.throws(
    () => guard.assertAppOperation('tenant-1', 'app-inactive', 'DELETE'),
    (error) =>
      error.message ===
        'APP「名称-app-inactive」已纳入冗余关系，请先在「修改 APP 列表」中移除后再删除' &&
      error.details.appId === 'app-inactive'
  )
})
test('批量删除包含受管 APP 时整批拒绝并列出全部名称', () => {
  const guard = createNamedGuard()

  assert.throws(
    () =>
      guard.assertBatchOperation(
        'tenant-1',
        ['ordinary-app', 'app-active', 'app-inactive'],
        'DELETE'
      ),
    (error) =>
      error.code === 'REDUNDANCY_APP_DELETE_FORBIDDEN' &&
      error.message ===
        'APP「名称-app-active」、APP「名称-app-inactive」已纳入冗余关系，请先在「修改 APP 列表」中移除后再删除' &&
      error.details.appId === 'app-active' &&
      error.details.appIds.join(',') === 'app-active,app-inactive'
  )
  assert.doesNotThrow(() =>
    guard.assertBatchOperation('tenant-1', ['ordinary-app'], 'DELETE')
  )
})
// end modified by jinlong.feng at 2026-10-09 冗余受管APP禁止删除

test('失活节点受管 APP 禁止启动和重启', () => {
  const guard = createGuard()

  for (const action of ['STOP', 'DEPLOY', 'UNDEPLOY', 'EDIT', 'MOVE']) {
    assert.doesNotThrow(() =>
      guard.assertAppOperation('tenant-1', 'app-inactive', action)
    )
  }
  assert.throws(
    () => guard.assertAppOperation('tenant-1', 'app-inactive', 'START'),
    (error) => error.code === 'REDUNDANCY_INACTIVE_APP_START_FORBIDDEN'
  )
  assert.throws(
    () => guard.assertAppOperation('tenant-1', 'app-inactive', 'RESTART'),
    (error) => error.code === 'REDUNDANCY_INACTIVE_APP_RESTART_FORBIDDEN'
  )
})

test('未生效配置不限制 APP 操作（含删除），但配置中的节点仍禁止删除', () => {
  const guard = createGuard()

  for (const action of ['START', 'RESTART', 'DELETE']) {
    assert.doesNotThrow(() =>
      guard.assertAppOperation('tenant-1', 'app-disabled', action)
    )
  }
  for (const nodeId of ['node-1', 'node-2', 'node-3', 'node-4']) {
    assert.throws(
      () => guard.assertNodeOperation('tenant-1', nodeId, 'DELETE'),
      (error) => error.code === 'REDUNDANCY_NODE_DELETE_FORBIDDEN'
    )
  }
})

test('批量操作包含一个受限 APP 时整批拒绝', () => {
  const guard = createGuard()

  assert.throws(
    () =>
      guard.assertBatchOperation('tenant-1', ['ordinary-app', 'app-inactive'], 'START'),
    (error) =>
      error.code === 'REDUNDANCY_INACTIVE_APP_START_FORBIDDEN' &&
      error.details.appId === 'app-inactive'
  )
  assert.doesNotThrow(() =>
    guard.assertBatchOperation(
      'tenant-1',
      ['ordinary-app', 'app-active', 'app-inactive'],
      'STOP'
    )
  )
})

test('旧 userType 权限适配允许管理员维护，普通用户只读', async () => {
  const permissionService = new PermissionService(new LegacyUserTypePermissionProvider())

  await permissionService.assert({ userType: '02' }, 'REDUNDANCY_SWITCH')
  await permissionService.assert({ userType: '01', userId: 'reader' }, 'REDUNDANCY_VIEW')
  await assert.rejects(
    () =>
      permissionService.assert(
        { userType: '01', userId: 'reader' },
        'REDUNDANCY_SWITCH'
      ),
    (error) => error.code === 'REDUNDANCY_PERMISSION_DENIED'
  )
})

test('REST 新建接口只使用 oauthInfo 中的 tenantId', async () => {
  let capturedTenantId
  const controller = new RedundancyController({
    configService: {
      createConfig: async (tenantId) => {
        capturedTenantId = tenantId
        return { redundancyId: 'redundancy-1' }
      }
    },
    permissionService: { assert: async () => {} }
  })
  let responseData
  const request = {
    oauthInfo: { tenantId: 'tenant-real', userId: 'admin001', userType: '02' },
    body: { tenantId: 'tenant-forged', name: '冗余配置 1' }
  }
  const response = {
    sendOk: (data) => {
      responseData = data
    },
    sendErr: (code, message) => {
      throw new Error(`${code}:${message}`)
    }
  }

  await controller.create(request, response)

  assert.strictEqual(capturedTenantId, 'tenant-real')
  assert.strictEqual(responseData.redundancyId, 'redundancy-1')
})

// modified by jinlong.feng at 20260910 冗余功能-异常事件确认人显示用户名
test('REST 异常事件确认人优先使用请求头中的用户名', async () => {
  let capturedOperator
  const controller = new RedundancyController({
    eventRepository: {
      acknowledgeEvent: async (tenantId, eventId, operator) => {
        capturedOperator = operator
        return { eventId }
      }
    },
    permissionService: { assert: async () => {} }
  })
  const request = {
    oauthInfo: { tenantId: 'tenant-real', userId: 2.0, userType: '02' },
    headers: { username: 'admin' },
    params: { eventId: 'event-1' }
  }
  const response = {
    sendOk: () => {},
    sendErr: (code, message) => {
      throw new Error(`${code}:${message}`)
    }
  }

  await controller.acknowledgeEvent(request, response)

  assert.strictEqual(capturedOperator, 'admin')
})
// end modified by jinlong.feng at 20260910 冗余功能-异常事件确认人显示用户名

// modified by jinlong.feng at 2026-10-09 冗余启动拦截提示APP名称
/**
 * 创建带 APP 名称解析的操作限制服务。
 *
 * @returns {OperationGuard} 操作限制服务。
 */
function createNamedGuard() {
  const config = {
    ...ENABLED_CONFIG,
    standbyAppIds: ['app-inactive', 'app-inactive-2']
  }
  return new OperationGuard({
    configProvider: { list: () => [config, DISABLED_CONFIG] },
    stateAdapter: {
      getAppDisplayName: (tenantId, appId) => `名称-${appId}`
    }
  })
}

test('单 APP 受限提示带 APP 名称', () => {
  const guard = createNamedGuard()

  assert.throws(
    () => guard.assertAppOperation('tenant-1', 'app-inactive', 'START'),
    (error) =>
      error.code === 'REDUNDANCY_INACTIVE_APP_START_FORBIDDEN' &&
      error.message === '失活节点的冗余 APP 不允许启动：APP「名称-app-inactive」'
  )
})

test('批量受限提示一次列出全部受限 APP 名称', () => {
  const guard = createNamedGuard()

  assert.throws(
    () =>
      guard.assertBatchOperation(
        'tenant-1',
        ['ordinary-app', 'app-inactive', 'app-inactive-2', 'app-active'],
        'START'
      ),
    (error) =>
      error.code === 'REDUNDANCY_INACTIVE_APP_START_FORBIDDEN' &&
      error.message ===
        '失活节点的冗余 APP 不允许启动：APP「名称-app-inactive」、APP「名称-app-inactive-2」' &&
      error.details.appId === 'app-inactive' &&
      error.details.appIds.join(',') === 'app-inactive,app-inactive-2'
  )
})

test('未注入名称适配器时提示回退为 APP ID，且不影响判定', () => {
  const guard = createGuard()

  assert.throws(
    () => guard.assertBatchOperation('tenant-1', ['app-inactive'], 'RESTART'),
    (error) =>
      error.code === 'REDUNDANCY_INACTIVE_APP_RESTART_FORBIDDEN' &&
      error.message === '失活节点的冗余 APP 不允许重启：APP「app-inactive」'
  )
  assert.doesNotThrow(() =>
    guard.assertBatchOperation('tenant-1', ['ordinary-app'], 'START')
  )
})

test('批量中间件覆盖 multi* 路径与多点请求体写法', async () => {
  const { setSubsystem, getSubsystem } = require('../../lib/services/redundancy')
  const redundancyGuard = require('../../core/middlewares/redundancy-guard')
  const previousSubsystem = getSubsystem()
  setSubsystem({ operationGuard: createGuard() })

  /**
   * 执行一次中间件调用并返回响应结果或放行标记。
   *
   * @param {object} request 模拟请求。
   * @returns {Promise<*>} 响应结果或 'NEXT'。
   */
  const runGuard = async (request) => {
    let captured = null
    const response = {
      sendErr: (code, message) => {
        captured = { code, message }
      }
    }
    await redundancyGuard(request, response, () => {
      captured = 'NEXT'
    })
    return captured
  }

  try {
    const bareArray = await runGuard({
      method: 'POST',
      path: '/apps/multiStart',
      oauthInfo: { tenantId: 'tenant-1' },
      body: [{ appId: 'ordinary-app' }, { appId: 'app-inactive' }]
    })
    assert.strictEqual(bareArray.code, 'REDUNDANCY_INACTIVE_APP_START_FORBIDDEN')
    assert.strictEqual(
      bareArray.message,
      '失活节点的冗余 APP 不允许启动：APP「app-inactive」'
    )

    const wrapped = await runGuard({
      method: 'POST',
      path: '/apps/list/restart',
      oauthInfo: { tenantId: 'tenant-1' },
      body: { apps: ['app-inactive'] }
    })
    assert.strictEqual(wrapped.code, 'REDUNDANCY_INACTIVE_APP_RESTART_FORBIDDEN')

    const allowed = await runGuard({
      method: 'POST',
      path: '/apps/multiStart',
      oauthInfo: { tenantId: 'tenant-1' },
      body: [{ appId: 'ordinary-app' }]
    })
    assert.strictEqual(allowed, 'NEXT')

    // modified by jinlong.feng at 2026-10-09 冗余受管APP禁止删除
    const deleteBlocked = await runGuard({
      method: 'POST',
      path: '/apps/delete',
      oauthInfo: { tenantId: 'tenant-1' },
      body: { appId: 'app-inactive' }
    })
    assert.strictEqual(deleteBlocked.code, 'REDUNDANCY_APP_DELETE_FORBIDDEN')

    const deleteAllowed = await runGuard({
      method: 'POST',
      path: '/apps/delete',
      oauthInfo: { tenantId: 'tenant-1' },
      body: { appId: 'ordinary-app' }
    })
    assert.strictEqual(deleteAllowed, 'NEXT')
    // end modified by jinlong.feng at 2026-10-09 冗余受管APP禁止删除
  } finally {
    setSubsystem(previousSubsystem)
  }
})
// end modified by jinlong.feng at 2026-10-09 冗余启动拦截提示APP名称
// end
