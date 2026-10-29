// modified by jinlong.feng at 0901 冗余功能开发
'use strict'

/**
 * 将单 APP 命令入队，并同时等待命令结果和实际运行状态收敛。
 */
class CommandGateway {
  /**
   * @param {object} options 构造参数。
   * @param {object} options.adapter 现有命令系统适配器。
   * @param {(milliseconds: number) => Promise<void>} [options.wait] 等待函数。
   * @param {() => number} [options.now] 毫秒时间提供器。
   * @param {number} [options.pollIntervalMs=500] 轮询间隔。
   * @param {object} [options.stateAdapter] 状态适配器，用于把 APP ID 换成可读名称。
   */
  constructor({
    adapter,
    wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
    now = () => Date.now(),
    pollIntervalMs = 500,
    batchEnabled = false,
    // modified by jinlong.feng at 2026-10-08 冗余提示显示APP名称
    stateAdapter = null,
    // end modified by jinlong.feng at 2026-10-08 冗余提示显示APP名称
  }) {
    this.adapter = adapter
    this.wait = wait
    this.now = now
    this.pollIntervalMs = pollIntervalMs
    this.batchEnabled = batchEnabled
    // modified by jinlong.feng at 2026-10-08 冗余提示显示APP名称
    this.stateAdapter = stateAdapter
    // end modified by jinlong.feng at 2026-10-08 冗余提示显示APP名称
  }

  // modified by jinlong.feng at 2026-10-08 冗余提示显示APP名称
  /**
   * 解析命令涉及的 APP 可读名称。
   * 未注入状态适配器或缺少租户上下文时回退为 APP ID，保证旧调用方式不受影响。
   *
   * @param {object} input 命令输入。
   * @returns {string} APP 可读名称。
   */
  resolveAppLabel(input) {
    const tenantId = input && input.metadata ? input.metadata.tenantId : null
    if (!tenantId || !this.stateAdapter) return input.appId
    return this.stateAdapter.getAppDisplayName(tenantId, input.appId)
  }
  // end modified by jinlong.feng at 2026-10-08 冗余提示显示APP名称

  /**
   * 执行一个冗余 APP 集合，并把批量/兼容路径统一为逐 APP 结果。
   *
   * @param {object} input 批量命令输入。
   * @returns {Promise<{mode: string, commandId: string|null, results: object[]}>} 有序结果。
   */
  async executeManyAndObserve(input) {
    const appIds = Array.isArray(input.appIds) ? input.appIds : []
    if (appIds.length === 0) return { mode: this.batchEnabled ? 'BATCH' : 'SEQUENTIAL', commandId: null, results: [] }
    if (!this.batchEnabled) return this.executeManySequentially(input, appIds)

    const timeoutMs = input.timeoutMs || (input.action === 'START' ? 120000 : 60000)
    const startedAt = this.now()
    let commandId = null
    let terminal
    try {
      const queued = await Promise.resolve(this.adapter.enqueueBatch({ ...input, appIds }))
      commandId = queued.commandId
      terminal = await this.waitForBatchCommand(commandId, startedAt, timeoutMs)
    } catch (error) {
      return {
        mode: 'BATCH',
        commandId,
        results: appIds.map((appId) => {
          const result = this.createBatchResult(appId, commandId, 'UNKNOWN', null, error.message)
          this.emitProgress(input, 'COMMAND_RESULT', result)
          return result
        }),
      }
    }

    if (Array.isArray(terminal.results) && terminal.results.length === 0) {
      const fallback = await this.executeManySequentially(input, appIds)
      return { ...fallback, mode: 'SEQUENTIAL_FALLBACK', batchCommandId: commandId }
    }

    const byAppId = new Map((terminal.results || []).map((result) => [result.appId, result]))
    const commandResults = appIds.map((appId) => {
      const child = byAppId.get(appId)
      const status = child ? (child.status === 'SUCCEEDED' ? 'OBSERVING' : 'FAILED') : 'UNKNOWN'
      const result = this.createBatchResult(
        appId,
        commandId,
        status,
        null,
        child ? child.message : '运维代理未返回该 APP 的执行结果',
      )
      this.emitProgress(input, 'COMMAND_RESULT', result)
      return result
    })

    const finalResults = await Promise.all(commandResults.map(async (result) => {
      if (result.commandStatus !== 'OBSERVING') return result
      try {
        const observedStatus = await this.waitForObservedState(
          { ...input, appId: result.appId },
          startedAt,
          timeoutMs,
        )
        const completed = this.createBatchResult(
          result.appId,
          commandId,
          'SUCCEEDED',
          observedStatus,
          null,
        )
        this.emitProgress(input, 'OBSERVED_RESULT', completed)
        return completed
      } catch (error) {
        const unknown = this.createBatchResult(
          result.appId,
          commandId,
          'UNKNOWN',
          null,
          error.message,
        )
        this.emitProgress(input, 'OBSERVED_RESULT', unknown)
        return unknown
      }
    }))

    return { mode: 'BATCH', commandId, results: finalResults }
  }

  async executeManySequentially(input, appIds) {
    const results = []
    for (const appId of appIds) {
      try {
        const result = await this.executeAndObserve({ ...input, appId })
        const completed = this.createBatchResult(
          appId,
          result.commandId,
          'SUCCEEDED',
          result.observedStatus,
          null,
        )
        this.emitProgress(input, 'COMMAND_RESULT', {
          ...completed,
          commandStatus: 'OBSERVING',
          observedStatus: null,
        })
        this.emitProgress(input, 'OBSERVED_RESULT', completed)
        results.push(completed)
      } catch (error) {
        const failed = this.createBatchResult(appId, null, 'FAILED', null, error.message)
        this.emitProgress(input, 'COMMAND_RESULT', failed)
        results.push(failed)
      }
    }
    return { mode: 'SEQUENTIAL', commandId: null, results }
  }

  async waitForBatchCommand(commandId, startedAt, timeoutMs) {
    while (true) {
      const result = await Promise.resolve(this.adapter.getCommandStatus(commandId))
      if (result && (result.status === 'SUCCEEDED' || result.status === 'FAILED')) return result
      this.assertNotTimedOut(startedAt, timeoutMs, `等待批量命令 ${commandId} 结果超时`)
      await this.wait(this.pollIntervalMs)
    }
  }

  createBatchResult(appId, commandId, commandStatus, observedStatus, message) {
    return { appId, commandId, commandStatus, observedStatus, message: message || null }
  }

  emitProgress(input, phase, result) {
    if (typeof input.onProgress === 'function') input.onProgress({ phase, result: { ...result } })
  }

  /**
   * 执行命令并观察 APP 最终状态。
   *
   * @param {object} input 命令输入。
   * @returns {Promise<{commandId: string, commandStatus: string, observedStatus: string}>} 执行结果。
   */
  async executeAndObserve(input) {
    const timeoutMs = input.timeoutMs || (input.action === 'START' ? 120000 : 60000)
    const startedAt = this.now()
    const queued = await Promise.resolve(this.adapter.enqueue(input))
    const commandId = queued.commandId

    await this.waitForCommand(commandId, startedAt, timeoutMs)
    const observedStatus = await this.waitForObservedState(input, startedAt, timeoutMs)
    return { commandId, commandStatus: 'SUCCEEDED', observedStatus }
  }

  /**
   * 等待命令系统给出成功或失败终态。
   *
   * @param {string} commandId 命令 ID。
   * @param {number} startedAt 开始时间。
   * @param {number} timeoutMs 超时时间。
   * @returns {Promise<void>}
   */
  async waitForCommand(commandId, startedAt, timeoutMs) {
    while (true) {
      const result = await Promise.resolve(this.adapter.getCommandStatus(commandId))
      if (result && result.status === 'SUCCEEDED') return
      if (result && result.status === 'FAILED') {
        throw new Error(result.message || `命令 ${commandId} 执行失败`)
      }
      this.assertNotTimedOut(startedAt, timeoutMs, `等待命令 ${commandId} 结果超时`)
      await this.wait(this.pollIntervalMs)
    }
  }

  /**
   * 等待 APP 实际运行状态符合命令目标。
   *
   * @param {object} input 命令输入。
   * @param {number} startedAt 开始时间。
   * @param {number} timeoutMs 超时时间。
   * @returns {Promise<string>} RUNNING 或 STOPPED。
   */
  async waitForObservedState(input, startedAt, timeoutMs) {
    const expectedRunning = input.action === 'START'
    while (true) {
      const appState = await Promise.resolve(this.adapter.getAppState(input.nodeId, input.appId))
      if (appState && appState.running === expectedRunning) {
        return expectedRunning ? 'RUNNING' : 'STOPPED'
      }
      // modified by jinlong.feng at 2026-10-08 冗余提示显示APP名称
      this.assertNotTimedOut(
        startedAt,
        timeoutMs,
        `等待 APP「${this.resolveAppLabel(input)}」实际状态收敛超时`,
      )
      // end modified by jinlong.feng at 2026-10-08 冗余提示显示APP名称
      await this.wait(this.pollIntervalMs)
    }
  }

  /**
   * 校验操作是否超时。
   *
   * @param {number} startedAt 开始时间。
   * @param {number} timeoutMs 超时时间。
   * @param {string} message 超时错误信息。
   * @returns {void}
   */
  assertNotTimedOut(startedAt, timeoutMs, message) {
    if (this.now() - startedAt >= timeoutMs) {
      throw new Error(message)
    }
  }
}

module.exports = { CommandGateway }
// end
