/**
 * 独立托管节点冗余前端构建产物，并为 Vue History 路由提供回退。
 *
 * 环境变量：
 * - KF_REDUNDANCY_UI_HOST：监听地址，默认 0.0.0.0。
 * - KF_REDUNDANCY_UI_PORT：监听端口，默认 12180。
 * - KF_REDUNDANCY_UI_DIST：构建产物目录，默认 ../dist。
 * - KF_REDUNDANCY_API_TARGET：运维中心地址，默认 http://127.0.0.1:12000。
 */
// modified by jinlong.feng at 0901 冗余功能开发
const fs = require("fs");
const http = require("http");
const net = require("net");
const path = require("path");

const host = process.env.KF_REDUNDANCY_UI_HOST || "0.0.0.0";
const port = Number(process.env.KF_REDUNDANCY_UI_PORT || 12180);
const apiTarget = new URL(
  process.env.KF_REDUNDANCY_API_TARGET || "http://127.0.0.1:12000",
);
const distDirectory = path.resolve(
  process.env.KF_REDUNDANCY_UI_DIST || path.join(__dirname, "..", "dist"),
);
const indexFile = path.join(distDirectory, "index.html");

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

/**
 * 将同源 API 请求转发至运维中心，并保留 KF 鉴权头和请求体。
 *
 * @param {http.IncomingMessage} request HTTP 请求。
 * @param {http.ServerResponse} response HTTP 响应。
 * @returns {void}
 */
function proxyApiRequest(request, response) {
  const upstreamRequest = http.request(
    {
      protocol: apiTarget.protocol,
      hostname: apiTarget.hostname,
      port: apiTarget.port,
      method: request.method,
      path: request.url,
      headers: { ...request.headers, host: apiTarget.host },
    },
    (upstreamResponse) => {
      response.writeHead(
        upstreamResponse.statusCode || 502,
        upstreamResponse.headers,
      );
      upstreamResponse.pipe(response);
    },
  );

  upstreamRequest.on("error", (error) => {
    console.error(`节点冗余 API 代理失败: ${error.message}`);
    if (!response.headersSent) {
      response.writeHead(502, {
        "Content-Type": "application/json; charset=utf-8",
      });
    }
    response.end(
      JSON.stringify({
        code: "REDUNDANCY_UPSTREAM_UNAVAILABLE",
        message: "无法连接运维中心",
        data: null,
      }),
    );
  });
  request.pipe(upstreamRequest);
}

/**
 * 将冗余全局 WebSocket 的 Upgrade 连接透明转发至运维中心。
 *
 * @param {http.IncomingMessage} request Upgrade 请求。
 * @param {import("net").Socket} clientSocket 浏览器连接。
 * @param {Buffer} head Upgrade 后已读取的数据。
 * @returns {void}
 */
function proxyWebSocket(request, clientSocket, head) {
  const targetPort = Number(apiTarget.port || 80);
  const upstreamSocket = net.connect(targetPort, apiTarget.hostname, () => {
    const headers = [];
    for (let index = 0; index < request.rawHeaders.length; index += 2) {
      const name = request.rawHeaders[index];
      const value =
        name.toLowerCase() === "host"
          ? apiTarget.host
          : request.rawHeaders[index + 1];
      headers.push(`${name}: ${value}`);
    }
    upstreamSocket.write(
      `${request.method} ${request.url} HTTP/${request.httpVersion}\r\n${headers.join("\r\n")}\r\n\r\n`,
    );
    if (head.length > 0) upstreamSocket.write(head);
    clientSocket.pipe(upstreamSocket).pipe(clientSocket);
  });

  upstreamSocket.on("error", (error) => {
    console.error(`节点冗余 WebSocket 代理失败: ${error.message}`);
    clientSocket.destroy();
  });
  clientSocket.on("error", () => upstreamSocket.destroy());
}

/**
 * 返回请求对应的静态文件；非静态前端路由统一回退到 index.html。
 *
 * @param {http.IncomingMessage} request HTTP 请求。
 * @param {http.ServerResponse} response HTTP 响应。
 * @returns {void}
 */
function serve(request, response) {
  const requestPath = decodeURIComponent(
    new URL(request.url, "http://localhost").pathname,
  );
  const isAuthRequest =
    requestPath === "/getPublicKey" || requestPath === "/login";
  if (requestPath.startsWith("/api/") || isAuthRequest) {
    proxyApiRequest(request, response);
    return;
  }
  const normalizedPath = path
    .normalize(requestPath)
    .replace(/^(\.\.(\/|\\|$))+/, "");
  const candidate = path.resolve(distDirectory, `.${normalizedPath}`);
  const isInsideDist =
    candidate === distDirectory ||
    candidate.startsWith(`${distDirectory}${path.sep}`);
  const staticFile =
    isInsideDist && fs.existsSync(candidate) && fs.statSync(candidate).isFile();
  const selectedFile = staticFile ? candidate : indexFile;

  fs.readFile(selectedFile, (error, body) => {
    if (error) {
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("节点冗余前端资源读取失败");
      return;
    }

    response.writeHead(200, {
      "Cache-Control":
        selectedFile === indexFile
          ? "no-cache"
          : "public, max-age=31536000, immutable",
      "Content-Type":
        contentTypes[path.extname(selectedFile)] || "application/octet-stream",
    });
    response.end(body);
  });
}

if (!fs.existsSync(indexFile)) {
  throw new Error(`节点冗余前端入口不存在: ${indexFile}`);
}

const server = http.createServer(serve);
server.on("upgrade", (request, socket, head) => {
  const requestPath = new URL(request.url, "http://localhost").pathname;
  if (requestPath !== "/api/v1/redundancy-ws") {
    socket.destroy();
    return;
  }
  proxyWebSocket(request, socket, head);
});
server.listen(port, host, () => {
  console.log(`节点冗余前端已启动: http://${host}:${port}`);
});
// end
