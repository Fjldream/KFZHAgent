export const useWebSocketClient = ({ url, options = {}, connectCallback }) => {
  const { MAX_RETRIES = 5, RETRY_DELAY = 3000, HEARTBEAT_INTECARVAL = 2000 } = options;
  const isConnected = ref(false);
  const retryCount = ref(0);
  const isFirstConnect = ref(true);
  // 判断是否为前端主动关闭
  const isClosed = ref(false);
  const socket = ref();
  let heartbeatTimer = null;
  let messageCallback = null;

  const connect = (connectSuccess) => {
    if (socket.value && socket.value.readyState === WebSocket.OPEN) {
      return;
    }
    cleanupSocket();
    socket.value = new WebSocket(url);
    socket.value.onopen = () => {
      connectCallback(!isFirstConnect.value);
      isConnected.value = true;
      retryCount.value = 0;
      connectSuccess && connectSuccess(true);
      startHeartbeat();
      isFirstConnect.value = false;
    };
    socket.value.onmessage = (event) => {
      try {
        messageCallback?.(event.data);
      } catch (e) {
        messageCallback?.(e);
      }
    };
    socket.value.onerror = (e) => {
      reconnect();
    };
    socket.value.onclose = () => {
      if (!isClosed.value) {
        isConnected.value = false;
        reconnect();
      }
    };
  };
  const send = (message) => {
    if (socket.value?.readyState === WebSocket.OPEN) {
      socket.value.send(message);
    }
  };
  const startHeartbeat = () => {
    heartbeatTimer = setInterval(() => {
      if (isConnected.value) {
        send('ping');
      }
    }, HEARTBEAT_INTECARVAL);
  };
  const reconnect = () => {
    if (retryCount.value < MAX_RETRIES) {
      retryCount.value++;
      setTimeout(() => {
        connect();
      }, RETRY_DELAY);
    } else {
      messageCallback?.(JSON.stringify({ reconnected: false }));
    }
  };
  const stopHeartbeat = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };
  const cleanupSocket = () => {
    if (socket.value) {
      socket.value.onmessage = null;
      socket.value.onerror = null;
      socket.value.onopen = null;
      socket.value.onclose = null;
      socket.value.close();
      socket.value = null;
    }
    stopHeartbeat();
  };
  const onMessage = (callbacl) => {
    messageCallback = callbacl;
  };
  return {
    socket,
    isConnected,
    connect,
    send,
    onMessage,
    cleanupSocket,
  };
};
