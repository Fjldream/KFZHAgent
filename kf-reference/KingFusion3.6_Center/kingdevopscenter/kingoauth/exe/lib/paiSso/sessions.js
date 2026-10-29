// modified by jinlong.feng at 2026-09-30 PAI单点登录退出联动
"use strict";
const crypto = require("crypto");
const {
  AsyncLocalStorage
} = require("async_hooks");
const redis = require(__DIR + "/lib/datasources/redis");
const context = new AsyncLocalStorage();

function digest(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function prefix() {
  return redis.getRedisKey("tokenRef", "pai-sso-v1") + ":";
}

function sessionKey(sessionId) {
  return prefix() + "session:" + sessionId;
}

function userKey(username) {
  return prefix() + "user:" + digest(username);
}

function client() {
  const value = redis.getClient();
  if (!value) throw new Error("PAI 会话存储尚未就绪");
  return value;
}

function report(event, details) {
  try {
    console.log("[PAI-SSO] " + JSON.stringify({
      time: new Date().toISOString(),
      component: "session",
      event,
      details
    }));
  } catch (_) {
    /* 日志不能影响认证。 */ }
}

function revokedError() {
  const error = new Error("PAI 会话已退出，请从门户重新登录");
  error.code = "PAI_SESSION_REVOKED";
  return error;
}
async function assertActive(sessionId, allowMissing) {
  const key = sessionKey(sessionId);
  if (await client().hget(key, "revoked") === "1") throw revokedError();
  // 已签发的 PAI 票若丢失关联记录，也必须拒绝，不能退回普通票据验证。
  if (!allowMissing && !await client().hget(key, "username")) throw revokedError();
}
async function begin(token, username) {
  const sessionId = digest(token);
  await assertActive(sessionId, true);
  const existingUsername = await client().hget(sessionKey(sessionId), "username");
  if (existingUsername && existingUsername !== String(username)) throw new Error("PAI 会话用户不一致");
  // 不写 revoked=0，注销先于登录时，迟到的登录绝不能覆盖注销标记。
  await client().hset(sessionKey(sessionId), "username", String(username));
  await client().sadd(userKey(username), sessionId);
  await assertActive(sessionId);
  return {
    sessionId,
    username: String(username)
  };
}
async function register(session, type, token, user) {
  await assertActive(session.sessionId);
  const key = sessionKey(session.sessionId);
  const tenantId = String(user.tenantId);
  const existingTenant = await client().hget(key, "tenantId");
  if (existingTenant && existingTenant !== tenantId) throw new Error("PAI 会话租户不一致");
  await client().hset(key, "tenantId", tenantId);
  await client().hset(key, type + ":" + token, "1");
  await assertActive(session.sessionId);
}
async function deleteToken(type, token) {
  await client().del(redis.getRedisKey(type, token));
  if (type === "accessToken") await client().del(redis.getRedisKey("tokenRef", token));
}
async function revokeSession(sessionId) {
  const key = sessionKey(sessionId);
  // 先持久化撤销标记。失败抛给 Kafka，不将广播当作已成功处理。
  // 标记不设置 TTL：PAI 未承诺 token 的最长寿命，不能超时后重新接受旧票。
  await client().hset(key, "revoked", "1");
  const records = await client().hgetall(key) || {};
  let count = 0;
  for (const field of Object.keys(records)) {
    const separator = field.indexOf(":");
    const type = field.slice(0, separator);
    if (type !== "accessToken" && type !== "refreshToken") continue;
    await deleteToken(type, field.slice(separator + 1));
    await client().hdel(key, field);
    count++;
  }
  if (records.username) await client().srem(userKey(records.username), sessionId);
  // 仅完成全部删除后移除用户名索引，失败重试仍能找到未处理完的会话。
  report("logout.session_revoked", {
    sessionRef: sessionId.slice(0, 12),
    tokenCount: count
  });
}
async function logout(token, username) {
  report("logout.received", { hasToken: typeof token === "string" && Boolean(token), username });
  if (typeof token === "string" && token) {
    await revokeSession(digest(token));
    return;
  }
  if (typeof username !== "string" || !username) throw new Error("PAI 退出广播缺少 token 和 jobId");
  const sessions = await client().smembers(userKey(username));
  const records = await Promise.all(sessions.map(id => client().hgetall(sessionKey(id))));
  const tenants = new Set(records.filter(Boolean).map(item => item.tenantId).filter(Boolean));
  // jobId 没带租户，出现歧义时不能误删别的租户。要求重发带 token 的广播。
  if (tenants.size > 1) throw new Error("PAI jobId 对应多个租户，退出广播必须携带 token");
  for (const sessionId of sessions) await revokeSession(sessionId);
  report("logout.username_fallback", {
    username,
    sessionCount: sessions.length
  });
}

function run(session, callback) {
  return context.run(session, callback);
}

function sessionFor(user) {
  return user && user.paiSessionId ? {
    sessionId: user.paiSessionId
  } : context.getStore();
}

function wrapTokens(model, type) {
  const suffix = type === "accessToken" ? "AccessToken" : "RefreshToken";
  const getOriginal = model["get" + suffix];
  const saveOriginal = model["save" + suffix];
  model["get" + suffix] = function(token, callback) {
    return getOriginal.call(this, token, function(error, record) {
      if (error || !record || !record.paiSessionId) return callback(error, record);
      assertActive(record.paiSessionId).then(() => callback(null, record), error => callback(error, null));
    });
  };
  model["save" + suffix] = function(token, clientId, expires, user, callback) {
    const session = sessionFor(user);
    if (!session) return saveOriginal.apply(this, arguments);
    const receiver = this;
    let tokenWriteStarted = false;
    (async function() {
      if (await client().exists(redis.getRedisKey(type, token))) throw new Error("OAuth token 已存在");
      await register(session, type, token, user);
      tokenWriteStarted = true;
      await new Promise((resolve, reject) => {
        Promise.resolve(saveOriginal.call(receiver, token, clientId, expires, user, error => error ? reject(error) : resolve())).catch(reject);
      });
      await client().hset(redis.getRedisKey(type, token), "paiSessionId", session.sessionId);
      await assertActive(session.sessionId);
      report("session.token_registered", {
        sessionRef: session.sessionId.slice(0, 12),
        type,
        tenantId: user.tenantId
      });
    })().then(() => callback(null), async error => {
      // 包括“撤销发生在原 save 的写入中”的情况；失败仍保留会话内票据索引供重试。
      try {
        if (tokenWriteStarted) await deleteToken(type, token);
      } catch (cleanupError) {
        report("session.cleanup_failed", {
          message: cleanupError.message
        });
      }
      callback(error);
    });
  };
  return model;
}
module.exports = {
  begin,
  run,
  logout,
  assertActive,
  wrapTokens
};
// end
