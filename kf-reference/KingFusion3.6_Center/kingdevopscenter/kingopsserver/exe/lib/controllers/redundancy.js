// modified by jinlong.feng at 0901 冗余功能开发
'use strict'

const { PERMISSION } = require('../services/redundancy/constants')
const { getSubsystem } = require('../services/redundancy')

/**
 * 冗余 REST 控制器，只负责认证上下文、参数提取和统一响应。
 */
class RedundancyController {
  /**
   * @param {object|null} [dependencies=null] 测试或独立集成时注入的服务集合。
   */
  constructor(dependencies = null) {
    this.dependencies = dependencies
    for (const methodName of [
      'list',
      'detail',
      'create',
      'update',
      'remove',
      'appCandidates',
      'enable',
      'disable',
      'switchNode',
      'appChanges',
      'events',
      'globalEvents',
      'acknowledgeEvent',
      'operationTasks',
      'operationTaskDetail',
    ]) {
      this[methodName] = this[methodName].bind(this)
    }
  }

  /** @returns {object} 当前服务集合。 */
  getServices() {
    const services = this.dependencies || getSubsystem()
    if (!services) throw new Error('冗余子系统尚未初始化')
    return services
  }

  /** @param {object} request 请求。 @param {object} response 响应。 @returns {Promise<void>} */
  async list(request, response) {
    await this.handle(
      request,
      response,
      PERMISSION.VIEW,
      ({ queryService, configService, tenantId }) =>
        queryService ? queryService.list(tenantId) : configService.list(tenantId),
    )
  }

  /** @param {object} request 请求。 @param {object} response 响应。 @returns {Promise<void>} */
  async detail(request, response) {
    await this.handle(
      request,
      response,
      PERMISSION.VIEW,
      ({ queryService, configService, tenantId }) =>
        queryService
          ? queryService.getDetail(tenantId, request.params.id)
          : configService.getDetail(tenantId, request.params.id),
    )
  }

  /** @param {object} request 请求。 @param {object} response 响应。 @returns {Promise<void>} */
  async create(request, response) {
    await this.handle(
      request,
      response,
      PERMISSION.CREATE,
      ({ configService, tenantId, operator }) =>
        configService.createConfig(tenantId, request.body || {}, operator),
    )
  }

  /** @param {object} request 请求。 @param {object} response 响应。 @returns {Promise<void>} */
  async update(request, response) {
    await this.handle(request, response, PERMISSION.EDIT, ({ configService, tenantId, operator }) =>
      configService.updateInactiveConfig(
        tenantId,
        request.params.id,
        request.body.expectedRevision,
        request.body,
        operator,
      ),
    )
  }

  /** @param {object} request 请求。 @param {object} response 响应。 @returns {Promise<void>} */
  async remove(request, response) {
    await this.handle(request, response, PERMISSION.DELETE, ({ configService, tenantId }) =>
      configService.deleteConfig(
        tenantId,
        request.params.id,
        Number(request.query.expectedRevision),
      ),
    )
  }

  /** @param {object} request 请求。 @param {object} response 响应。 @returns {Promise<void>} */
  async appCandidates(request, response) {
    await this.handle(request, response, PERMISSION.VIEW, ({ configService, tenantId }) =>
      configService.getAppCandidates(tenantId, request.query.nodeId, request.params.id),
    )
  }

  /** @param {object} request 请求。 @param {object} response 响应。 @returns {Promise<void>} */
  async enable(request, response) {
    await this.callOperation(request, response, PERMISSION.ENABLE, 'enable')
  }

  /** @param {object} request 请求。 @param {object} response 响应。 @returns {Promise<void>} */
  async disable(request, response) {
    await this.callOperation(request, response, PERMISSION.ENABLE, 'disable')
  }

  /** @param {object} request 请求。 @param {object} response 响应。 @returns {Promise<void>} */
  async switchNode(request, response) {
    const permission =
      request.body && request.body.force ? PERMISSION.FORCE_SWITCH : PERMISSION.SWITCH
    await this.callOperation(request, response, permission, 'switchNode')
  }

  /** @param {object} request 请求。 @param {object} response 响应。 @returns {Promise<void>} */
  async appChanges(request, response) {
    await this.handle(
      request,
      response,
      PERMISSION.EDIT,
      ({ appMembershipService, tenantId, operator }) =>
        appMembershipService.applyChanges({
          tenantId,
          redundancyId: request.params.id,
          operator,
          ...request.body,
        }),
    )
  }

  /** @param {object} request 请求。 @param {object} response 响应。 @returns {Promise<void>} */
  async events(request, response) {
    await this.handle(request, response, PERMISSION.VIEW, ({ eventRepository, tenantId }) =>
      eventRepository.queryEvents({
        tenantId,
        redundancyId: request.params.id,
        ...request.query,
      }),
    )
  }

  /** @param {object} request 请求。 @param {object} response 响应。 @returns {Promise<void>} */
  async globalEvents(request, response) {
    await this.handle(request, response, PERMISSION.VIEW, ({ eventRepository, tenantId }) =>
      eventRepository.queryEvents({ tenantId, ...request.query }),
    )
  }

  /** @param {object} request 请求。 @param {object} response 响应。 @returns {Promise<void>} */
  async acknowledgeEvent(request, response) {
    await this.handle(
      request,
      response,
      PERMISSION.EVENT_ACK,
      ({ eventRepository, tenantId, operator }) =>
        eventRepository.acknowledgeEvent(tenantId, request.params.eventId, operator),
    )
  }

  /** @param {object} request 请求。 @param {object} response 响应。 @returns {Promise<void>} */
  async operationTasks(request, response) {
    await this.handle(request, response, PERMISSION.VIEW, ({ eventRepository, tenantId }) =>
      eventRepository.queryOperationTasks({
        tenantId,
        redundancyId: request.params.id,
        ...request.query,
      }),
    )
  }

  /** @param {object} request 请求。 @param {object} response 响应。 @returns {Promise<void>} */
  async operationTaskDetail(request, response) {
    await this.handle(request, response, PERMISSION.VIEW, ({ eventRepository, tenantId }) =>
      eventRepository.getOperationTaskDetail(tenantId, request.params.taskId),
    )
  }

  /**
   * 调用统一操作服务。
   *
   * @param {object} request 请求。
   * @param {object} response 响应。
   * @param {string} permission 权限点。
   * @param {string} methodName 操作服务方法名。
   * @returns {Promise<void>}
   */
  async callOperation(request, response, permission, methodName) {
    await this.handle(request, response, permission, ({ operationService, tenantId, operator }) =>
      operationService[methodName]({
        tenantId,
        redundancyId: request.params.id,
        operator,
        ...request.body,
      }),
    )
  }

  /**
   * 统一执行权限校验、租户提取、成功响应和错误响应。
   *
   * @param {object} request Express 请求。
   * @param {object} response Express 响应。
   * @param {string} permission 权限点。
   * @param {(context: object) => Promise<unknown>} action 业务调用。
   * @returns {Promise<void>}
   */
  async handle(request, response, permission, action) {
    try {
      const services = this.getServices()
      await services.permissionService.assert(request.oauthInfo, permission)
      const tenantId = request.oauthInfo.tenantId

      // modified by jinlong.feng at 20260910 冗余功能-异常事件确认人显示用户名
      const username = request.headers && request.headers.username
      const operator =
        (typeof username === 'string' && username.trim()) ||
        (request.oauthInfo.userId != null ? String(request.oauthInfo.userId) : 'unknown')
      // end modified by jinlong.feng at 20260910 冗余功能-异常事件确认人显示用户名

      const data = await action({ ...services, tenantId, operator })
      response.sendOk(data)
    } catch (error) {
      response.sendErr(error.code || -1, error.message || '冗余功能请求处理失败')
    }
  }
}

const controller = new RedundancyController()
module.exports = controller
module.exports.RedundancyController = RedundancyController
// end
