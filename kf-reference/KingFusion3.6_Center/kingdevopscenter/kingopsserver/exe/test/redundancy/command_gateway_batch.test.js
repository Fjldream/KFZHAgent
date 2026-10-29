// modified by jinlong.feng at 20260909 冗余功能-批量启停功能完善
'use strict'

const assert = require('assert')
const { test } = require('./helpers/test_runner')
const { CommandGateway } = require('../../lib/services/redundancy/command_gateway')

test('批量网关对一个 APP 阶段只入队一次并按输入顺序观察真实状态', async () => {
  let enqueued = 0
  const progress = []
  const adapter = {
    enqueueBatch: async () => { enqueued += 1; return { commandId: 'batch-1' } },
    getCommandStatus: async () => ({
      status: 'SUCCEEDED',
      results: [
        { appId: 'b', status: 'SUCCEEDED', message: 'ok' },
        { appId: 'a', status: 'SUCCEEDED', message: 'ok' },
      ],
    }),
    getAppState: async () => ({ running: true }),
  }
  const gateway = new CommandGateway({ adapter, batchEnabled: true, pollIntervalMs: 1 })
  const output = await gateway.executeManyAndObserve({
    nodeId: 'node-1', appIds: ['a', 'b'], action: 'START', metadata: {},
    onProgress: (event) => progress.push(event),
  })

  assert.strictEqual(enqueued, 1)
  assert.strictEqual(output.mode, 'BATCH')
  assert.deepStrictEqual(output.results.map((item) => item.appId), ['a', 'b'])
  assert.ok(output.results.every((item) => item.commandStatus === 'SUCCEEDED'))
  assert.ok(output.results.every((item) => item.observedStatus === 'RUNNING'))
  assert.ok(progress.some((event) => event.phase === 'COMMAND_RESULT'))
  assert.ok(progress.some((event) => event.phase === 'OBSERVED_RESULT'))
})

test('批量网关保留明确失败并把缺失子结果标记为 UNKNOWN', async () => {
  const adapter = {
    enqueueBatch: async () => ({ commandId: 'batch-2' }),
    getCommandStatus: async () => ({
      status: 'FAILED',
      results: [{ appId: 'a', status: 'FAILED', message: 'pm2 failed' }],
    }),
    getAppState: async () => ({ running: false }),
  }
  const gateway = new CommandGateway({ adapter, batchEnabled: true })
  const output = await gateway.executeManyAndObserve({
    nodeId: 'node-1', appIds: ['a', 'b'], action: 'START', metadata: {},
  })

  assert.deepStrictEqual(output.results.map((item) => item.commandStatus), ['FAILED', 'UNKNOWN'])
  assert.strictEqual(output.results[0].message, 'pm2 failed')
})

test('批量开关关闭时复用单 APP 网关并返回统一结果结构', async () => {
  const gateway = new CommandGateway({ adapter: {}, batchEnabled: false })
  const calls = []
  gateway.executeAndObserve = async (input) => {
    calls.push(input.appId)
    return { commandId: `cmd-${input.appId}`, commandStatus: 'SUCCEEDED', observedStatus: 'STOPPED' }
  }
  const output = await gateway.executeManyAndObserve({
    nodeId: 'node-1', appIds: ['a', 'b'], action: 'STOP', metadata: {},
  })
  assert.deepStrictEqual(calls, ['a', 'b'])
  assert.strictEqual(output.mode, 'SEQUENTIAL')
  assert.deepStrictEqual(output.results.map((item) => item.appId), ['a', 'b'])
})

test('旧代理未返回批量子结果时立即降级为单 APP 指令', async () => {
  const gateway = new CommandGateway({
    adapter: {
      enqueueBatch: async () => ({ commandId: 'legacy-batch' }),
      getCommandStatus: async () => ({ status: 'SUCCEEDED', results: [] }),
    },
    batchEnabled: true,
  })
  const calls = []
  gateway.executeAndObserve = async (input) => {
    calls.push(input.appId)
    return { commandId: `single-${input.appId}`, observedStatus: 'STOPPED' }
  }

  const output = await gateway.executeManyAndObserve({
    nodeId: 'node-old', appIds: ['a', 'b'], action: 'STOP', metadata: {},
  })
  assert.deepStrictEqual(calls, ['a', 'b'])
  assert.strictEqual(output.mode, 'SEQUENTIAL_FALLBACK')
})
// end
