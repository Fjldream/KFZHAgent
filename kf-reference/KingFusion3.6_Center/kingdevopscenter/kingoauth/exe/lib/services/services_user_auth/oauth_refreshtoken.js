const db_redis = require(__DIR + "/lib/datasources/redis"),
  utils = require(__DIR + "/core/utils"),
  refreshtokenSaveSchema = require(__DIR + "/lib/services/services_user_auth/data_verify_model/refresh_token_info.json");
class OAuthRefreshToken {
  async getRefreshToken(n, t) {
    let o = db_redis.getClient(),
      s = db_redis.getRedisKey("refreshToken", n);
    if (!await o.exists(s).then(function(e) {
        return e !== 0
      }).catch()) {
      t(new Error(responseMsg.userAuth.REFRESH_TOKEN_NOT_FOUND), null);
      return
    }
    await o.hgetall(s).then(function(e) {
      return e ? (e.expires = new Date(Date.parse(e.expires)), e) : null
    }).then(function(e) {
      logger.log("info", "RefreshToken loaded."), t(null, {
        ...e,
        user: {
          ...e
        }
      })
    }).catch(function(e) {
      t(e, null)
    })
  }
  async saveRefreshToken(n, t, o, s, r) {
    let e = {};
    e.refreshToken = n, e.clientId = t, e.expires = o.toUTCString(), e.userId = parseInt(s.id || s.userId), e.tenantId = s.tenantId, e.userType = s.userType;
    let h = utils.jsonValidator.validate(e, refreshtokenSaveSchema);
    if (h && h.valid) {
      let i = db_redis.getClient(),
        u = db_redis.getRedisKey("refreshToken", n);
      if (await i.exists(u).then(function(l) {
          return l > 0
        })) return r(new Error(responseMsg.userAuth.REFRESH_TOKEN_EXIST, n));
      try {
        let l = [i.hset(u, "refreshToken", e.refreshToken), i.hset(u, "clientId", e.clientId), i.hset(u, "expires", e.expires), i.hset(u, "userId", e.userId), i.hset(u, "tenantId", e.tenantId), i.hset(u, "userType", e.userType)];
        return await Promise.all(l), r(null)
      } catch (l) {
        return r(l)
      }
    }
    return r(new Error(responseMsg.userAuth.REFRESH_TOKEN_TYPE_INVALID))
  }
  async revokeRefreshToken(n, t) {
    let o = db_redis.getClient(),
      s = db_redis.getRedisKey("refreshToken", n);
    try {
      let r = await o.del(s);
      if (typeof r == "number") return t(r ? null : responseMsg.userAuth.REFRESH_TOKEN_NOT_FOUND);
      throw r
    } catch (r) {
      return t(r)
    }
  }
}
module.exports = new OAuthRefreshToken;

// modified by jinlong.feng at 2026-09-30 PAI单点登录退出联动
module.exports = require(__DIR + "/lib/paiSso/sessions").wrapTokens(module.exports, "refreshToken");
// end
