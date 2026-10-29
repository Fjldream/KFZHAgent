// modified by jinlong.feng at 20260909 冗余功能-批量启停功能完善
'use strict'

const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { test } = require('./helpers/test_runner')
const { LegacyCommandAdapter } = require('../../lib/services/redundancy/legacy_command_adapter')

class FakeBatchCommand {
  constructor() {
    this.cmdId = 'batch-1'
  }
  setAppId(value) { this.appId = value }
  setUser(value) { this.user = value }
  setTenantId(value) { this.tenantId = value }
  getCmdId() { return this.cmdId }
}

test('中心适配器一次入队冗余批量启停命令并保留元数据', () => {
  const calls = []
  const adapter = new LegacyCommandAdapter({
    commandClasses: { batchStartCommand: FakeBatchCommand, batchStopCommand: FakeBatchCommand },
    commandExecutor: {
      AppBatchStart: (nodeId, command) => calls.push({ action: 'START', nodeId, command }),
      AppBatchStop: (nodeId, command) => calls.push({ action: 'STOP', nodeId, command }),
    },
    commandResults: {},
    appProvider: {},
    commandStatusEnum: {},
  })

  const queued = adapter.enqueueBatch({
    nodeId: 'node-1',
    appIds: ['a', 'b'],
    action: 'START',
    metadata: { tenantId: 'tenant-1', operator: 'admin', redundancyId: 'r-1', revision: 9 },
  })

  assert.deepStrictEqual(queued, { commandId: 'batch-1' })
  assert.strictEqual(calls.length, 1)
  assert.deepStrictEqual(calls[0].command.appId, ['a', 'b'])
  assert.strictEqual(calls[0].command.internalRedundancy, true)
  assert.strictEqual(calls[0].command.revision, 9)
})

test('中心适配器返回批量命令整体状态和有序子结果', () => {
  const result = {
    getStatus: () => 3,
    getMessage: () => 'batch failed',
    getResult: () => [
      { appId: 'a', cmdStatus: 2, message: 'succeed' },
      { appId: 'b', cmdStatus: 3, message: 'pm2 failed' },
    ],
  }
  const adapter = new LegacyCommandAdapter({
    commandClasses: {},
    commandExecutor: {},
    commandResults: { getCommandResult: () => result },
    appProvider: {},
    commandStatusEnum: {
      NODE_DEPLOYCOMMAND_STATUS_SUCCEEDED: 2,
      NODE_DEPLOYCOMMAND_STATUS_FAILED: 3,
    },
  })

  assert.deepStrictEqual(adapter.getCommandStatus('batch-1'), {
    status: 'FAILED',
    message: 'batch failed',
    results: [
      { appId: 'a', status: 'SUCCEEDED', message: 'succeed' },
      { appId: 'b', status: 'FAILED', message: 'pm2 failed' },
    ],
  })
})

test('中心批量命令队列使用 BatchCommandResult 且按 nodeId 入队', () => {
  const commandRoot = path.resolve(__dirname, '../../lib/services/commands')
  const queueSource = fs.readFileSync(path.join(commandRoot, 'AppCommands.js'), 'utf8')
  const executorSource = fs.readFileSync(path.join(commandRoot, 'commandExe.js'), 'utf8')
  assert.match(queueSource, /BatchCommandResult/)
  assert.match(
    executorSource,
    /AppBatchStart\s*\(d,\s*a\)\s*\{\s*AppCommands\.addCommand\(d,\s*a\)\s*\}/,
  )
  assert.match(
    executorSource,
    /AppBatchStop\s*\(d,\s*a\)\s*\{\s*AppCommands\.addCommand\(d,\s*a\)\s*\}/,
  )
})
// end
