// modified by jinlong.feng at 0901 冗余功能开发
'use strict'

const assert = require('assert')
const path = require('path')
const { test } = require('./helpers/test_runner')
const { getSubsystem } = require('../../lib/services/redundancy')
const {
  RedundancyBootstrap,
} = require('../../lib/services/redundancy/bootstrap')

/**
 * 创建不接触磁盘和网络的启动引导测试夹具。
 *
 * @returns {{bootstrap: RedundancyBootstrap, calls: string[], services: object}} 测试夹具。
 */
function createFixture() {
  const calls = []
  const services = {
    configRepository: {
      list: () => calls.push('validate-config'),
    },
    eventRepository: {
      interruptRunningTasks: () => calls.push('interrupt-tasks'),
      cleanupBefore: () => calls.push('cleanup'),
      close: () => calls.push('close-database'),
    },
    wsService: {
      start: ({ httpServer }) => calls.push(`start-ws:${httpServer.id}`),
      stop: () => calls.push('stop-ws'),
    },
    healthEvaluator: {
      scanEnabledConfigs: async () => calls.push('scan-health'),
    },
  }
  const bootstrap = new RedundancyBootstrap({
    subsystemFactory: () => services,
    healthIntervalMs: 60 * 60 * 1000,
    cleanupIntervalMs: 60 * 60 * 1000,
  })
  return { bootstrap, calls, services }
}

test('Center 冗余配置和数据库使用各自的标准存储目录', () => {
  const centerExeDirectory = path.join(
    path.parse(process.cwd()).root,
    'opt',
    'KingFusion3.6_Center',
    'kingdevopscenter',
    'kingopsserver',
    'exe',
  )

  assert.deepStrictEqual(
    RedundancyBootstrap.resolveStoragePaths(centerExeDirectory),
    {
      configPath: path.join(
        centerExeDirectory,
        'data',
        'redundancy_manage.json',
      ),
      databasePath: path.join(
        path.parse(process.cwd()).root,
        'opt',
        'KingFusion3.6_Center',
        'env',
        'db',
        'redundancy.db',
      ),
    },
  )
})

test('冗余批量 APP 指令开关默认关闭且只接受字符串 true', () => {
  assert.strictEqual(RedundancyBootstrap.readBatchAppCommandsEnabled({}), false)
  assert.strictEqual(
    RedundancyBootstrap.readBatchAppCommandsEnabled({ KF_REDUNDANCY_BATCH_APP_COMMANDS: 'false' }),
    false,
  )
  assert.strictEqual(
    RedundancyBootstrap.readBatchAppCommandsEnabled({ KF_REDUNDANCY_BATCH_APP_COMMANDS: 'true' }),
    true,
  )
})

test('Center 启动引导按配置校验、任务恢复、WS、健康扫描顺序启动', async () => {
  const fixture = createFixture()

  try {
    const result = fixture.bootstrap.start({
      httpServer: { id: 'shared-http-server' },
    })
    await new Promise((resolve) => setImmediate(resolve))

    assert.strictEqual(result, fixture.services)
    assert.strictEqual(getSubsystem(), fixture.services)
    assert.deepStrictEqual(fixture.calls.slice(0, 5), [
      'validate-config',
      'interrupt-tasks',
      'start-ws:shared-http-server',
      'scan-health',
      'cleanup',
    ])
  } finally {
    fixture.bootstrap.stop()
  }
})

test('Center 停止引导关闭冗余资源但不关闭共享 HTTP Server', () => {
  const fixture = createFixture()

  fixture.bootstrap.start({ httpServer: { id: 'shared-http-server' } })
  fixture.bootstrap.stop()

  assert.strictEqual(getSubsystem(), null)
  assert.strictEqual(fixture.calls.includes('stop-ws'), true)
  assert.strictEqual(fixture.calls.includes('close-database'), true)
  assert.strictEqual(fixture.calls.includes('close-http-server'), false)
})
// end
