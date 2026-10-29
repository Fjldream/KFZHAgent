// modified by jinlong.feng at 0901 冗余功能开发
'use strict'

const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')

const { test } = require('./helpers/test_runner')
const { AtomicJsonStore } = require('../../lib/services/redundancy/atomic_json_store')
const { ConfigRepository } = require('../../lib/services/redundancy/config_repository')
const { ConfigService } = require('../../lib/services/redundancy/config_service')

const FIXED_TIME = '2026-09-01T09:00:00.000Z'

/**
 * 创建配置服务测试夹具，每个测试使用独立临时目录。
 *
 * @returns {{service: ConfigService, repository: ConfigRepository, filePath: string}} 测试夹具。
 */
function createFixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kf-redundancy-config-'))
  const filePath = path.join(directory, 'redundancy_manage.json')
  const store = new AtomicJsonStore({ filePath })
  const repository = new ConfigRepository({ store, clock: () => FIXED_TIME })
  const nodes = new Map([
    ['node-1', { nodeId: 'node-1', nodeName: '主节点', tenantId: 'tenant-1' }],
    ['node-2', { nodeId: 'node-2', nodeName: '从节点', tenantId: 'tenant-1' }],
    ['node-3', { nodeId: 'node-3', nodeName: '第三节点', tenantId: 'tenant-1' }]
  ])
  const apps = new Map([
    ['app-1', { appId: 'app-1', nodeId: 'node-1', tenantId: 'tenant-1' }],
    ['app-2', { appId: 'app-2', nodeId: 'node-1', tenantId: 'tenant-1' }],
    ['app-3', { appId: 'app-3', nodeId: 'node-2', tenantId: 'tenant-1' }],
    // modified by jinlong.feng at 2026-10-09 冗余APP列表每侧至少一个
    // node-3 需要一个 APP，供「节点被占用」用例构造两侧都非空的冲突配置。
    ['app-4', { appId: 'app-4', nodeId: 'node-3', tenantId: 'tenant-1' }]
    // end modified by jinlong.feng at 2026-10-09 冗余APP列表每侧至少一个
  ])
  const stateProvider = {
    getNode: (tenantId, nodeId) => {
      const node = nodes.get(nodeId)
      return node && node.tenantId === tenantId ? node : null
    },
    getApp: (tenantId, appId) => {
      const app = apps.get(appId)
      return app && app.tenantId === tenantId ? app : null
    },
    // modified by jinlong.feng at 2026-10-08 冗余提示显示APP名称
    getAppDisplayName: (tenantId, appId) => {
      const app = apps.get(appId)
      return (app && app.tenantId === tenantId && app.appName) || appId
    },
    // end modified by jinlong.feng at 2026-10-08 冗余提示显示APP名称
    listApps: (tenantId, nodeId) =>
      [...apps.values()].filter((app) => app.tenantId === tenantId && app.nodeId === nodeId)
  }
  const service = new ConfigService({
    repository,
    stateProvider,
    idFactory: () => 'redundancy-1',
    clock: () => FIXED_TIME
  })

  return { service, repository, filePath }
}

/**
 * 返回一份合法的新建配置输入。
 *
 * @param {object} [overrides] 需要覆盖的字段。
 * @returns {object} 新建配置输入。
 */
function validInput(overrides = {}) {
  return {
    name: '冗余配置 1',
    primaryNodeId: 'node-1',
    standbyNodeId: 'node-2',
    initialActiveNodeId: 'node-1',
    primaryAppIds: ['app-1', 'app-2'],
    standbyAppIds: ['app-3'],
    ...overrides
  }
}

test('新建配置固定产生未生效状态、空激活节点和 revision 1', async () => {
  const { service } = createFixture()
  const config = await service.createConfig('tenant-1', validInput(), 'admin001')

  assert.strictEqual(config.lifecycle, 'DISABLED')
  assert.strictEqual(config.activeNodeId, null)
  assert.strictEqual(config.revision, 1)
  assert.strictEqual(config.redundancyId, 'redundancy-1')
})

test('拒绝主节点和从节点相同', async () => {
  const { service } = createFixture()

  await assert.rejects(
    () => service.createConfig('tenant-1', validInput({ standbyNodeId: 'node-1' }), 'admin001'),
    (error) => error.code === 'REDUNDANCY_NODE_INVALID'
  )
})

test('拒绝不属于对应节点的 APP', async () => {
  const { service } = createFixture()

  await assert.rejects(
    () => service.createConfig('tenant-1', validInput({ primaryAppIds: ['app-3'] }), 'admin001'),
    (error) => error.code === 'REDUNDANCY_APP_INVALID'
  )
})

test('拒绝两侧 APP 列表出现重复 APP ID', async () => {
  const { service } = createFixture()

  await assert.rejects(
    () =>
      service.createConfig(
        'tenant-1',
        validInput({ primaryAppIds: ['app-1'], standbyAppIds: ['app-1'] }),
        'admin001'
      ),
    (error) => error.code === 'REDUNDANCY_APP_INVALID'
  )
})

test('拒绝首次激活节点不是配置中的主从节点', async () => {
  const { service } = createFixture()

  await assert.rejects(
    () =>
      service.createConfig('tenant-1', validInput({ initialActiveNodeId: 'node-3' }), 'admin001'),
    (error) => error.code === 'REDUNDANCY_INITIAL_ACTIVE_NODE_INVALID'
  )
})

test('拒绝节点被另一套未删除配置重复占用', async () => {
  const { service } = createFixture()
  await service.createConfig('tenant-1', validInput(), 'admin001')

  await assert.rejects(
    () =>
      service.createConfig(
        'tenant-1',
        validInput({
          name: '冗余配置 2',
          primaryNodeId: 'node-1',
          standbyNodeId: 'node-3',
          // modified by jinlong.feng at 2026-10-09 冗余APP列表每侧至少一个
          // 两侧都非空，避免先命中「APP 列表不能为空」而掩盖节点占用校验。
          standbyAppIds: ['app-4']
          // end modified by jinlong.feng at 2026-10-09 冗余APP列表每侧至少一个
        }),
        'admin001'
      ),
    (error) => error.code === 'REDUNDANCY_NODE_ALREADY_ASSIGNED'
  )
})

test('未生效配置编辑使用 revision 乐观锁且仅实际变化时递增', async () => {
  const { service } = createFixture()
  const created = await service.createConfig('tenant-1', validInput(), 'admin001')
  const unchanged = await service.updateInactiveConfig(
    'tenant-1',
    created.redundancyId,
    created.revision,
    validInput(),
    'admin001'
  )
  assert.strictEqual(unchanged.revision, 1)

  const updated = await service.updateInactiveConfig(
    'tenant-1',
    created.redundancyId,
    unchanged.revision,
    validInput({ name: '新名称' }),
    'admin001'
  )
  assert.strictEqual(updated.revision, 2)

  await assert.rejects(
    () =>
      service.updateInactiveConfig(
        'tenant-1',
        created.redundancyId,
        1,
        validInput({ name: '过期修改' }),
        'admin001'
      ),
    (error) => error.code === 'REDUNDANCY_REVISION_CONFLICT'
  )
})

test('删除未生效配置后释放节点占用', async () => {
  const { service } = createFixture()
  const created = await service.createConfig('tenant-1', validInput(), 'admin001')

  await service.deleteConfig('tenant-1', created.redundancyId, created.revision)
  const recreated = await service.createConfig('tenant-1', validInput(), 'admin001')

  assert.strictEqual(recreated.primaryNodeId, 'node-1')
})

test('候选 APP 返回节点下完整列表并标识当前已选项', async () => {
  const { service } = createFixture()
  const created = await service.createConfig('tenant-1', validInput(), 'admin001')

  const candidates = await service.getAppCandidates(
    'tenant-1',
    'node-1',
    created.redundancyId
  )

  assert.deepStrictEqual(
    candidates.map((candidate) => ({ appId: candidate.appId, selected: candidate.selected })),
    [
      { appId: 'app-1', selected: true },
      { appId: 'app-2', selected: true }
    ]
  )
})

test('原子替换失败时保留原文件且内容仍可解析', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kf-redundancy-atomic-'))
  const filePath = path.join(directory, 'redundancy_manage.json')
  const normalStore = new AtomicJsonStore({ filePath })
  normalStore.write({ schemaVersion: 1, updatedAt: FIXED_TIME, configs: [{ revision: 1 }] })

  const failingFileSystem = new Proxy(fs, {
    get(target, property) {
      if (property === 'renameSync') {
        return (sourcePath, targetPath) => {
          if (targetPath === filePath) {
            throw new Error('simulated replace failure')
          }
          return target.renameSync(sourcePath, targetPath)
        }
      }
      return target[property]
    }
  })
  const failingStore = new AtomicJsonStore({ filePath, fileSystem: failingFileSystem })

  assert.throws(
    () =>
      failingStore.write({
        schemaVersion: 1,
        updatedAt: FIXED_TIME,
        configs: [{ revision: 2 }]
      }),
    /simulated replace failure/
  )
  assert.strictEqual(JSON.parse(fs.readFileSync(filePath, 'utf8')).configs[0].revision, 1)
})

// modified by jinlong.feng at 2026-10-09 冗余配置名称重名校验
test('拒绝空名称', async () => {
  const { service } = createFixture()

  await assert.rejects(
    () => service.createConfig('tenant-1', validInput({ name: '   ' }), 'admin001'),
    (error) => error.code === 'REDUNDANCY_CONFIG_NAME_INVALID'
  )
})

test('拒绝同租户同名配置，提示带名称且比较前先去除首尾空格', async () => {
  const { service } = createFixture()
  await service.createConfig('tenant-1', validInput(), 'admin001')

  await assert.rejects(
    () =>
      service.createConfig(
        'tenant-1',
        validInput({ name: ' 冗余配置 1 ' }),
        'admin001'
      ),
    (error) =>
      error.code === 'REDUNDANCY_CONFIG_NAME_DUPLICATED' &&
      error.message === '已存在同名冗余配置「冗余配置 1」' &&
      error.details.conflictRedundancyId === 'redundancy-1'
  )
})

test('编辑时排除自身名称，改成其他配置的名称被拒绝', async () => {
  const { service, repository } = createFixture()
  const created = await service.createConfig('tenant-1', validInput(), 'admin001')
  repository.create({
    redundancyId: 'redundancy-2',
    tenantId: 'tenant-1',
    name: '冗余配置 2',
    lifecycle: 'DISABLED',
    revision: 1,
    primaryNodeId: 'node-3',
    standbyNodeId: 'node-1',
    initialActiveNodeId: 'node-1',
    primaryAppIds: [],
    standbyAppIds: []
  })

  await service.validateAndNormalizeInput(
    'tenant-1',
    validInput(),
    created.redundancyId
  )

  await assert.rejects(
    () =>
      service.validateAndNormalizeInput(
        'tenant-1',
        validInput({ name: '冗余配置 2' }),
        created.redundancyId
      ),
    (error) => error.code === 'REDUNDANCY_CONFIG_NAME_DUPLICATED'
  )
})

test('删除配置后名称可复用', async () => {
  const { service } = createFixture()
  const created = await service.createConfig('tenant-1', validInput(), 'admin001')

  await service.deleteConfig('tenant-1', created.redundancyId, created.revision)
  const recreated = await service.createConfig('tenant-1', validInput(), 'admin001')

  assert.strictEqual(recreated.name, '冗余配置 1')
})

test('存储层兜底拒绝同名写入，不同租户可使用相同名称', () => {
  const { repository } = createFixture()
  const base = {
    lifecycle: 'DISABLED',
    revision: 1,
    primaryNodeId: 'node-1',
    standbyNodeId: 'node-2',
    initialActiveNodeId: 'node-1',
    primaryAppIds: [],
    standbyAppIds: []
  }
  repository.create({ ...base, redundancyId: 'redundancy-a', tenantId: 'tenant-1', name: '冗余配置 1' })

  assert.throws(
    () =>
      repository.create({
        ...base,
        redundancyId: 'redundancy-b',
        tenantId: 'tenant-1',
        name: '冗余配置 1'
      }),
    (error) => error.code === 'REDUNDANCY_CONFIG_NAME_DUPLICATED'
  )
  assert.doesNotThrow(() =>
    repository.create({
      ...base,
      redundancyId: 'redundancy-c',
      tenantId: 'tenant-2',
      name: '冗余配置 1'
    })
  )
})
// end modified by jinlong.feng at 2026-10-09 冗余配置名称重名校验

// modified by jinlong.feng at 2026-10-09 冗余APP列表每侧至少一个
test('新建配置时两侧都必须至少选择一个 APP', async () => {
  const { service } = createFixture()

  await assert.rejects(
    () => service.createConfig('tenant-1', validInput({ primaryAppIds: [] }), 'admin001'),
    (error) =>
      error.code === 'REDUNDANCY_APP_LIST_EMPTY' &&
      error.message === '节点「主节点」的冗余 APP 列表不能为空，请至少保留一个 APP'
  )
  await assert.rejects(
    () => service.createConfig('tenant-1', validInput({ standbyAppIds: [] }), 'admin001'),
    (error) =>
      error.code === 'REDUNDANCY_APP_LIST_EMPTY' && error.details.nodeId === 'node-2'
  )
})

test('编辑未生效配置时清空某一侧被拒绝且原配置不变', async () => {
  const { service, repository } = createFixture()
  const created = await service.createConfig('tenant-1', validInput(), 'admin001')

  await assert.rejects(
    () =>
      service.updateInactiveConfig(
        'tenant-1',
        created.redundancyId,
        created.revision,
        validInput({ primaryAppIds: [] }),
        'admin001'
      ),
    (error) => error.code === 'REDUNDANCY_APP_LIST_EMPTY'
  )

  const unchanged = repository.findById('tenant-1', created.redundancyId)
  assert.deepStrictEqual(unchanged.primaryAppIds, ['app-1', 'app-2'])
  assert.strictEqual(unchanged.revision, created.revision)
})

test('两侧各保留一个 APP 时正常通过', async () => {
  const { service } = createFixture()
  const config = await service.createConfig(
    'tenant-1',
    validInput({ primaryAppIds: ['app-1'], standbyAppIds: ['app-3'] }),
    'admin001'
  )

  assert.deepStrictEqual(config.primaryAppIds, ['app-1'])
  assert.deepStrictEqual(config.standbyAppIds, ['app-3'])
})
// end modified by jinlong.feng at 2026-10-09 冗余APP列表每侧至少一个
// end
