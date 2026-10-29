"use strict";

/**
 * PAI 换票前置中间件
 *
 * 用 PAI accessToken 经 Kafka 换票（paiSso 模块）拿到 jobId，
 * 再把 req.body 改写成现有换取链期望的入参 { unionType:"thirdUser", unionId: jobId }，
 * 随后复用 getThirdPartyTokenMiddleWare（按 unionId 查本地 isSSO=1 用户 -> 颁本系统 token）。
 *
 * 用法（routers/index.js）：
 *   router.post("/thirdParty/paiToken", ...paiTokenExchangeMiddleWare, ...userAuthCotroller.thirdParty.getThirdToken())
 */

const paiSso = require(__DIR + "/lib/paiSso");

// modified by jinlong.feng at 2026-09-22 PAI门户Kafka单点登录
function paiTokenExchange() {
  return async function(req, res, next) {
    const token = req.body && req.body.token;
    try {
      if (!token) {
        res.sendErr(400, "PAI token 缺失");
        return;
      }
      const jobId = await paiSso.getTokenByPaiToken(token);
      if (!jobId) {
        res.sendErr(400, "PAI 换票失败");
        return;
      }
      req.body = {
        unionType: "thirdUser",
        unionId: jobId
      };
      // modified by jinlong.feng at 2026-09-30 PAI单点登录退出联动
      const sessions = require(__DIR + "/lib/paiSso/sessions");
      const session = await sessions.begin(token, jobId);
      sessions.run(session, next);
      // end
    } catch (e) {
      res.sendErr(400, "PAI 换票失败：" + e.message);
    }
  };
}
module.exports = [paiTokenExchange()];
// end
