// modified by jinlong.feng at 0901 冗余功能开发
/**
 * 节点冗余全局 WebSocket 客户端。
 * 连接断开后使用指数退避持续重连，首次连接与每次重连均由服务端推送完整快照。
 */
export class RedundancySocket {
  constructor({ getToken, onMessage, onStateChange }) {
    this.getToken = getToken;
    this.onMessage = onMessage;
    this.onStateChange = onStateChange;
    this.socket = null;
    this.timer = null;
    this.retryCount = 0;
    this.closed = true;
  }

  /** 建立实时连接。 */
  connect() {
    if (this.socket || !this.closed) return;
    const token = this.getToken();
    if (!token) return;
    this.closed = false;
    this.onStateChange(this.retryCount ? "RECONNECTING" : "CONNECTING");
    const proxyPrefix = String(import.meta.env.VITE_PROXY_DOMAIN || "").replace(
      /\/$/,
      "",
    );
    const url = new URL(
      `${proxyPrefix}/api/v1/redundancy-ws`,
      window.location.origin,
    );
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("access_token", token);
    this.socket = new WebSocket(url);
    this.socket.onopen = () => {
      this.retryCount = 0;
      this.onStateChange("OPEN");
    };
    this.socket.onmessage = ({ data }) => {
      try {
        this.onMessage(JSON.parse(String(data)));
      } catch {
        // 忽略无法识别的帧，连接保持可用并等待下一条服务端消息。
      }
    };
    this.socket.onclose = (event) => {
      this.socket = null;
      if (!this.closed) {
        this.logUnexpectedClose(event, this.retryCount);
        this.scheduleReconnect();
      }
    };
    this.socket.onerror = () => this.socket?.close();
  }

  /**
   * 记录非主动关闭的诊断信息，避免在日志中暴露带 token 的连接地址。
   *
   * @param {CloseEvent} event WebSocket 关闭事件。
   * @param {number} retryCount 当前已执行的重连次数。
   * @returns {void}
   */
  logUnexpectedClose(event, retryCount) {
    console.warn("[redundancy-ws] unexpected connection close", {
      code: event.code,
      reason: event.reason || "NO_REASON",
      wasClean: event.wasClean,
      retryCount,
      path: `${String(import.meta.env.VITE_PROXY_DOMAIN || "").replace(
        /\/$/,
        "",
      )}/api/v1/redundancy-ws`,
    });
  }

  /** 主动关闭连接并取消后续重连。 */
  close() {
    this.closed = true;
    clearTimeout(this.timer);
    this.timer = null;
    this.socket?.close();
    this.socket = null;
    this.onStateChange("CLOSED");
  }

  /** 按 1~30 秒指数退避重新连接。 */
  scheduleReconnect() {
    this.closed = false;
    this.retryCount += 1;
    this.onStateChange("RECONNECTING");
    const delay = Math.min(30000, 1000 * 2 ** Math.min(this.retryCount - 1, 5));
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.closed = true;
      this.connect();
    }, delay);
  }
}
// end
