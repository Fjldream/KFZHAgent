// modified by jinlong.feng at 0901 冗余功能开发
'use strict'

/**
 * 将一组 APP 逐项收敛到 Center 指定的运行状态。
 */
class ReconcileService {
  /**
   * @param {object} options 构造参数。
   * @param {object} options.appControl KF 现有 APP 控制器。
   * @param {(result: object) => boolean} [options.isSuccess] 命令成功判断器。
   */
  constructor({ appControl, isSuccess = ReconcileService.isSuccessfulResult }) {
    this.appControl = appControl
    this.isSuccess = isSuccess
  }

  /**
   * 按运行态中的 desiredStates 逐 APP 执行 START 或 STOP。
   *
   * @param {object} runtime Center 返回的完整运行态。
   * @returns {Promise<{success: boolean, appResults: object[]}>} 收敛结果。
   */
  async reconcile(runtime) {
    const appResults = []
    for (const appId of runtime.appIds) {
      const desiredState = runtime.desiredStates[appId]
      const action = desiredState === 'RUNNING' ? 'START' : 'STOP'
      appResults.push(await this.execute(appId, action))
    }
    return {
      success: appResults.every((item) => item.success),
      appResults,
    }
  }

  /**
   * 在节点启动查询 Center 前停止旧缓存中全部受管 APP。
   *
   * @param {string[]} appIds 缓存中的受管 APP ID。
   * @returns {Promise<{success: boolean, appResults: object[]}>} 停止结果。
   */
  async stopApps(appIds) {
    const appResults = []
    for (const appId of appIds) appResults.push(await this.execute(appId, 'STOP'))
    return {
      success: appResults.every((item) => item.success),
      appResults,
    }
  }

  /**
   * 执行单 APP 动作并转换为结构化结果。
   *
   * @param {string} appId APP ID。
   * @param {'START'|'STOP'} action 动作。
   * @returns {Promise<object>} 逐 APP 结果。
   */
  async execute(appId, action) {
    try {
      const result =
        action === 'START'
          ? await this.appControl.AppStart(appId)
          : await this.appControl.AppStop(appId)
      return {
        appId,
        action,
        success: this.isSuccess(result),
        result,
      }
    } catch (error) {
      return { appId, action, success: false, message: error.message }
    }
  }

  /** @param {object} result KF 命令结果。 @returns {boolean} 是否成功。 */
  static isSuccessfulResult(result) {
    return Boolean(result && (result.cmdStatus === 2 || result.success === true))
  }
}

module.exports = { ReconcileService }
// end
