"use strict";

/**
 * paiSso —— PAI 门户 Kafka SSO 模块（自包含）
 *
 * 对外接口：
 *   init(options)                启动模块（连接 consumer、订阅收件箱）
 *   getTokenByPaiToken(token)    PAI accessToken -> jobId
 *   onLogout(listener)           注册 PAI 退出广播回调
 *   destroy()                    关闭连接
 */

const logger = require("./logger");
const client = require("./client");
const exchange = require("./exchange");

let initialized = false;
let retryTimer = null;

function init(options) {
  if (options && options.logger) {
    logger.setSink(options.logger);
  }
  if (initialized) {
    return;
  }
  initialized = true;
  // modified by jinlong.feng at 2026-09-22 PAI门户Kafka单点登录
  logger.log("info", "PAI SSO init：启动收件箱消费者");
  // end
  startConsumer();
  // modified by jinlong.feng at 2026-09-22 PAI门户Kafka单点登录
  // 预连接 producer：避免 oauth 启动后首次换票现等 Kafka 建连（实测约 10s）。
  warmUpProducer();
  // end
}

// modified by jinlong.feng at 2026-09-22 PAI门户Kafka单点登录
function warmUpProducer() {
  client
    .ensureProducer()
    .then(function () {
      logger.log("info", "producer 预热完成");
    })
    .catch(function (e) {
      // 预热失败不影响启动：首次请求时 ensureProducer 会再试一次
      logger.log("error", "producer 预热失败（首次换票时会重试）：" + (e && e.message));
    });
}
// end

function startConsumer() {
  client
    .startConsumer(exchange.handleIncomingMessage)
    .then(function () {
      // modified by jinlong.feng at 2026-09-22 PAI门户Kafka单点登录
      logger.log("info", "consumer 启动调用已返回；分区就绪以 consumer.group_join 日志为准");
      // end
    })
    .catch(function (e) {
      // 容错：Kafka 未就绪不能拖垮 oauth，10s 后重试
      logger.log("error", "paiSso consumer 启动失败：" + e.message + "，10s 后重试");
      initialized = false;
      retryTimer = setTimeout(startConsumer, 10000);
    });
}

// modified by jinlong.feng at 2026-09-22 PAI门户Kafka单点登录
function getTokenByPaiToken(accessToken) {
  return exchange.getTokenByPaiToken(accessToken);
}
// end

function onLogout(listener) {
  exchange.onLogout(listener);
}

async function destroy() {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  initialized = false;
  await client.disconnect();
}

module.exports = {
  init: init,
  getTokenByPaiToken: getTokenByPaiToken,
  onLogout: onLogout,
  destroy: destroy
};
