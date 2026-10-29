// modified by jinlong.feng at 0901 冗余功能开发
'use strict'

const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { test } = require('./helpers/test_runner')
const { CacheManager } = require('../../lib/services/redundancy/cache_manager')
const { CommandGuard } = require('../../lib/services/redundancy/command_guard')

/** @returns {string} 独立测试目录。 */
function createTempDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kf-node-redundancy-'))
}

test('节点运行态缓存使用原子文件写入并可完整读回', () => {
  const directory = createTempDirectory()
  const cachePath = path.join(directory, 'runtime.json')
  const manager = new CacheManager({ filePath: cachePath })
  const runtime = {
    redundancyId: 'redundancy-1',
    enabled: true,
    role: 'INACTIVE',
    revision: 8,
    appIds: ['app-1'],
    desiredStates: { 'app-1': 'STOPPED' },
  }

  manager.write(runtime)

  assert.deepStrictEqual(manager.read(), runtime)
  assert.strictEqual(fs.existsSync(`${cachePath}.tmp`), false)
})

test('损坏的节点运行态缓存明确报错且不会被当作未受管节点', () => {
  const directory = createTempDirectory()
  const cachePath = path.join(directory, 'runtime.json')
  fs.writeFileSync(cachePath, '{invalid json', 'utf8')
  const manager = new CacheManager({ filePath: cachePath })

  assert.throws(
    () => manager.read(),
    (error) => error.code === 'REDUNDANCY_CACHE_INVALID',
  )
})

test('激活节点受管 APP 只禁止删除，停止和重启允许', () => {
  const guard = new CommandGuard({
    runtimeProvider: () => ({
      enabled: true,
      role: 'ACTIVE',
      revision: 8,
      appIds: ['app-1'],
    }),
  })

  assert.doesNotThrow(() => guard.assertCommand({ appId: 'app-1', action: 'STOP' }))
  assert.doesNotThrow(() => guard.assertCommand({ appId: 'app-1', action: 'RESTART' }))
  assert.throws(
    () => guard.assertCommand({ appId: 'app-1', action: 'DELETE' }),
    (error) => error.code === 'REDUNDANCY_ACTIVE_APP_DELETE_FORBIDDEN',
  )
})

test('失活节点受管 APP 禁止启动和重启，但停止和删除允许', () => {
  const guard = new CommandGuard({
    runtimeProvider: () => ({
      enabled: true,
      role: 'INACTIVE',
      revision: 8,
      appIds: ['app-2'],
    }),
  })

  for (const action of ['START', 'RESTART']) {
    assert.throws(
      () => guard.assertCommand({ appId: 'app-2', action }),
      (error) => error.code === `REDUNDANCY_INACTIVE_APP_${action}_FORBIDDEN`,
    )
  }
  assert.doesNotThrow(() => guard.assertCommand({ appId: 'app-2', action: 'STOP' }))
  assert.doesNotThrow(() => guard.assertCommand({ appId: 'app-2', action: 'DELETE' }))
})

test('内部冗余命令 revision 过期时拒绝，未受管 APP 不限制', () => {
  const guard = new CommandGuard({
    runtimeProvider: () => ({
      enabled: true,
      role: 'ACTIVE',
      revision: 8,
      appIds: ['app-1'],
    }),
  })

  assert.throws(
    () =>
      guard.assertCommand({
        appId: 'app-1',
        action: 'START',
        internalRedundancy: true,
        revision: 7,
      }),
    (error) => error.code === 'REDUNDANCY_REVISION_STALE',
  )
  assert.doesNotThrow(() =>
    guard.assertCommand({ appId: 'ordinary-app', action: 'START', revision: 1 }),
  )
})
// end
