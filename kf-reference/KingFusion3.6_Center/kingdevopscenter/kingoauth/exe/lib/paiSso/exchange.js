"use strict";

/**
 * paiSso —— PAI 换票 request-reply 核心
 * 发出站主题 getToken 请求，按 correlationId 配对等待入站主题回包。
 * 主题与协议 path 均来自同目录 config.json。
 */

const config = require("./config.json");
const client = require("./client");
const logger = require("./logger");

const topics = config.topics;
const protocol = config.protocol;

// modified by jinlong.feng at 2026-09-22 PAI门户Kafka单点登录
// 在途请求表：correlationId -> { promise, resolve, reject, timer }。
// 同一 token 的并发换票请求合并为一次 Kafka 往返（复用同一 promise）。
const pendingMap = new Map();
// end

// PAI 退出广播监听者
const logoutListeners = [];

function onLogout(listener) {
  if (typeof listener === "function") {
    logoutListeners.push(listener);
  }
}

function parseMessage(rawValue) {
  if (rawValue === null || rawValue === undefined) {
    return null;
  }
  try {
    return JSON.parse(rawValue.toString());
  } catch (e) {
    return null;
  }
}

function extractJobId(message) {
  if (!message) {
    return null;
  }
  if (message.jobId) {
    return message.jobId;
  }
  if (Array.isArray(message.data) && message.data[0] && message.data[0].jobId) {
    return message.data[0].jobId;
  }
  return null;
}

/**
 * kafkajs consumer.run 的 eachMessage 回调入口
 */
function handleIncomingMessage(rawMessage, metadata) {
  const message = parseMessage(rawMessage && rawMessage.value);
  if (!message || typeof message !== "object") {
    return;
  }

  // modified by jinlong.feng at 2026-09-30 PAI单点登录退出联动
  if (message.path === protocol.logoutPath) {
    const pendingLogout = pendingMap.get(message.token);
    if (pendingLogout) pendingLogout.reject(new Error("PAI 会话已退出"));
    // 返回 Promise 给 eachMessage：Redis 删除失败必须让 Kafka 重试。
    return require("./sessions").logout(message.token, message.jobId).then(async function() {
      for (const listener of logoutListeners) await listener(message.token, message.jobId);
    });
  }
  // end

  const correlationId = message.correlationId;
  const pending = pendingMap.get(correlationId);
  if (!pending) {
    return;
  }

  const jobId = extractJobId(message);
  if (message.success && jobId) {
    pending.resolve(jobId);
  } else {
    pending.reject(new Error(message.msg || "PAI 换票失败"));
  }
}

/**
 * 用 PAI accessToken 换我方用户标识（jobId）
 * @param {string} accessToken PAI accessToken
 * @returns {Promise<string>} jobId（= username）
 */
function getTokenByPaiToken(accessToken) {
  if (!accessToken) {
    return Promise.reject(new Error("PAI token 缺失"));
  }

  const correlationId = accessToken;
  const existingPending = pendingMap.get(correlationId);
  if (existingPending) {
    return existingPending.promise;
  }

  const abortController = new AbortController();
  const pending = {};

  function settle(error, jobId) {
    if (pendingMap.get(correlationId) !== pending) {
      return;
    }
    clearTimeout(pending.timer);
    pendingMap.delete(correlationId);
    abortController.abort();
    if (error) {
      pending.rejectPromise(error);
    } else {
      pending.resolvePromise(jobId);
    }
  }

  pending.promise = new Promise(function(resolve, reject) {
    pending.resolvePromise = resolve;
    pending.rejectPromise = reject;
  });
  pending.resolve = function(jobId) {
    settle(null, jobId);
  };
  pending.reject = function(error) {
    settle(error);
  };
  pendingMap.set(correlationId, pending);
  pending.timer = setTimeout(function() {
    logger.log("error", "换取 PAI 用户信息超时（" + config.authTimeoutMs + "ms）");
    settle(new Error("PAI 换票超时"));
  }, config.authTimeoutMs);

  const request = {
    path: protocol.getTokenPath,
    name: protocol.getTokenName,
    paras: {
      token: accessToken
    },
    replyTo: topics.inbox,
    correlationId: correlationId
  };

  Promise.resolve()
    .then(function() {
      return client.send(topics.outbox, correlationId, request, abortController.signal);
    })
    .catch(function(error) {
      settle(error);
    });

  return pending.promise;
}

module.exports = {
  getTokenByPaiToken: getTokenByPaiToken,
  handleIncomingMessage: handleIncomingMessage,
  onLogout: onLogout
};
