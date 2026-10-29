// modified by jinlong.feng at 0901 冗余功能开发
'use strict'

const path = require('path')
const { CacheManager } = require('./cache_manager')
const { CommandGuard } = require('./command_guard')
const { ReconcileService } = require('./reconcile_service')
const { RuntimeClient } = require('./runtime_client')
const { RuntimeCoordinator } = require('./runtime_coordinator')

let subsystem = null

/**
 * 使用现有 Node 依赖组装冗余子系统。
 *
 * @param {object} options 构造参数。
 * @param {object} options.nodeInfo 当前节点信息。
 * @param {object} options.appControl 现有 APP 控制器。
 * @returns {object} 节点冗余子系统。
 */
function initializeNodeRedundancy({ nodeInfo, appControl }) {
  const requestClient = require(__dir + '/lib/services/interface/request_helper')
  const interfaceEnum = require(__dir + '/lib/services/interface/interface_enum')
  const heartbeatUrl = interfaceEnum.opscenterInterface.OPSCENTER_HEARTBEAT.URL
  const apiBaseUrl = heartbeatUrl.replace(/\/heartbeat$/, '')
  const cacheManager = new CacheManager({
    filePath: path.join(__dir, 'data', 'redundancy_runtime_cache.json'),
  })
  const runtimeClient = new RuntimeClient({ requestClient, apiBaseUrl })
  const reconcileService = new ReconcileService({ appControl })
  const runtimeCoordinator = new RuntimeCoordinator({
    nodeInfo,
    runtimeClient,
    cacheManager,
    reconcileService,
    logger,
  })
  const commandGuard = new CommandGuard({
    runtimeProvider: () => runtimeCoordinator.readCacheSafely(),
  })
  subsystem = { cacheManager, commandGuard, reconcileService, runtimeClient, runtimeCoordinator }
  return subsystem
}

/** @returns {object|null} 已初始化的节点冗余子系统。 */
function getNodeRedundancy() {
  return subsystem
}

module.exports = { getNodeRedundancy, initializeNodeRedundancy }
// end
