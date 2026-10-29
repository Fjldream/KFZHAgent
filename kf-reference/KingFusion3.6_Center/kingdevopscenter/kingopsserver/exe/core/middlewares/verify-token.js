const { auth, resHandler } = require('../util'),
  UserAuthentic = require(__dir + '/lib/services/interface/user_authentic_interface'),
  whiteList = [
    '/apps/cmd/list',
    '/apps/cmd/result',
    '/apps/performance',
    '/apps/status',
    '/balancer/status',
    '/heartbeat',
    '/nodes/list',
    '/oemConfig',
    '/sdlogin',
  ],
  whiteListSet = new Set(whiteList)

// modified by jinlong.feng at 0901 冗余功能开发
const { isNodeRuntimePath } = require(__dir + '/lib/services/redundancy/node_runtime_service')
// end

module.exports = async (r, s, o) => {
  try {
    let a = r.path
    // modified by jinlong.feng at 0901 冗余功能开发
    if (whiteListSet.has(a) || isNodeRuntimePath(a)) o()
    // end
    else {
      let t = auth.getBearerToken(r)
      if (!t) {
        const e = resHandler.getErrorRes('TOKEN_IS_MISSING')
        s.sendErr(e.code, e.msg)
      }
      await UserAuthentic.checkUserTokenIsValid(t)
        .then((e) => {
          ;((r.oauthInfo = {
            tenantId: e.oauth.tenantId,
            userId: Number(e.oauth.userId),
            userType: e.oauth.userType,
          }),
            o())
        })
        .catch((e) => {
          const n = resHandler.getErrorRes('TOKEN_IS_INVALID')
          s.sendErr(n.code, n.msg, 401)
        })
    }
  } catch (a) {
    const t = resHandler.getErrorMsg(a)
    s.sendErr(t)
  }
}
