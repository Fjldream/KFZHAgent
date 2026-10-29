// modified by jinlong.feng at 0901 冗余功能开发
'use strict'

const assert = require('assert')
const { test } = require('./helpers/test_runner')
const { RedundancyQueryService } = require('../../lib/services/redundancy/query_service')

const CONFIG = {
  redundancyId: 'redundancy-1',
  tenantId: 'tenant-1',
  name: '冗余配置 1',
  lifecycle: 'ENABLED',
  revision: 4,
  primaryNodeId: 'node-1',
  standbyNodeId: 'node-2',
  activeNodeId: 'node-1',
  primaryAppIds: ['app-1', 'app-2'],
  standbyAppIds: ['app-3'],
}

/**
 * 创建聚合查询服务夹具。
 *
 * @returns {RedundancyQueryService} 聚合查询服务。
 */
function createService() {
  const snapshot = {
    primary: {
      nodeId: 'node-1',
      nodeName: '主节点',
      online: true,
      role: 'ACTIVE',
      syncedRevision: 4,
      apps: [
        { appId: 'app-1', appName: 'APP 1', exists: true, deployed: true, running: true },
        { appId: 'app-2', appName: 'APP 2', exists: true, deployed: true, running: false },
      ],
    },
    standby: {
      nodeId: 'node-2',
      nodeName: '从节点',
      online: true,
      role: 'INACTIVE',
      syncedRevision: 4,
      apps: [{ appId: 'app-3', appName: 'APP 3', exists: true, deployed: true, running: false }],
    },
  }
  return new RedundancyQueryService({
    configService: {
      list: async () => [CONFIG],
      getDetail: async () => CONFIG,
    },
    stateAdapter: { snapshot: async () => snapshot },
    healthEvaluator: {
      evaluate: async () => ({
        healthStatus: 'ABNORMAL',
        reasons: [
          {
            key: 'REDUNDANCY_ACTIVE_APP_OFFLINE:node-1:app-2',
            code: 'REDUNDANCY_ACTIVE_APP_OFFLINE',
            nodeId: 'node-1',
            appId: 'app-2',
            summary: '激活节点 APP 未运行',
          },
        ],
        nodes: snapshot,
        evaluatedAt: '2026-09-01T12:00:00.000Z',
      }),
    },
    eventRepository: {
      queryEvents: () => [
        {
          eventId: 'event-1',
          status: 'OPEN',
          summary: '激活节点 APP 未运行',
        },
      ],
      queryOperationTasks: (filter) => {
        if (filter.operationType === 'SWITCH') {
          return [{ taskId: 'switch-1', status: 'SUCCEEDED', finishedAt: '2026-08-31T10:00:00Z' }]
        }
        return [{ taskId: 'task-1', status: 'RUNNING', currentStage: 'START_TARGET_APPS' }]
      },
    },
  })
}

test('列表聚合返回节点、APP 计数、当前异常、任务和最近切换', async () => {
  const result = await createService().list('tenant-1')
  const item = result[0]

  assert.strictEqual(item.healthStatus, 'ABNORMAL')
  assert.deepStrictEqual(item.primaryAppSummary, { total: 2, running: 1, stopped: 1, abnormal: 1 })
  assert.strictEqual(item.openEventCount, 1)
  assert.strictEqual(item.currentTask.taskId, 'task-1')
  assert.strictEqual(item.lastSwitchAt, '2026-08-31T10:00:00Z')
})

test('详情聚合返回两侧完整 APP 和全部当前健康原因', async () => {
  const detail = await createService().getDetail('tenant-1', 'redundancy-1')

  assert.strictEqual(detail.nodes.primary.apps.length, 2)
  assert.strictEqual(detail.nodes.standby.apps.length, 1)
  assert.strictEqual(detail.healthReasons[0].appId, 'app-2')
  assert.deepStrictEqual(detail.allowedActions, ['VIEW_TASK'])
})
// end
