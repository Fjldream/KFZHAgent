// modified by jinlong.feng at 0901 冗余功能开发
'use strict'

const assert = require('assert')
const { EventEmitter } = require('events')
const { test } = require('./helpers/test_runner')
const { RedundancyWebSocketService } = require('../../lib/services/redundancy/ws_service')

/** WebSocketServer 测试替身。 */
class FakeWebSocketServer extends EventEmitter {
  constructor(options) {
    super()
    this.options = options
    this.clients = new Set()
    FakeWebSocketServer.lastInstance = this
  }

  close(callback) {
    if (callback) callback()
  }
}

/** WebSocket 客户端测试替身。 */
class FakeSocket extends EventEmitter {
  constructor() {
    super()
    this.readyState = 1
    this.messages = []
    this.closed = null
    this.terminated = false
    this.pingCount = 0
  }

  send(message) {
    this.messages.push(JSON.parse(message))
  }

  close(code, reason) {
    this.closed = { code, reason }
    this.readyState = 3
  }

  terminate() {
    this.terminated = true
    this.readyState = 3
  }

  ping() {
    this.pingCount += 1
  }
}

/** @returns {Promise<void>} 等待异步 connection handler 完成。 */
function flushPromises() {
  return new Promise((resolve) => setImmediate(resolve))
}

/**
 * 创建 WS 服务测试夹具。
 *
 * @param {object} [options] 覆盖选项。
 * @returns {object} 测试夹具。
 */
function createFixture(options = {}) {
  const service = new RedundancyWebSocketService({
    WebSocketServer: FakeWebSocketServer,
    authProvider: {
      authenticate: async (token) => {
        if (token === 'invalid') throw new Error('invalid token')
        // modified by jinlong.feng at 20260914 冗余功能-计算运行态订阅当前异常事件
        if (token === 'kc-global-token') {
          return {
            tenantId: '11111111-1111-1111-1111-111111111111',
            userId: 'kc-debugger',
          }
        }
        // end modified by jinlong.feng at 20260914 冗余功能-计算运行态订阅当前异常事件
        return { tenantId: token === 'tenant-2-token' ? 'tenant-2' : 'tenant-1', userId: 'user-1' }
      },
    },
    permissionService: {
      assert: async (oauthInfo) => {
        if (options.denyPermission || !oauthInfo) throw new Error('permission denied')
      },
    },
    snapshotProvider: async (tenantId) => ({
      tenantId,
      redundancies: [{ redundancyId: `${tenantId}-redundancy` }],
      openEvents: [],
    }),
    heartbeatIntervalMs: 0,
  })
  service.start({ id: 'http-server' })
  return { service, server: FakeWebSocketServer.lastInstance }
}

test('WS 无 token 或 token 无效时拒绝连接', async () => {
  const fixture = createFixture()
  const noToken = new FakeSocket()
  fixture.server.clients.add(noToken)
  fixture.server.emit('connection', noToken, { url: '/api/v1/redundancy-ws' })
  await flushPromises()

  const invalid = new FakeSocket()
  fixture.server.clients.add(invalid)
  fixture.server.emit('connection', invalid, {
    url: '/api/v1/redundancy-ws?access_token=invalid',
  })
  await flushPromises()

  assert.strictEqual(noToken.closed.code, 4401)
  assert.strictEqual(invalid.closed.code, 4401)
})

test('WS 无冗余查看权限时拒绝连接', async () => {
  const fixture = createFixture({ denyPermission: true })
  const socket = new FakeSocket()
  fixture.server.clients.add(socket)
  fixture.server.emit('connection', socket, {
    url: '/api/v1/redundancy-ws?access_token=tenant-1-token',
  })
  await flushPromises()

  assert.strictEqual(socket.closed.code, 4403)
})

test('WS 鉴权成功后的首帧是当前租户完整快照', async () => {
  const fixture = createFixture()
  const socket = new FakeSocket()
  fixture.server.clients.add(socket)
  fixture.server.emit('connection', socket, {
    url: '/api/v1/redundancy-ws?access_token=tenant-1-token',
  })
  await flushPromises()

  assert.strictEqual(socket.messages.length, 1)
  assert.strictEqual(socket.messages[0].type, 'REDUNDANCY_SNAPSHOT')
  assert.strictEqual(socket.messages[0].payload.tenantId, 'tenant-1')
})

// modified by jinlong.feng at 20260914 冗余功能-计算运行态订阅当前异常事件
test('全局租户 KC Token 可按请求中的固定工程租户订阅快照', async () => {
  const fixture = createFixture()
  const socket = new FakeSocket()
  fixture.server.clients.add(socket)
  fixture.server.emit('connection', socket, {
    url: '/api/v1/redundancy-ws?access_token=kc-global-token&tenantId=c7f1771f-0c8f-4c75-9d71-3b8c4b6bd190',
  })
  await flushPromises()

  assert.strictEqual(socket.messages.length, 1)
  assert.strictEqual(
    socket.messages[0].payload.tenantId,
    'c7f1771f-0c8f-4c75-9d71-3b8c4b6bd190',
  )
  assert.strictEqual(
    socket.redundancyContext.tenantId,
    'c7f1771f-0c8f-4c75-9d71-3b8c4b6bd190',
  )
})

test('普通租户 Token 不能通过查询参数改写订阅租户', async () => {
  const fixture = createFixture()
  const socket = new FakeSocket()
  fixture.server.clients.add(socket)
  fixture.server.emit('connection', socket, {
    url: '/api/v1/redundancy-ws?access_token=tenant-1-token&tenantId=tenant-2',
  })
  await flushPromises()

  assert.strictEqual(socket.messages.length, 1)
  assert.strictEqual(socket.messages[0].payload.tenantId, 'tenant-1')
  assert.strictEqual(socket.redundancyContext.tenantId, 'tenant-1')
})

test('全局租户 Token 不能订阅 KC 固定租户之外的数据', async () => {
  const fixture = createFixture()
  const socket = new FakeSocket()
  fixture.server.clients.add(socket)
  fixture.server.emit('connection', socket, {
    url: '/api/v1/redundancy-ws?access_token=kc-global-token&tenantId=tenant-2',
  })
  await flushPromises()

  assert.strictEqual(socket.messages.length, 1)
  assert.strictEqual(
    socket.messages[0].payload.tenantId,
    '11111111-1111-1111-1111-111111111111',
  )
  assert.strictEqual(
    socket.redundancyContext.tenantId,
    '11111111-1111-1111-1111-111111111111',
  )
})
// end modified by jinlong.feng at 20260914 冗余功能-计算运行态订阅当前异常事件

test('WS 增量消息按 tenantId 隔离', async () => {
  const fixture = createFixture()
  const tenant1Socket = new FakeSocket()
  const tenant2Socket = new FakeSocket()
  fixture.server.clients.add(tenant1Socket)
  fixture.server.clients.add(tenant2Socket)
  fixture.server.emit('connection', tenant1Socket, {
    url: '/api/v1/redundancy-ws?access_token=tenant-1-token',
  })
  fixture.server.emit('connection', tenant2Socket, {
    url: '/api/v1/redundancy-ws?access_token=tenant-2-token',
  })
  await flushPromises()
  tenant1Socket.messages.splice(0)
  tenant2Socket.messages.splice(0)

  fixture.service.publish('REDUNDANCY_STATUS_CHANGED', {
    tenantId: 'tenant-1',
    redundancyId: 'redundancy-1',
    healthStatus: 'ABNORMAL',
  })

  assert.strictEqual(tenant1Socket.messages.length, 1)
  assert.strictEqual(tenant2Socket.messages.length, 0)
})

test('相同冗余状态变化只广播一次', async () => {
  const fixture = createFixture()
  const socket = new FakeSocket()
  fixture.server.clients.add(socket)
  fixture.server.emit('connection', socket, {
    url: '/api/v1/redundancy-ws?access_token=tenant-1-token',
  })
  await flushPromises()
  socket.messages.splice(0)
  const payload = {
    tenantId: 'tenant-1',
    redundancyId: 'redundancy-1',
    healthStatus: 'ABNORMAL',
    reasons: [{ code: 'REDUNDANCY_NODE_OFFLINE' }],
  }

  fixture.service.publish('REDUNDANCY_STATUS_CHANGED', payload)
  fixture.service.publish('REDUNDANCY_STATUS_CHANGED', payload)

  assert.strictEqual(socket.messages.length, 1)
})

test('WS ping 后未收到 pong 的客户端在下一轮被终止', async () => {
  const fixture = createFixture()
  const socket = new FakeSocket()
  fixture.server.clients.add(socket)
  fixture.server.emit('connection', socket, {
    url: '/api/v1/redundancy-ws?access_token=tenant-1-token',
  })
  await flushPromises()

  fixture.service.heartbeatTick()
  assert.strictEqual(socket.pingCount, 1)
  fixture.service.heartbeatTick()
  assert.strictEqual(socket.terminated, true)
})

// modified by jinlong.feng at 20260914 冗余功能-计算运行态订阅当前异常事件
/** 计算运行态 WebSocket 测试替身。 */
class FakeCalculationRuntimeSocket extends EventEmitter {
  constructor(url) {
    super()
    this.url = url
    this.readyState = 0
    this.closed = false
    FakeCalculationRuntimeSocket.instances.push(this)
  }

  open() {
    this.readyState = 1
    this.emit('open')
  }

  receive(message) {
    this.emit('message', Buffer.from(JSON.stringify(message)))
  }

  close() {
    this.closed = true
    this.readyState = 3
    this.emit('close', 1000, Buffer.from(''))
  }

  disconnect(code = 1006) {
    this.readyState = 3
    this.emit('close', code, Buffer.from(''))
  }
}
FakeCalculationRuntimeSocket.instances = []

/**
 * 加载真实计算运行态全局函数，仅替换外部 WebSocket 连接。
 *
 * @returns {{restore: Function}} 测试清理器。
 */
function loadCalculationRuntimeGlobals(runtimeDirectoryOverride = null) {
  const Module = require('module')
  const path = require('path')
  const runtimeDirectory = runtimeDirectoryOverride || path.resolve(
    __dirname,
    '../../../../../../KingFusion3.6_Node/kingexedb/kingcalculation/exe',
  )
  const modulePath = path.join(runtimeDirectory, 'lib/init/globalFunc.js')
  const globalFunctionDirectory = path.join(runtimeDirectory, 'lib/service/globalFuncMng')
  const redundancyModulePath = path.join(
    runtimeDirectory,
    'lib/service/globalFuncMng/redundancy_global_func.js',
  )
  const originalLoad = Module._load
  const globalNames = [
    '__dir',
    'newInfo',
    'getToken',
    'logger',
    'SubscribeRedundancyMessage',
    'UnsubscribeRedundancyMessage',
  ]
  const previousGlobals = new Map(
    globalNames.map((name) => [
      name,
      Object.prototype.hasOwnProperty.call(global, name)
        ? { exists: true, value: global[name] }
        : { exists: false },
    ]),
  )

  global.__dir = runtimeDirectory
  global.newInfo = {
    kingGateWay: { host: 'https://192.168.3.32:443/api' },
  }
  global.getToken = () => 'calculation-runtime-token'
  global.logger = { log: () => {} }
  FakeCalculationRuntimeSocket.instances = []

  Module._load = function loadWithRuntimeSocket(request, parent, isMain) {
    if (request === 'ws' && parent && parent.filename === redundancyModulePath) {
      return FakeCalculationRuntimeSocket
    }
    if (
      request.startsWith(globalFunctionDirectory) &&
      request !== redundancyModulePath
    ) {
      return {}
    }
    return originalLoad.call(this, request, parent, isMain)
  }
  delete require.cache[require.resolve(modulePath)]
  try {
    require(modulePath)()
  } finally {
    Module._load = originalLoad
  }

  return {
    restore() {
      delete require.cache[require.resolve(modulePath)]
      if (require.cache[redundancyModulePath]) delete require.cache[redundancyModulePath]
      for (const [name, previous] of previousGlobals.entries()) {
        if (previous.exists) global[name] = previous.value
        else delete global[name]
      }
    },
  }
}

/** @param {object} overrides 覆盖字段。 @returns {object} 第三方公开事件夹具。 */
function publicRedundancyEvent(overrides) {
  return {
    eventId: null,
    redundancyId: null,
    redundancyName: null,
    status: null,
    eventType: null,
    severity: null,
    nodeName: null,
    appName: null,
    message: null,
    occurredAt: null,
    recoveredAt: null,
    ...overrides,
  }
}

test('计算运行态多个订阅复用一条运维中心冗余 WS 连接', () => {
  const runtime = loadCalculationRuntimeGlobals()
  try {
    const firstMessages = []
    const secondMessages = []
    const firstId = global.SubscribeRedundancyMessage((message) => firstMessages.push(message))

    assert.strictEqual(FakeCalculationRuntimeSocket.instances.length, 1)
    const socket = FakeCalculationRuntimeSocket.instances[0]
    assert.strictEqual(
      socket.url,
      'wss://192.168.3.32/opscenter/api/v1/redundancy-ws?access_token=calculation-runtime-token&tenantId=c7f1771f-0c8f-4c75-9d71-3b8c4b6bd190',
    )

    socket.open()
    socket.receive({
      type: 'REDUNDANCY_SNAPSHOT',
      payload: {
        tenantId: 'tenant-1',
        redundancies: [{ redundancyId: 'redundancy-1' }],
        openEvents: [
          { eventId: 'event-1', redundancyId: 'redundancy-1', status: 'OPEN' },
        ],
      },
      sentAt: '2026-09-14T00:00:00.000Z',
    })

    assert.deepStrictEqual(firstMessages, [
      {
        type: 'REDUNDANCY_EVENT_SNAPSHOT',
        payload: [
          publicRedundancyEvent({
            eventId: 'event-1',
            redundancyId: 'redundancy-1',
            status: 'OPEN',
          }),
        ],
        sentAt: '2026-09-14 08:00:00',
      },
    ])

    const secondId = global.SubscribeRedundancyMessage((message) => secondMessages.push(message))
    assert.strictEqual(FakeCalculationRuntimeSocket.instances.length, 1)
    assert.deepStrictEqual(secondMessages, firstMessages)
    assert.strictEqual(global.UnsubscribeRedundancyMessage(firstId), true)
    assert.strictEqual(socket.closed, false)
    assert.strictEqual(global.UnsubscribeRedundancyMessage(secondId), true)
    assert.strictEqual(socket.closed, true)
  } finally {
    runtime.restore()
  }
})

test('计算运行态接收恢复消息后不再向新订阅者回放该异常', () => {
  const runtime = loadCalculationRuntimeGlobals()
  try {
    const liveMessages = []
    const replayMessages = []
    const liveId = global.SubscribeRedundancyMessage((message) => liveMessages.push(message))
    const socket = FakeCalculationRuntimeSocket.instances[0]
    socket.open()
    socket.receive({
      type: 'REDUNDANCY_SNAPSHOT',
      payload: {
        openEvents: [
          { eventId: 'event-1', status: 'OPEN' },
          { eventId: 'event-2', status: 'OPEN' },
        ],
      },
      sentAt: '2026-09-14T00:00:00.000Z',
    })
    socket.receive({
      type: 'REDUNDANCY_EVENT_CHANGED',
      payload: {
        eventId: 'event-1',
        status: 'RECOVERED',
        occurredAt: '2026-09-14T00:00:00.000Z',
        recoveredAt: '2026-09-14T00:01:00.000Z',
      },
      sentAt: '2026-09-14T00:01:00.000Z',
    })

    const replayId = global.SubscribeRedundancyMessage((message) => replayMessages.push(message))
    assert.deepStrictEqual(liveMessages[1], {
      type: 'REDUNDANCY_EVENT_CHANGED',
      payload: publicRedundancyEvent({
        eventId: 'event-1',
        status: 'RECOVERED',
        occurredAt: '2026-09-14 08:00:00',
        recoveredAt: '2026-09-14 08:01:00',
      }),
      sentAt: '2026-09-14 08:01:00',
    })
    assert.deepStrictEqual(replayMessages, [
      {
        type: 'REDUNDANCY_EVENT_SNAPSHOT',
        payload: [publicRedundancyEvent({ eventId: 'event-2', status: 'OPEN' })],
        sentAt: '2026-09-14 08:01:00',
      },
    ])
    global.UnsubscribeRedundancyMessage(liveId)
    global.UnsubscribeRedundancyMessage(replayId)
  } finally {
    runtime.restore()
  }
})

test('Center 正式运行态和开发态调试运行态均暴露冗余消息订阅函数', () => {
  const path = require('path')
  const runtimeDirectories = [
    path.resolve(__dirname, '../../../../../kingexedb/kingcalculation/exe'),
    path.resolve(
      __dirname,
      '../../../../kingcalculation/exe/solutions/project_demo/src',
    ),
  ]

  for (const runtimeDirectory of runtimeDirectories) {
    const runtime = loadCalculationRuntimeGlobals(runtimeDirectory)
    try {
      const subscriptionId = global.SubscribeRedundancyMessage(() => {})
      assert.strictEqual(typeof subscriptionId, 'string')
      assert.strictEqual(typeof global.UnsubscribeRedundancyMessage, 'function')
      assert.strictEqual(global.UnsubscribeRedundancyMessage(subscriptionId), true)
    } finally {
      runtime.restore()
    }
  }
})

test('计算运行态仅向第三方暴露稳定的冗余事件字段', () => {
  const runtime = loadCalculationRuntimeGlobals()
  try {
    const messages = []
    const subscriptionId = global.SubscribeRedundancyMessage((message) => messages.push(message))
    const socket = FakeCalculationRuntimeSocket.instances[0]
    socket.open()
    socket.receive({
      type: 'REDUNDANCY_SNAPSHOT',
      payload: {
        openEvents: [
          {
            eventId: 'event-public-1',
            redundancyId: 'redundancy-1',
            redundancyName: '双机冗余',
            tenantId: 'internal-tenant',
            reasonKey: 'internal-dedup-key',
            reasonCode: 'REDUNDANCY_NODE_OFFLINE',
            eventType: 'REDUNDANCY_NODE_OFFLINE',
            severity: 'ERROR',
            nodeId: 'internal-node-id',
            appId: 'internal-app-id',
            summary: '节点离线',
            detail: { nodeName: 'node-a', appName: 'app-a' },
            status: 'OPEN',
            occurredAt: '2026-09-14T00:00:00.000Z',
            openedAt: '2026-09-14T00:00:00.000Z',
            recoveredAt: null,
            acknowledgedBy: 'internal-user',
            acknowledgedAt: '2026-09-14T00:00:01.000Z',
          },
        ],
      },
      sentAt: '2026-09-14T00:00:02.000Z',
    })

    assert.deepStrictEqual(messages, [
      {
        type: 'REDUNDANCY_EVENT_SNAPSHOT',
        payload: [
          {
            eventId: 'event-public-1',
            redundancyId: 'redundancy-1',
            redundancyName: '双机冗余',
            status: 'OPEN',
            eventType: 'REDUNDANCY_NODE_OFFLINE',
            severity: 'ERROR',
            nodeName: 'node-a',
            appName: 'app-a',
            message: '节点离线',
            occurredAt: '2026-09-14 08:00:00',
            recoveredAt: null,
          },
        ],
        sentAt: '2026-09-14 08:00:02',
      },
    ])
    global.UnsubscribeRedundancyMessage(subscriptionId)
  } finally {
    runtime.restore()
  }
})

test('首帧快照到达前的异常变化先纳入当前异常集合再回调', () => {
  const runtime = loadCalculationRuntimeGlobals()
  try {
    const messages = []
    const subscriptionId = global.SubscribeRedundancyMessage((message) => messages.push(message))
    const socket = FakeCalculationRuntimeSocket.instances[0]
    socket.open()
    socket.receive({
      type: 'REDUNDANCY_EVENT_CHANGED',
      payload: { eventId: 'event-2', status: 'OPEN' },
      sentAt: '2026-09-14T00:01:00.000Z',
    })
    assert.strictEqual(messages.length, 0)

    socket.receive({
      type: 'REDUNDANCY_SNAPSHOT',
      payload: {
        openEvents: [{ eventId: 'event-1', status: 'OPEN' }],
      },
      sentAt: '2026-09-14T00:00:00.000Z',
    })
    assert.deepStrictEqual(messages, [
      {
        type: 'REDUNDANCY_EVENT_SNAPSHOT',
        payload: [
          publicRedundancyEvent({ eventId: 'event-1', status: 'OPEN' }),
          publicRedundancyEvent({ eventId: 'event-2', status: 'OPEN' }),
        ],
        sentAt: '2026-09-14 08:01:00',
      },
    ])
    global.UnsubscribeRedundancyMessage(subscriptionId)
  } finally {
    runtime.restore()
  }
})

test('连接中断后新订阅者不回放旧连接的异常快照', () => {
  const runtime = loadCalculationRuntimeGlobals()
  try {
    const firstMessages = []
    const secondMessages = []
    const firstId = global.SubscribeRedundancyMessage((message) => firstMessages.push(message))
    const socket = FakeCalculationRuntimeSocket.instances[0]
    socket.open()
    socket.receive({
      type: 'REDUNDANCY_SNAPSHOT',
      payload: { openEvents: [{ eventId: 'event-1', status: 'OPEN' }] },
      sentAt: '2026-09-14T00:00:00.000Z',
    })
    socket.disconnect()

    const secondId = global.SubscribeRedundancyMessage((message) => secondMessages.push(message))
    assert.strictEqual(firstMessages.length, 1)
    assert.strictEqual(secondMessages.length, 0)
    global.UnsubscribeRedundancyMessage(firstId)
    global.UnsubscribeRedundancyMessage(secondId)
  } finally {
    runtime.restore()
  }
})

test('一个订阅回调修改消息不影响其他订阅者和快照缓存', () => {
  const runtime = loadCalculationRuntimeGlobals()
  try {
    const secondMessages = []
    const replayMessages = []
    const firstId = global.SubscribeRedundancyMessage((message) => {
      message.payload[0].message = 'mutated by first subscriber'
    })
    const secondId = global.SubscribeRedundancyMessage((message) => secondMessages.push(message))
    const socket = FakeCalculationRuntimeSocket.instances[0]
    socket.open()
    socket.receive({
      type: 'REDUNDANCY_SNAPSHOT',
      payload: {
        openEvents: [{ eventId: 'event-1', status: 'OPEN', summary: 'original' }],
      },
      sentAt: '2026-09-14T00:00:00.000Z',
    })

    const replayId = global.SubscribeRedundancyMessage((message) => replayMessages.push(message))
    assert.strictEqual(secondMessages[0].payload[0].message, 'original')
    assert.strictEqual(replayMessages[0].payload[0].message, 'original')
    global.UnsubscribeRedundancyMessage(firstId)
    global.UnsubscribeRedundancyMessage(secondId)
    global.UnsubscribeRedundancyMessage(replayId)
  } finally {
    runtime.restore()
  }
})

test('旧连接关闭后的在途消息不污染新连接快照', () => {
  const runtime = loadCalculationRuntimeGlobals()
  try {
    const firstId = global.SubscribeRedundancyMessage(() => {})
    const oldSocket = FakeCalculationRuntimeSocket.instances[0]
    oldSocket.open()
    global.UnsubscribeRedundancyMessage(firstId)

    const newMessages = []
    const secondId = global.SubscribeRedundancyMessage((message) => newMessages.push(message))
    const newSocket = FakeCalculationRuntimeSocket.instances[1]
    oldSocket.receive({
      type: 'REDUNDANCY_EVENT_CHANGED',
      payload: { eventId: 'old-event', status: 'OPEN' },
      sentAt: '2026-09-14T00:00:00.000Z',
    })
    newSocket.open()
    newSocket.receive({
      type: 'REDUNDANCY_SNAPSHOT',
      payload: { openEvents: [] },
      sentAt: '2026-09-14T00:01:00.000Z',
    })

    assert.deepStrictEqual(newMessages, [
      {
        type: 'REDUNDANCY_EVENT_SNAPSHOT',
        payload: [],
        sentAt: '2026-09-14 08:01:00',
      },
    ])
    global.UnsubscribeRedundancyMessage(secondId)
  } finally {
    runtime.restore()
  }
})
// end modified by jinlong.feng at 20260914 冗余功能-计算运行态订阅当前异常事件
// end
