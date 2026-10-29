// modified by jinlong.feng at 20260914 冗余功能-计算运行态订阅当前异常事件
const WebSocketClient = require("ws");

const REDUNDANCY_TENANT_ID = "c7f1771f-0c8f-4c75-9d71-3b8c4b6bd190";
const REDUNDANCY_TIMEZONE_OFFSET_MS = 8 * 60 * 60 * 1000;

class RedundancyMessageSubscription {
    constructor() {
        this.callbacks = new Map();
        this.openEvents = new Map();
        this.socket = null;
        this.retryTimer = null;
        this.retryCount = 0;
        this.subscriptionSequence = 0;
        this.snapshotReceived = false;
        this.snapshotSentAt = null;
        this.pendingEventMessages = [];
    }

    subscribe(callback) {
        if (typeof callback !== "function") {
            this.log("error", "SubscribeRedundancyMessage callback must be a function");
            return null;
        }
        const subscriptionId = `redundancy-subscription-${Date.now()}-${++this.subscriptionSequence}`;
        this.callbacks.set(subscriptionId, callback);
        if (this.snapshotReceived) this.notify(callback, this.createSnapshotMessage());
        if (!this.socket && !this.retryTimer) this.connect();
        return subscriptionId;
    }

    unsubscribe(subscriptionId) {
        const removed = this.callbacks.delete(subscriptionId);
        if (this.callbacks.size === 0) this.stop();
        return removed;
    }

    connect() {
        if (this.callbacks.size === 0 || this.socket) return;
        let url;
        try {
            this.invalidateSnapshot();
            url = this.createUrl();
            const socket = new WebSocketClient(url, {
                rejectUnauthorized: false,
                handshakeTimeout: 10000,
            });
            this.socket = socket;
            socket.on("open", () => {
                this.log("debug", "redundancy websocket connect success");
            });
            socket.on("message", (data) => {
                if (this.socket === socket) this.handleMessage(data);
            });
            socket.on("error", (error) => {
                this.log("error", `redundancy websocket error: ${error.message}`);
            });
            socket.on("close", (code) => {
                if (this.socket !== socket) return;
                this.socket = null;
                this.invalidateSnapshot();
                this.log("debug", `redundancy websocket closed: ${code}`);
                if (this.callbacks.size > 0 && Number(code) !== 4403) this.scheduleReconnect();
            });
        } catch (error) {
            this.socket = null;
            this.invalidateSnapshot();
            this.log("error", `redundancy websocket connect failed: ${error.message}`);
            this.scheduleReconnect();
        }
    }

    createUrl() {
        const gatewayHost = global.newInfo && global.newInfo.kingGateWay
            ? global.newInfo.kingGateWay.host
            : "";
        const token = typeof global.getToken === "function" ? global.getToken() : global.token;
        if (!gatewayHost) throw new Error("kingGateWay host is missing");
        if (typeof token !== "string" || token.length === 0) throw new Error("access token is missing");
        const url = new URL(gatewayHost);
        url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
        url.pathname = "/opscenter/api/v1/redundancy-ws";
        url.search = "";
        url.hash = "";
        url.searchParams.set("access_token", token);
        url.searchParams.set("tenantId", REDUNDANCY_TENANT_ID);
        return url.toString();
    }

    handleMessage(data) {
        let message;
        try {
            message = JSON.parse(String(data));
        } catch (error) {
            this.log("error", `ignore invalid redundancy websocket message: ${error.message}`);
            return;
        }
        if (message.type === "REDUNDANCY_SNAPSHOT") {
            const openEvents = message.payload && Array.isArray(message.payload.openEvents)
                ? message.payload.openEvents.filter((event) => event && event.status === "OPEN")
                : [];
            this.openEvents.clear();
            for (const event of openEvents) {
                this.applyEventChange(event);
            }
            this.snapshotSentAt = this.formatTime(message.sentAt || new Date());
            for (const pendingMessage of this.pendingEventMessages) {
                this.applyEventChange(pendingMessage.payload);
                this.snapshotSentAt = pendingMessage.sentAt || this.snapshotSentAt;
            }
            this.pendingEventMessages = [];
            this.snapshotReceived = true;
            this.retryCount = 0;
            this.dispatch(this.createSnapshotMessage());
            return;
        }
        if (message.type !== "REDUNDANCY_EVENT_CHANGED" || !message.payload) return;
        const event = message.payload;
        const sentAt = this.formatTime(message.sentAt || new Date());
        if (!this.snapshotReceived) {
            this.pendingEventMessages.push({ payload: this.clone(event), sentAt });
            return;
        }
        const publicEvent = this.applyEventChange(event);
        if (!publicEvent) return;
        this.snapshotSentAt = sentAt;
        this.dispatch({
            type: "REDUNDANCY_EVENT_CHANGED",
            payload: publicEvent,
            sentAt,
        });
    }

    applyEventChange(event) {
        if (!event || !event.eventId) return null;
        const publicEvent = this.createPublicEvent(event);
        if (event.status === "OPEN") this.openEvents.set(event.eventId, publicEvent);
        else this.openEvents.delete(event.eventId);
        return publicEvent;
    }

    createPublicEvent(event) {
        const detail = event.detail && typeof event.detail === "object" ? event.detail : {};
        return {
            eventId: event.eventId || null,
            redundancyId: event.redundancyId || null,
            redundancyName: event.redundancyName || null,
            status: event.status || null,
            eventType: event.eventType || event.reasonCode || null,
            severity: event.severity || null,
            nodeName: detail.nodeName || event.nodeName || null,
            appName: detail.appName || event.appName || null,
            message: event.summary || event.message || null,
            occurredAt: this.formatTime(event.occurredAt || event.openedAt),
            recoveredAt: this.formatTime(event.recoveredAt),
        };
    }

    formatTime(value) {
        if (!value) return null;
        const timestamp = new Date(value).getTime();
        if (!Number.isFinite(timestamp)) return null;
        return new Date(timestamp + REDUNDANCY_TIMEZONE_OFFSET_MS)
            .toISOString()
            .slice(0, 19)
            .replace("T", " ");
    }

    createSnapshotMessage() {
        return {
            type: "REDUNDANCY_EVENT_SNAPSHOT",
            payload: Array.from(this.openEvents.values()),
            sentAt: this.snapshotSentAt,
        };
    }

    dispatch(message) {
        for (const callback of Array.from(this.callbacks.values())) this.notify(callback, message);
    }

    notify(callback, message) {
        try {
            const result = callback(this.clone(message));
            if (result && typeof result.catch === "function") {
                result.catch((error) => this.log("error", `redundancy subscriber failed: ${error.message}`));
            }
        } catch (error) {
            this.log("error", `redundancy subscriber failed: ${error.message}`);
        }
    }

    clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    invalidateSnapshot() {
        this.openEvents.clear();
        this.snapshotReceived = false;
        this.snapshotSentAt = null;
        this.pendingEventMessages = [];
    }

    scheduleReconnect() {
        if (this.callbacks.size === 0 || this.retryTimer) return;
        const delay = Math.min(30000, 1000 * 2 ** Math.min(this.retryCount, 5));
        this.retryCount += 1;
        this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            this.connect();
        }, delay);
    }

    stop() {
        if (this.retryTimer) clearTimeout(this.retryTimer);
        this.retryTimer = null;
        const socket = this.socket;
        this.socket = null;
        if (socket && socket.readyState !== 3) socket.close();
        this.invalidateSnapshot();
        this.retryCount = 0;
    }

    log(level, message) {
        if (global.logger && typeof global.logger.log === "function") global.logger.log(level, message);
    }
}

const redundancyMessageSubscription = new RedundancyMessageSubscription();
global.SubscribeRedundancyMessage = function (callback) {
    return redundancyMessageSubscription.subscribe(callback);
};
global.UnsubscribeRedundancyMessage = function (subscriptionId) {
    return redundancyMessageSubscription.unsubscribe(subscriptionId);
};
// end modified by jinlong.feng at 20260914 冗余功能-计算运行态订阅当前异常事件
