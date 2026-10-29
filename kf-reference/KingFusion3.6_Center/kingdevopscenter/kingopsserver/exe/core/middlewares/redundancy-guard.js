// modified by jinlong.feng at 0901 冗余功能开发
'use strict'

const { getSubsystem } = require('../../lib/services/redundancy')

const SINGLE_APP_ACTIONS = Object.freeze({
  '/apps/start': 'START',
  '/apps/stop': 'STOP',
  '/apps/restart': 'RESTART',
  '/apps/delete': 'DELETE',
})

const BATCH_APP_ACTIONS = Object.freeze({
  '/apps/list/start': 'START',
  '/apps/list/stop': 'STOP',
  '/apps/list/restart': 'RESTART',
  '/apps/list/delete': 'DELETE',
  // modified by jinlong.feng at 2026-10-09 冗余启动拦截提示APP名称
  // 运维节点管理的多选批量操作走 multi* 路径，与 /apps/list/* 是同一批操作的两种写法，
  // 两种路径都必须执行同一条冗余限制判定。
  '/apps/multiStart': 'START',
  '/apps/multiStop': 'STOP',
  '/apps/multiRestart': 'RESTART',
  '/apps/multiDelete': 'DELETE',
  // end modified by jinlong.feng at 2026-10-09 冗余启动拦截提示APP名称
})

/**
 * 读取批量请求体中的 APP ID 列表。
 * 兼容 [{appId}]、{appIds:[]}、{apps:[]} 与裸 ID 数组等既有写法，
 * 避免因请求体结构不同而漏过冗余限制。
 *
 * @param {*} body 请求体。
 * @returns {string[]} APP ID 列表。
 */
function readBatchAppIds(body) {
  const candidates = Array.isArray(body)
    ? [body]
    : [body.apps, body.appIds, body.appList]
  const source = candidates.find((value) => Array.isArray(value)) || []
  return source
    .map((app) => (typeof app === 'string' ? app : app && app.appId))
    .filter((appId) => typeof appId === 'string' && appId.length > 0)
}

/**
 * 在现有 APP/节点 Controller 执行前应用冗余限制。
 * 冗余子系统尚未装配时放行，保证旧服务启动顺序兼容。
 *
 * @param {object} request Express 请求。
 * @param {object} response Express 响应。
 * @param {Function} next 后续中间件。
 * @returns {Promise<void>}
 */
async function redundancyGuard(request, response, next) {
  const subsystem = getSubsystem()
  if (!subsystem || !subsystem.operationGuard) {
    next()
    return
  }

  try {
    const tenantId = request.oauthInfo && request.oauthInfo.tenantId
    const body = request.body || {}
    if (request.method === 'POST' && SINGLE_APP_ACTIONS[request.path]) {
      subsystem.operationGuard.assertAppOperation(
        tenantId,
        body.appId,
        SINGLE_APP_ACTIONS[request.path],
      )
    }
    if (request.method === 'POST' && BATCH_APP_ACTIONS[request.path]) {
      // modified by jinlong.feng at 2026-10-09 冗余启动拦截提示APP名称
      const appIds = readBatchAppIds(body)
      // end modified by jinlong.feng at 2026-10-09 冗余启动拦截提示APP名称
      subsystem.operationGuard.assertBatchOperation(
        tenantId,
        appIds,
        BATCH_APP_ACTIONS[request.path],
      )
    }
    if (request.method === 'POST' && request.path === '/delNodes') {
      subsystem.operationGuard.assertNodeOperation(tenantId, body.nodeId, 'DELETE')
    }
    next()
  } catch (error) {
    response.sendErr(error.code || -1, error.message || '冗余操作限制校验失败')
  }
}

module.exports = redundancyGuard
// end
