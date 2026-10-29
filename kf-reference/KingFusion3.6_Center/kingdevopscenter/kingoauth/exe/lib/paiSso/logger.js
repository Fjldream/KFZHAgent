"use strict";

/**
 * paiSso 模块日志：默认打印到 console；
 * oauth 可在 init 时注入其 logger（sink），保持与主服务日志一致。
 */

// modified by jinlong.feng at 2026-09-22 PAI门户Kafka单点登录
let sink = null;
// end

function setSink(nextSink) {
  sink = nextSink;
}

// modified by jinlong.feng at 2026-09-22 PAI门户Kafka单点登录
function log(level, message) {
  const text = "[paiSso] " + message;
  if (sink) {
    if (typeof sink[level] === "function") {
      sink[level](text);
      return;
    }
    if (typeof sink.log === "function") {
      sink.log(level, text);
      return;
    }
  }
  console.log(text);
}
// end

module.exports = { log, setSink };
