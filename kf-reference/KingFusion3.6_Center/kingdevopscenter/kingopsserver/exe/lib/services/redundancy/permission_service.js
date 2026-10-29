// modified by jinlong.feng at 0901 冗余功能开发
'use strict'

const { ERROR_CODE, PERMISSION } = require('./constants')
const { RedundancyError } = require('./errors')

/**
 * 冗余权限校验边界，内网可替换 provider 而不修改业务服务。
 */
class PermissionService {
  /**
   * @param {{hasPermission: Function}} provider 权限提供器。
   */
  constructor(provider) {
    this.provider = provider
  }

  /**
   * 断言当前用户具有权限。
   *
   * @param {object} oauthInfo 登录用户信息。
   * @param {string} permission 权限点。
   * @returns {Promise<void>}
   */
  async assert(oauthInfo, permission) {
    const allowed = await Promise.resolve(this.provider.hasPermission(oauthInfo, permission))
    if (!allowed) {
      throw new RedundancyError(ERROR_CODE.PERMISSION_DENIED, '当前用户没有冗余功能操作权限', 403, {
        permission
      })
    }
  }
}

/**
 * 兼容当前产品 userType 的临时权限提供器。
 * 管理员类型 02/05 可维护，其他已登录用户仅可查看。
 */
class LegacyUserTypePermissionProvider {
  /**
   * @param {object} oauthInfo 登录用户信息。
   * @param {string} permission 权限点。
   * @returns {boolean} 是否允许。
   */
  hasPermission(oauthInfo, permission) {
    if (!oauthInfo) return false
    if (permission === PERMISSION.VIEW) {
      return Boolean(oauthInfo.userId || oauthInfo.userType)
    }
    return oauthInfo.userType === '02' || oauthInfo.userType === '05'
  }
}

module.exports = { PermissionService, LegacyUserTypePermissionProvider }
// end
