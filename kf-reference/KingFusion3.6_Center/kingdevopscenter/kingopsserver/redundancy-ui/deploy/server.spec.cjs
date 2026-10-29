// modified by jinlong.feng at 0901 冗余功能开发
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return server.address().port;
}

async function waitUntilReady(url) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`测试服务未能启动: ${url}`);
}

async function requestUpgrade(port, pathName) {
  return new Promise((resolve, reject) => {
    const socket = net.connect(port, "127.0.0.1", () => {
      socket.write(
        `GET ${pathName} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n`,
      );
    });
    let response = "";
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      response += chunk;
      if (response.includes("\r\n\r\n")) {
        socket.destroy();
        resolve(response);
      }
    });
    socket.on("error", reject);
    socket.setTimeout(2000, () => {
      socket.destroy();
      reject(new Error("WebSocket Upgrade 响应超时"));
    });
  });
}

test("同源业务和登录请求均转发到 Center", async (context) => {
  const received = [];
  const upstream = http.createServer((request, response) => {
    received.push({
      url: request.url,
      authorization: request.headers.authorization,
    });
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ code: 0, message: "success", data: [] }));
  });
  const upstreamPort = await listen(upstream);
  context.after(() => upstream.close());

  const reservation = http.createServer();
  const uiPort = await listen(reservation);
  await new Promise((resolve) => reservation.close(resolve));

  const distDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "kf-redundancy-ui-"),
  );
  fs.writeFileSync(path.join(distDirectory, "index.html"), "<h1>preview</h1>");
  context.after(() =>
    fs.rmSync(distDirectory, { recursive: true, force: true }),
  );

  const child = spawn(process.execPath, [path.join(__dirname, "server.cjs")], {
    env: {
      ...process.env,
      KF_REDUNDANCY_UI_HOST: "127.0.0.1",
      KF_REDUNDANCY_UI_PORT: String(uiPort),
      KF_REDUNDANCY_UI_DIST: distDirectory,
      KF_REDUNDANCY_API_TARGET: `http://127.0.0.1:${upstreamPort}`,
    },
    stdio: "ignore",
  });
  context.after(() => child.kill());
  await waitUntilReady(`http://127.0.0.1:${uiPort}/`);

  const response = await fetch(
    `http://127.0.0.1:${uiPort}/api/v1/redundancies`,
    {
      headers: { Authorization: "Bearer integration-token" },
    },
  );

  assert.deepEqual(await response.json(), {
    code: 0,
    message: "success",
    data: [],
  });
  assert.equal(received[0].url, "/api/v1/redundancies");
  assert.equal(received[0].authorization, "Bearer integration-token");

  await fetch(`http://127.0.0.1:${uiPort}/getPublicKey`);
  assert.equal(received[1].url, "/getPublicKey");
});

test("同源冗余 WebSocket Upgrade 转发到 Center", async (context) => {
  let receivedPath = "";
  const upstream = http.createServer();
  upstream.on("upgrade", (request, socket) => {
    receivedPath = request.url;
    socket.end(
      "HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nX-Upstream: center\r\n\r\n",
    );
  });
  const upstreamPort = await listen(upstream);
  context.after(() => upstream.close());

  const reservation = http.createServer();
  const uiPort = await listen(reservation);
  await new Promise((resolve) => reservation.close(resolve));

  const distDirectory = fs.mkdtempSync(
    path.join(os.tmpdir(), "kf-redundancy-ui-"),
  );
  fs.writeFileSync(path.join(distDirectory, "index.html"), "<h1>preview</h1>");
  context.after(() =>
    fs.rmSync(distDirectory, { recursive: true, force: true }),
  );

  const child = spawn(process.execPath, [path.join(__dirname, "server.cjs")], {
    env: {
      ...process.env,
      KF_REDUNDANCY_UI_HOST: "127.0.0.1",
      KF_REDUNDANCY_UI_PORT: String(uiPort),
      KF_REDUNDANCY_UI_DIST: distDirectory,
      KF_REDUNDANCY_API_TARGET: `http://127.0.0.1:${upstreamPort}`,
    },
    stdio: "ignore",
  });
  context.after(() => child.kill());
  await waitUntilReady(`http://127.0.0.1:${uiPort}/`);

  const response = await requestUpgrade(
    uiPort,
    "/api/v1/redundancy-ws?access_token=integration-token",
  );

  assert.match(response, /^HTTP\/1\.1 101 Switching Protocols/m);
  assert.match(response, /X-Upstream: center/i);
  assert.equal(
    receivedPath,
    "/api/v1/redundancy-ws?access_token=integration-token",
  );
});
// end
