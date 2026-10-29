"use strict";

/**
 * PAI 门户 Kafka SSO —— 运行态换票（新开链路）
 *
 * 用 PAI accessToken 调 oauth 服务 /thirdParty/paiToken，
 * 由 oauth 内部走 Kafka 换票（拿 jobId）并颁本系统 token。
 * 与现有 thirdTokenLogin 链路互不影响。
 */

const request = require("request");
const { oauth } = require("../../../config/config_server.json");

// modified by jinlong.feng at 2026-09-22 PAI门户Kafka单点登录
function paiTokenLogin(params, callback) {
  const token = params && params.token;
  if (!token) {
    callback({ status: 400, msg: "PAI token 缺失" }, null);
    return;
  }
  const options = {
    url: encodeURI(`http://${oauth.ip}:${oauth.port}/thirdParty/paiToken`),
    method: "POST", json: true,
    headers: { "Content-Type": "application/json" },
    body: { token: token }
  };
  request(options, (err, resp, body) => {
    if (err) {
      callback(err, null);
      return;
    }
    callback(null, JSON.stringify(body));
  });
}
module.exports = paiTokenLogin;
// end
