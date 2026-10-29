import type { WsMessage } from "../types/redundancy";

export type SocketState = "CONNECTING" | "OPEN" | "RECONNECTING" | "CLOSED";

export interface RedundancySocketOptions {
  getToken: () => string | null;
  onMessage: (message: WsMessage) => void;
  onStateChange?: (state: SocketState) => void;
  baseUrl?: string;
  WebSocketImpl?: typeof WebSocket;
  minReconnectMs?: number;
  maxReconnectMs?: number;
}

export class RedundancySocket {
  private socket: WebSocket | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryCount = 0;
  private manuallyClosed = false;

  constructor(private readonly options: RedundancySocketOptions) {}

  connect(): void {
    this.manuallyClosed = false;
    this.clearRetry();
    const token = this.options.getToken();
    if (!token) {
      this.options.onStateChange?.("CLOSED");
      return;
    }
    this.options.onStateChange?.(
      this.retryCount > 0 ? "RECONNECTING" : "CONNECTING",
    );
    const Socket = this.options.WebSocketImpl ?? WebSocket;
    this.socket = new Socket(this.createUrl(token));
    this.socket.onopen = () => {
      this.retryCount = 0;
      this.options.onStateChange?.("OPEN");
    };
    this.socket.onmessage = (event) => {
      try {
        this.options.onMessage(JSON.parse(String(event.data)) as WsMessage);
      } catch {
        // 忽略不符合协议的帧，保持连接并等待下一次服务端快照。
      }
    };
    this.socket.onclose = () => {
      this.socket = null;
      if (this.manuallyClosed) {
        this.options.onStateChange?.("CLOSED");
      } else {
        this.scheduleReconnect();
      }
    };
  }

  close(): void {
    this.manuallyClosed = true;
    this.clearRetry();
    this.socket?.close();
    this.socket = null;
    this.options.onStateChange?.("CLOSED");
  }

  private createUrl(token: string): string {
    const origin = this.options.baseUrl ?? window.location.origin;
    const url = new URL("/api/v1/redundancy-ws", origin);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("access_token", token);
    return url.toString();
  }

  private scheduleReconnect(): void {
    this.retryCount += 1;
    this.options.onStateChange?.("RECONNECTING");
    const minimum = this.options.minReconnectMs ?? 1000;
    const maximum = this.options.maxReconnectMs ?? 30000;
    const delay = Math.min(
      maximum,
      minimum * 2 ** Math.min(this.retryCount - 1, 5),
    );
    this.retryTimer = setTimeout(() => this.connect(), delay);
  }

  private clearRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }
}
