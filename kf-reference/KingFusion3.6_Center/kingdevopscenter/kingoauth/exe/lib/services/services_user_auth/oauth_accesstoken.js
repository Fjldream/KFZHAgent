const db_redis = require(__DIR + "/lib/datasources/redis"),
  utils = require(__DIR + "/core/utils"),
  tokenSaveSchema = require(__DIR + "/lib/services/services_user_auth/data_verify_model/access_token_info.json");
class OAuthAccessToken {
  async getAccessToken(u, s) {
    if (u != null) {
      let a = db_redis.getClient(),
        r = db_redis.getRedisKey("accessToken", u);
      if (!await a.exists(r).then(function(e) {
          return e !== 0
        }).catch()) return s(new Error(responseMsg.userAuth.ACCESS_TOKEN_NOT_FOUND), null);
      await a.hgetall(r).then(function(e) {
        return e ? (e.expires = new Date(Date.parse(e.expires)), e) : null
      }).then(function(e) {
        logger.log("info", "AccessToken loaded."), s(null, e)
      }).catch(function(e) {
        s(e, null)
      })
    }
  }
  async saveAccessToken(u, s, a, r, t) {
    let e = {};
    e.accessToken = u, e.clientId = s, e.expires = a.toUTCString(), e.userId = parseInt(r.id || r.userId), e.tenantId = r.tenantId, e.userType = r.userType;
    let l = utils.jsonValidator.validate(e, tokenSaveSchema);
    if (l && l.valid) {
      let n = db_redis.getClient(),
        i = db_redis.getRedisKey("accessToken", u);
      if (await n.exists(i).then(function(o) {
          return o > 0
        })) return t(new Error(responseMsg.userAuth.ACCESS_TOKEN_EXIST));
      try {
        let o = [n.hset(i, "accessToken", e.accessToken), n.hset(i, "clientId", e.clientId), n.hset(i, "expires", e.expires), n.hset(i, "userId", e.userId), n.hset(i, "tenantId", e.tenantId), n.hset(i, "userType", e.userType)];
        await Promise.all(o);
        let c = a.getTime(),
          d = Date.now(),
          h = Math.round((c - d) / 1e3);
        return n.expire(i, h), t(null)
      } catch (o) {
        return t(o)
      }
    }
    return t(new Error(responseMsg.userAuth.ACCESS_TOKEN_TYPE_INVALID))
  }
  async revokeAccessToken(u, s) {
    let a = db_redis.getClient(),
      r = db_redis.getRedisKey("accessToken", u);
    try {
      let t = await a.del(r);
      if (typeof t == "number") return s(t ? null : responseMsg.userAuth.ACCESS_TOKEN_NOT_FOUND);
      throw t
    } catch (t) {
      return s(t.message)
    }
  }
}
module.exports = new OAuthAccessToken;

// modified by jinlong.feng at 2026-09-30 PAI单点登录退出联动
module.exports = require(__DIR + "/lib/paiSso/sessions").wrapTokens(module.exports, "accessToken");
// end
