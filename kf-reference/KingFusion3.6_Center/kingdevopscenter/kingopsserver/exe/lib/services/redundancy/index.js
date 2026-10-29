// modified by jinlong.feng at 0901 冗余功能开发
'use strict'

let subsystem = null

/**
 * 保存启动阶段组装完成的冗余子系统。
 *
 * @param {object} value 冗余子系统公共服务集合。
 * @returns {void}
 */
function setSubsystem(value) {
  subsystem = value
}

/**
 * 获取冗余子系统；尚未启动时返回 null，便于中间件兼容旧启动流程。
 *
 * @returns {object|null} 冗余子系统。
 */
function getSubsystem() {
  return subsystem
}

module.exports = { setSubsystem, getSubsystem }
// end
