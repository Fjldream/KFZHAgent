// modified by jinlong.feng at 0901 冗余功能开发
'use strict'

const path = require('path')
const uuid = require('node-uuid')
const { AppMembershipService } = require('./app_membership_service')
const { KeyedAsyncMutex } = require('./async_mutex')
const { AtomicJsonStore } = require('./atomic_json_store')
const { CommandGateway } = require('./command_gateway')
const { ConfigRepository } = require('./config_repository')
const { ConfigService } = require('./config_service')
const { CONFIG_LIFECYCLE } = require('./constants')
const { EventRepository } = require('./event_repository')
const { HealthEvaluator } = require('./health_evaluator')
const { LegacyCommandAdapter } = require('./legacy_command_adapter')
const {
  NodeRuntimeRegistry,
  NodeRuntimeService,
  NodeRuntimeSynchronizer,
} = require('./node_runtime_service')
const { OperationGuard } = require('./operation_guard')
const { OperationService } = require('./operation_service')
const {
  LegacyUserTypePermissionProvider,
  PermissionService,
} = require('./permission_service')
const { RedundancyQueryService } = require('./query_service')
const { StateAdapter } = require('./state_adapter')
const { RedundancyWebSocketService } = require('./ws_service')
const { setSubsystem } = require('./index')

/**
 * 组装并管理 Center 冗余子系统生命周期。
 */
class RedundancyBootstrap {
  /** @param {object} environment 环境变量对象。 @returns {boolean} 是否启用批量 APP 指令。 */
  static readBatchAppCommandsEnabled(environment = {}) {
    return environment.KF_REDUNDANCY_BATCH_APP_COMMANDS === 'true'
  }

  /**
   * 解析 Center 冗余配置和数据库的标准存储路径。
   *
   * 配置 JSON 跟随 KingOpsServer 放在 exe/data；SQLite 数据库遵循 Center
   * 现有数据库目录约定，统一放在 Center/env/db。
   *
   * @param {string} [centerExeDirectory=__dir] KingOpsServer 的 exe 目录。
   * @returns {{configPath: string, databasePath: string}} 冗余存储路径。
   */
  static resolveStoragePaths(centerExeDirectory = __dir) {
    return {
      configPath: path.join(
        centerExeDirectory,
        'data',
        'redundancy_manage.json',
      ),
      databasePath: path.resolve(
        centerExeDirectory,
        '../../../env/db/redundancy.db',
      ),
    }
  }

  /**
   * @param {object} [options] 可测试替换项。
   * @param {() => object} [options.subsystemFactory] 自定义服务工厂。
   * @param {number} [options.healthIntervalMs=1000] 健康扫描间隔。
   * @param {number} [options.cleanupIntervalMs=86400000] 数据清理间隔。
   */
  constructor({
    subsystemFactory = null,
    healthIntervalMs = 1000,
    cleanupIntervalMs = 24 * 60 * 60 * 1000,
  } = {}) {
    this.subsystemFactory = subsystemFactory
    this.healthIntervalMs = healthIntervalMs
    this.cleanupIntervalMs = cleanupIntervalMs
    this.services = null
    this.healthTimer = null
    this.cleanupTimer = null
    this.signalHandler = () => this.stop()
  }

  /**
   * 按 JSON、SQLite、任务恢复、WS、健康扫描的顺序启动。
   *
   * @param {object} options 启动参数。
   * @param {object} options.httpServer 已有 Center HTTP Server。
   * @returns {object} 已组装服务集合。
   */
  start({ httpServer }) {
    if (this.services) return this.services
    const services = this.subsystemFactory
      ? this.subsystemFactory()
      : this.buildDefaultSubsystem()

    services.configRepository.list('__bootstrap_validation__')
    services.eventRepository.interruptRunningTasks(
      'Center 重启，原运行中冗余任务已中断',
    )
    setSubsystem(services)
    services.wsService.start({ httpServer })
    this.services = services
    this.scanHealth()
    this.healthTimer = setInterval(
      () => this.scanHealth(),
      this.healthIntervalMs,
    )
    this.cleanupExpiredData()
    this.cleanupTimer = setInterval(
      () => this.cleanupExpiredData(),
      this.cleanupIntervalMs,
    )
    process.prependListener('SIGTERM', this.signalHandler)
    process.prependListener('SIGINT', this.signalHandler)
    return services
  }

  /**
   * 停止扫描、WS 和 SQLite；不关闭共享 HTTP Server。
   *
   * @returns {void}
   */
  stop() {
    if (!this.services) return
    if (this.healthTimer) clearInterval(this.healthTimer)
    if (this.cleanupTimer) clearInterval(this.cleanupTimer)
    this.healthTimer = null
    this.cleanupTimer = null
    this.services.wsService.stop()
    this.services.eventRepository.close()
    setSubsystem(null)
    this.services = null
    process.removeListener('SIGTERM', this.signalHandler)
    process.removeListener('SIGINT', this.signalHandler)
  }

  /** @returns {Promise<void>} 执行健康扫描并隔离单轮异常。 */
  async scanHealth() {
    if (!this.services) return
    try {
      await this.services.healthEvaluator.scanEnabledConfigs()
    } catch (error) {
      // modified by jinlong.feng at 2026-10-08 冗余日志调用修正
      // LoggerInstance 仅提供 log(level, message)，不存在 error 方法。
      logger.log('error', `冗余健康扫描失败: ${error.message}`)
      // end modified by jinlong.feng at 2026-10-08 冗余日志调用修正
    }
  }

  /** @returns {void} 清理 90 天前可删除的事件和成功任务。 */
  cleanupExpiredData() {
    if (!this.services) return
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
    try {
      this.services.eventRepository.cleanupBefore(cutoff)
    } catch (error) {
      // modified by jinlong.feng at 2026-10-08 冗余日志调用修正
      logger.log('error', `清理冗余历史数据失败: ${error.message}`)
      // end modified by jinlong.feng at 2026-10-08 冗余日志调用修正
    }
  }

  /**
   * 使用当前 KF 模型、命令和认证组件构建默认服务集合。
   *
   * @returns {object} 冗余服务集合。
   */
  buildDefaultSubsystem() {
    const Model = require('../../models')
    const commandClasses = require('../commands/command')
    const commandExecutor = require('../commands/commandExe')
    const commandResults = require('../commands/APPCommandResults')
    const commonEnums = require('../common/public')
    const UserAuthentic = require('../interface/user_authentic_interface')
    const storagePaths = RedundancyBootstrap.resolveStoragePaths()
    const store = new AtomicJsonStore({
      filePath: storagePaths.configPath,
    })
    const configRepository = new ConfigRepository({ store })
    const Database = process.env.KF_BETTER_SQLITE3_MODULE
      ? require(process.env.KF_BETTER_SQLITE3_MODULE)
      : require('better-sqlite3')
    const eventRepository = new EventRepository({
      databasePath: storagePaths.databasePath,
      Database,
      idFactory: () => uuid.v4(),
    })
    const runtimeRegistry = new NodeRuntimeRegistry()
    const stateAdapter = new StateAdapter({
      nodeManager: Model.node,
      appManager: Model.app,
      nodeAppManager: Model.nodeProApp,
      runtimeRegistry,
    })
    const configService = new ConfigService({
      repository: configRepository,
      stateProvider: stateAdapter,
      idFactory: () => uuid.v4(),
    })
    const permissionService = new PermissionService(
      new LegacyUserTypePermissionProvider(),
    )
    let queryService = null
    const wsService = new RedundancyWebSocketService({
      authProvider: {
        authenticate: async (token) => {
          const result = await UserAuthentic.checkUserTokenIsValid(token)
          return {
            tenantId: result.oauth.tenantId,
            userId: Number(result.oauth.userId),
            userType: result.oauth.userType,
          }
        },
      },
      permissionService,
      snapshotProvider: async (tenantId) => ({
        tenantId,
        redundancies: await queryService.list(tenantId),
        openEvents: eventRepository.queryEvents({ tenantId, status: 'OPEN' }),
      }),
    })
    RedundancyBootstrap.decorateRepositoryPublisher(eventRepository, wsService)
    const enabledConfigProvider = {
      listEnabledConfigs: () =>
        store
          .read()
          .configs.filter(
            (config) => config.lifecycle === CONFIG_LIFECYCLE.ENABLED,
          ),
    }
    const healthEvaluator = new HealthEvaluator({
      stateAdapter,
      configProvider: enabledConfigProvider,
      eventRepository,
      publisher: wsService,
    })
    queryService = new RedundancyQueryService({
      configService,
      stateAdapter,
      healthEvaluator,
      eventRepository,
    })
    const appProvider = {
      getAppInfo: (appId) => {
        const index = Model.app.findAppBaseById(appId)
        return index >= 0 ? Model.app.appsBaseInfo[index] : null
      },
      getAppState: (nodeId, appId) => {
        const app = stateAdapter.getApp(
          StateAdapter.readValue(
            Model.app.appsBaseInfo[Model.app.findAppBaseById(appId)] || {},
            'getTenantId',
            'tenantId',
          ),
          appId,
        )
        return app && app.nodeId === nodeId ? app : null
      },
    }
    const commandAdapter = new LegacyCommandAdapter({
      commandClasses,
      commandExecutor,
      commandResults,
      appProvider,
      commandStatusEnum: commonEnums.enumDeployCommandStatus,
    })
    const commandGateway = new CommandGateway({
      adapter: commandAdapter,
      batchEnabled: RedundancyBootstrap.readBatchAppCommandsEnabled(process.env),
      // modified by jinlong.feng at 2026-10-08 冗余提示显示APP名称
      // 注入状态适配器，使命令超时等提示能显示 APP 名称而非 ID。
      stateAdapter,
      // end modified by jinlong.feng at 2026-10-08 冗余提示显示APP名称
    })
    const runtimeSynchronizer = new NodeRuntimeSynchronizer({
      runtimeRegistry,
    })
    const mutex = new KeyedAsyncMutex()
    const operationService = new OperationService({
      configRepository,
      stateAdapter,
      commandGateway,
      runtimeSynchronizer,
      eventRepository,
      mutex,
    })
    const appMembershipService = new AppMembershipService({
      configRepository,
      stateProvider: stateAdapter,
      commandGateway,
      runtimeSynchronizer,
      eventRepository,
      mutex,
    })
    const nodeRuntimeService = new NodeRuntimeService({
      configProvider: configRepository,
      runtimeRegistry,
    })
    const operationGuard = new OperationGuard({
      configProvider: configRepository,
      // modified by jinlong.feng at 2026-10-09 冗余启动拦截提示APP名称
      // 注入状态适配器，使「不允许启动/重启/删除」的提示显示 APP 名称而非 APP ID。
      stateAdapter,
      // end modified by jinlong.feng at 2026-10-09 冗余启动拦截提示APP名称
    })

    return {
      appMembershipService,
      commandGateway,
      configRepository,
      configService,
      eventRepository,
      healthEvaluator,
      nodeRuntimeService,
      operationGuard,
      operationService,
      permissionService,
      queryService,
      runtimeRegistry,
      runtimeSynchronizer,
      stateAdapter,
      wsService,
    }
  }

  /**
   * 将事件和任务仓库的写操作转换成 WS 增量消息。
   *
   * @param {object} repository SQLite 仓库。
   * @param {RedundancyWebSocketService} wsService WS 发布器。
   * @returns {void}
   */
  static decorateRepositoryPublisher(repository, wsService) {
    const methods = {
      openEvent: 'REDUNDANCY_EVENT_CHANGED',
      recoverEvent: 'REDUNDANCY_EVENT_CHANGED',
      acknowledgeEvent: 'REDUNDANCY_EVENT_CHANGED',
      createOperationTask: 'REDUNDANCY_TASK_CHANGED',
      updateOperationTask: 'REDUNDANCY_TASK_CHANGED',
      addAppStep: 'REDUNDANCY_TASK_APP_CHANGED',
      updateAppStep: 'REDUNDANCY_TASK_APP_CHANGED',
    }
    for (const [methodName, eventType] of Object.entries(methods)) {
      const original = repository[methodName].bind(repository)
      repository[methodName] = (...args) => {
        const result = original(...args)
        if (result && result.tenantId) wsService.publish(eventType, result)
        return result
      }
    }
  }
}

const bootstrap = new RedundancyBootstrap()
module.exports = bootstrap
module.exports.RedundancyBootstrap = RedundancyBootstrap
// end
