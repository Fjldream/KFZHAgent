// modified by jinlong.feng at 20260909 冗余功能-批量启停功能完善
'use strict'

const assert = require('assert')
const fs = require('fs')
const path = require('path')
const vm = require('vm')
const { test } = require('./helpers/test_runner')

const commandRoot = path.resolve(__dirname, '../../lib/services/commands')

function loadCommandExecutor({ appControl = {}, getAppInfo, pm2Describe } = {}) {
  const source = fs.readFileSync(path.join(commandRoot, 'commandExe.js'), 'utf8')
  const module = { exports: {} }
  const agentRoot = '/virtual-agent'
  const profiles = {
    docker: { active: false },
    usePm2: true,
    opsProxy: '127.0.0.1',
  }
  const requireStub = (request) => {
    if (request === 'os') return require('os')
    if (request === `${agentRoot}/lib/services/app/app_mng`) return {}
    if (request === `${agentRoot}/lib/services/profiles/profiles_manage`) {
      return { getGlobalCache: () => profiles }
    }
    if (request === './AppCommands' || request === './APPCommandResults') return {}
    if (request === `${agentRoot}/lib/services/node/node_auth`) return {}
    if (request === './AppControlExPm2') return class AppControlStub {}
    if (request === `${agentRoot}/lib/services/deploy/pm2Delegate`) {
      return {
        getPM2Instance: () => ({
          pm2Describe: pm2Describe || (async () => []),
        }),
      }
    }
    if (request === `${agentRoot}/lib/services/common/public`) return {}
    if (request === `${agentRoot}/core/util`) {
      return { format: { _parseCmdResultToLog: () => '' } }
    }
    if (request === `${agentRoot}/lib/services/redundancy`) {
      return { getNodeRedundancy: () => null }
    }
    throw new Error(`commandExe 仍依赖外部批量执行器: ${request}`)
  }
  const context = vm.createContext({
    module,
    exports: module.exports,
    require: requireStub,
    __dir: agentRoot,
    setTimeout,
    clearTimeout,
    console,
  })
  new vm.Script(source, { filename: 'commandExe.js' }).runInContext(context)
  const CommandExe = module.exports
  const executor = new CommandExe()
  executor.AppControl = appControl
  if (getAppInfo) executor._getAppInfoByID = getAppInfo
  return executor
}

function loadPm2AppControl({ appInfoById = {}, pm2Describe } = {}) {
  const source = fs.readFileSync(path.join(commandRoot, 'AppControlExPm2.js'), 'utf8')
  const module = { exports: {} }
  const agentRoot = '/virtual-agent'
  const EmptyDependency = class {}
  const appMng = {
    getAppBaseInfo: async ({ appId }, callback) => {
      const appInfo = appInfoById[appId]
      callback(!appInfo, appInfo || {})
    },
  }
  const requireStub = (request) => {
    if (
      [
        `${agentRoot}/lib/services/image/image_mng`,
        `${agentRoot}/lib/services/image/image_download`,
        `${agentRoot}/lib/services/exec/exec_mng`,
        `${agentRoot}/lib/services/exec/exec_download`,
        `${agentRoot}/lib/services/project/project_mng`,
        `${agentRoot}/lib/services/project/project_download`,
      ].includes(request)
    ) {
      return EmptyDependency
    }
    if (request === `${agentRoot}/lib/services/app/app_mng`) return appMng
    if (request === `${agentRoot}/lib/services/profiles/profiles_manage`) {
      return { getGlobalCache: () => ({}) }
    }
    if (request === `${agentRoot}/lib/services/deploy/pm2Delegate`) {
      return {
        getPM2Instance: () => ({
          pm2Describe: pm2Describe || (async () => []),
        }),
      }
    }
    if (request === 'os') return require('os')
    if (request === 'child_process') return require('child_process')
    if (request === 'path') return require('path')
    if (request === 'fs') return require('fs')
    if (request === 'net') return require('net')
    if (request === `${agentRoot}/lib/services/common/public`) {
      return {
        enumProjectType: { PROJECT_DBCONNECTOR: 3 },
        enumAppStatus: { APP_RUNNING: 'running', APP_STOPPED: 0 },
      }
    }
    if (request === `${agentRoot}/core/util`) {
      return { util: {}, fileHandler: {}, format: {} }
    }
    if (request === `${agentRoot}/lib/services/common/address_mng.js`) return {}
    // modified by jinlong.feng at 2026-10-09 冗余功能-批量启停实现补入
    // 现场版本（含节点授权改造）额外依赖 node_auth，桩里补齐；不影响批量逻辑本身。
    if (request === `${agentRoot}/lib/services/node/node_auth.js`) {
      return { updateSyncInfo: async () => ({ errorCode: 0 }) }
    }
    // end modified by jinlong.feng at 2026-10-09 冗余功能-批量启停实现补入
    throw new Error(`AppControlExPm2 出现未声明的测试依赖: ${request}`)
  }
  const context = vm.createContext({
    module,
    exports: module.exports,
    require: requireStub,
    __dir: agentRoot,
    setTimeout,
    clearTimeout,
    console,
    logger: { info: () => {}, error: () => {} },
    loggerPm2: { info: () => {}, error: () => {} },
  })
  new vm.Script(source, { filename: 'AppControlExPm2.js' }).runInContext(context)
  return new module.exports()
}

function createAction(delays, failedId) {
  let active = 0
  let maxActive = 0
  const executed = []
  return {
    action: async (appId) => {
      active += 1
      maxActive = Math.max(maxActive, active)
      executed.push(appId)
      await new Promise((resolve) => setTimeout(resolve, delays[appId] || 1))
      active -= 1
      if (appId === failedId) throw new Error('pm2 start failed')
      return { cmdStatus: 2, message: 'succeed' }
    },
    getMaxActive: () => maxActive,
    getExecuted: () => executed,
  }
}

test('commandExe 仅将批量启停委托给当前 AppControl', async () => {
  const calls = []
  const executor = loadCommandExecutor({
    appControl: {
      AppBatchStart: async (appIds) => {
        calls.push(['start', ...appIds])
        return appIds.map((appId) => ({ appId, cmdStatus: 2, message: 'succeed' }))
      },
      AppBatchStop: async (appIds) => {
        calls.push(['stop', ...appIds])
        return appIds.map((appId) => ({ appId, cmdStatus: 2, message: 'succeed' }))
      },
    },
  })

  const startOutput = await executor.AppBatchStart({ appId: ['app-1', 'app-2'] })
  const stopOutput = await executor.AppBatchStop({ appId: ['app-3'] })

  assert.deepStrictEqual(calls, [
    ['start', 'app-1', 'app-2'],
    ['stop', 'app-3'],
  ])
  assert.deepStrictEqual(
    Array.from(startOutput.cmdResults, (item) => item.appId),
    ['app-1', 'app-2'],
  )
  assert.strictEqual(stopOutput.cmdResults[0].appId, 'app-3')
})

test('PM2 控制器批量执行限制并发、保留顺序且隔离单项失败', async () => {
  const executor = loadPm2AppControl()
  const ids = ['app-1', 'app-2', 'app-3', 'app-4', 'app-5', 'app-6']
  const fixture = createAction({ 'app-1': 20, 'app-2': 3, 'app-3': 10 }, 'app-3')
  const results = await executor._executeBatchAppAction(ids, fixture.action, {
    concurrency: 4,
  })

  assert.deepStrictEqual(
    Array.from(results, (item) => item.appId),
    ids,
  )
  assert.ok(fixture.getMaxActive() <= 4)
  assert.deepStrictEqual(JSON.parse(JSON.stringify(results[2])), {
    appId: 'app-3',
    cmdStatus: 3,
    message: 'pm2 start failed',
  })
  assert.deepStrictEqual(new Set(fixture.getExecuted()), new Set(ids))
})

test('PM2 控制器批量停止采用 8 并发且空列表直接返回', async () => {
  const fixture = createAction({}, null)
  const executor = loadPm2AppControl()
  executor.AppStop = fixture.action
  const ids = Array.from({ length: 12 }, (_, index) => `app-${index + 1}`)
  const output = await executor.AppBatchStop(ids)

  assert.strictEqual(output.length, ids.length)
  assert.ok(fixture.getMaxActive() <= 8)
  assert.ok(fixture.getMaxActive() > 4)
  assert.strictEqual((await executor._executeBatchAppAction([], fixture.action)).length, 0)
})

test('PM2 控制器批量执行规范化字符串异常和失败结果', async () => {
  const executor = loadPm2AppControl()
  const results = await executor._executeBatchAppAction(['a', 'b'], async (appId) => {
    if (appId === 'a') throw 'start failed'
    return { cmdStatus: 3 }
  })

  assert.deepStrictEqual(JSON.parse(JSON.stringify(results)), [
    { appId: 'a', cmdStatus: 3, message: 'start failed' },
    { appId: 'b', cmdStatus: 3, message: 'APP operation failed' },
  ])
})

test('PM2 控制器数据源阶段识别和在线等待保持可独立验证', async () => {
  const executor = loadPm2AppControl()
  assert.strictEqual(executor._getAppStartStage({ projectType: 3 }), 0)
  assert.strictEqual(executor._getAppStartStage({ projectType: '3' }), 0)
  assert.strictEqual(executor._getAppStartStage({ projectType: 0 }), 1)

  let checks = 0
  assert.strictEqual(
    await executor._waitForAppOnline(
      async () => {
        checks += 1
        return checks === 3
      },
      { timeoutMs: 100, intervalMs: 0 },
    ),
    true,
  )
  assert.strictEqual(checks, 3)
  assert.strictEqual(
    await executor._waitForAppOnline(async () => false, {
      timeoutMs: 0,
      intervalMs: 0,
    }),
    false,
  )
})

test('PM2 控制器批量启动按工程类型分阶段执行并确认 online', async () => {
  const events = []
  const executor = loadPm2AppControl({
    appInfoById: {
      'normal-1': { appId: 'normal-1', appName: 'normal-1', projectType: 1 },
      'datasource-1': {
        appId: 'datasource-1',
        appName: 'datasource-1',
        projectType: 3,
      },
    },
    pm2Describe: async (appName) => {
      events.push(`online:${appName}`)
      return [{ pm2_env: { status: 'online' } }]
    },
  })
  executor.AppStart = async (appId) => {
    events.push(`start:${appId}`)
    return { cmdStatus: 2, message: 'succeed' }
  }

  const output = await executor.AppBatchStart(['normal-1', 'datasource-1'])

  assert.deepStrictEqual(events, ['start:datasource-1', 'online:datasource-1', 'start:normal-1'])
  assert.deepStrictEqual(
    Array.from(output, (item) => item.appId),
    ['normal-1', 'datasource-1'],
  )
})

test('PM2 控制器批量停止复用单 APP 停止动作', async () => {
  const stopped = []
  const executor = loadPm2AppControl()
  executor.AppStop = async (appId) => {
    stopped.push(appId)
    return { cmdStatus: 2, message: 'succeed' }
  }

  const output = await executor.AppBatchStop(['app-1', 'app-2'])

  assert.deepStrictEqual(new Set(stopped), new Set(['app-1', 'app-2']))
  assert.deepStrictEqual(
    Array.from(output, (item) => item.appId),
    ['app-1', 'app-2'],
  )
})

test('批量启动命令使用批量枚举且停止成功判断识别正确枚举', () => {
  const batchStart = fs.readFileSync(path.join(commandRoot, 'command/batchStartCommand.js'), 'utf8')
  const commandExe = fs.readFileSync(path.join(commandRoot, 'commandExe.js'), 'utf8')
  assert.match(batchStart, /NODE_DEPLOYCOMMAND_BATCHSTART/)
  assert.match(
    commandExe,
    /case publicFunc\.enumAppDeployCommandType\.APP_DEPLOYCOMMAND_BATCHSTOP:[\s\S]*?Array\.isArray\(p\.cmdResults\)/,
  )
})

test('冗余 Guard 拒绝批量命令时为每个 APP 返回失败子结果', () => {
  const source = fs.readFileSync(path.join(commandRoot, 'commandExe.js'), 'utf8')
  assert.match(source, /const cmdResults\s*=\s*appIds\.map\(\(appId\)\s*=>\s*\(\{/)
  assert.match(source, /appId,[\s\S]*?cmdStatus:\s*3/)
})
// end
