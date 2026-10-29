// modified by jinlong.feng at 0901 冗余功能开发
'use strict'

/**
 * 协调节点启动安全停机、Center 角色查询、APP 收敛和心跳刷新。
 */
class RuntimeCoordinator {
  /**
   * @param {object} options 构造参数。
   * @param {object} options.nodeInfo 节点信息。
   * @param {import('./runtime_client').RuntimeClient} options.runtimeClient Center 客户端。
   * @param {import('./cache_manager').CacheManager} options.cacheManager 缓存管理器。
   * @param {import('./reconcile_service').ReconcileService} options.reconcileService APP 收敛器。
   * @param {object} [options.logger] 日志接口。
   */
  constructor({ nodeInfo, runtimeClient, cacheManager, reconcileService, logger = console }) {
    this.nodeInfo = nodeInfo
    this.runtimeClient = runtimeClient
    this.cacheManager = cacheManager
    this.reconcileService = reconcileService
    this.logger = logger
    this.normalRunning = false
    this.refreshPromise = null
  }

  /**
   * 节点注册成功后执行一次启动安全收敛。
   *
   * 启动阶段先停止缓存中的受管 APP。若 Center 暂时不可访问，不恢复这些 APP；
   * 正常运行后则不再采用该停机策略。
   *
   * @returns {Promise<object>} 启动结果和当前受管 APP。
   */
  async initializeAfterRegistration() {
    const cachedRuntime = this.readCacheSafely()
    if (cachedRuntime && cachedRuntime.enabled) {
      await this.reconcileService.stopApps(cachedRuntime.appIds)
    }

    try {
      const result = await this.refreshRuntime({ reconcileApps: true })
      this.normalRunning = true
      return { ...result, centerAvailable: true }
    } catch (error) {
      this.normalRunning = true
      this.logger.warn(`节点启动时无法获取冗余运行态，缓存受管 APP 保持停止: ${error.message}`)
      return {
        centerAvailable: false,
        managedAppIds: cachedRuntime && cachedRuntime.enabled ? [...cachedRuntime.appIds] : [],
        activeAppIds: [],
        error: error.message,
      }
    }
  }

  /**
   * 处理 Center 心跳响应中的 revision 提示。
   *
   * 正常运行后的刷新失败只记录并保持现状，不主动停止任何 APP。
   *
   * @param {object} hint 心跳轻量提示。
   * @returns {Promise<object>} 是否完成刷新。
   */
  async onHeartbeatHint(hint) {
    if (!hint || !Number.isInteger(hint.redundancyRevision)) return { refreshed: false }
    const cachedRuntime = this.readCacheSafely()
    const shouldRefresh = Boolean(
      hint &&
        (!cachedRuntime ||
          cachedRuntime.revision !== hint.redundancyRevision ||
          hint.reconcileRequired === true),
    )
    if (!shouldRefresh) return { refreshed: false }

    try {
      const result = await this.refreshRuntime()
      return { ...result, refreshed: true }
    } catch (error) {
      this.logger.warn(`正常运行期间刷新冗余运行态失败，保持当前 APP 状态: ${error.message}`)
      return { refreshed: false, error: error.message }
    }
  }

  /**
   * 查询最新运行态并确认角色；节点启动时可额外执行一次 APP 安全收敛。
   *
   * @param {object} [options] 刷新选项。
   * @param {boolean} [options.reconcileApps=false] 是否按运行态收敛 APP。
   * @returns {Promise<object>} 刷新结果。
   */
  async refreshRuntime(options = {}) {
    if (this.refreshPromise) return this.refreshPromise
    this.refreshPromise = this.performRefresh(options)
    try {
      return await this.refreshPromise
    } finally {
      this.refreshPromise = null
    }
  }

  /**
   * @param {object} [options] 刷新选项。
   * @param {boolean} [options.reconcileApps=false] 是否按运行态收敛 APP。
   * @returns {Promise<object>} 单次刷新结果。
   */
  async performRefresh({ reconcileApps = false } = {}) {
    const runtime = await this.runtimeClient.getRuntime(this.nodeInfo)
    this.cacheManager.write(runtime)

    if (!runtime.enabled) {
      return { runtime, managedAppIds: [], activeAppIds: [], reconcileResult: null }
    }

    try {
      await this.runtimeClient.reportSyncResult(this.nodeInfo, {
        redundancyId: runtime.redundancyId,
        revision: runtime.revision,
        role: runtime.role,
        success: true,
        appResults: [],
      })
    } catch (error) {
      this.logger.warn(`上报冗余角色确认失败，将由后续心跳再次触发: ${error.message}`)
    }

    const reconcileResult = reconcileApps ? await this.reconcileService.reconcile(runtime) : null

    return {
      runtime,
      managedAppIds: [...runtime.appIds],
      activeAppIds: runtime.role === 'ACTIVE' ? [...runtime.appIds] : [],
      reconcileResult,
    }
  }

  /**
   * 读取缓存并将损坏情况记录为错误；不把损坏缓存误判为有效未托管状态。
   *
   * @returns {object|null} 缓存或 null。
   */
  readCacheSafely() {
    try {
      return this.cacheManager.read()
    } catch (error) {
      this.logger.error(error.message)
      return null
    }
  }
}

module.exports = { RuntimeCoordinator }
// end
