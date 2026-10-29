// modified by jinlong.feng at 0907 修复离线激活节点强制切换确认
import assert from "node:assert/strict";
import test from "node:test";

import * as redundancyUtils from "../src/utils/redundancyUtils.js";

const offlineSourceConfiguration = {
  activeNodeId: "node-primary",
  primaryNodeId: "node-primary",
  standbyNodeId: "node-standby",
  nodes: {
    primary: {
      nodeId: "node-primary",
      nodeName: "主节点",
      nodeIp: "192.168.3.32",
      online: false,
    },
    standby: {
      nodeId: "node-standby",
      nodeName: "从节点",
      nodeIp: "192.168.3.189",
      online: true,
    },
  },
};

test("离线激活节点确认双活风险后自动生成带固定原因的强制切换请求", () => {
  assert.equal(typeof redundancyUtils.createSwitchRequest, "function");

  assert.throws(
    () => redundancyUtils.createSwitchRequest(offlineSourceConfiguration),
    (error) => error.code === "REDUNDANCY_FORCE_CONFIRMATION_REQUIRED",
  );
  assert.deepEqual(
    redundancyUtils.createSwitchRequest(offlineSourceConfiguration, {
      riskAcknowledged: true,
    }),
    {
      targetNodeId: "node-standby",
      force: true,
      reason: "用户已确认强制切换",
    },
  );
});

test("在线激活节点生成普通切换请求且不要求强制原因", () => {
  const configuration = structuredClone(offlineSourceConfiguration);
  configuration.nodes.primary.online = true;

  assert.deepEqual(redundancyUtils.createSwitchRequest(configuration), {
    targetNodeId: "node-standby",
    force: false,
  });
});

test("接口明确返回停止时不被遗留的运行状态覆盖", () => {
  assert.equal(
    redundancyUtils.isAppRunning({
      running: false,
      appStatus: "running",
    }),
    false,
  );
  assert.equal(
    redundancyUtils.isAppRunning({
      running: true,
      appStatus: "stopped",
    }),
    true,
  );
  assert.equal(redundancyUtils.isAppRunning({ appStatus: "running" }), true);
  assert.equal(redundancyUtils.isAppRunning({ appStatus: 1 }), true);
});

test("冗余时间统一显示为补零的年月日时分秒", () => {
  const localTime = new Date(2026, 8, 9, 12, 0, 0);

  assert.equal(
    redundancyUtils.formatDateTime(localTime, "zh-CN"),
    "2026-09-09 12:00:00",
  );
  assert.equal(
    redundancyUtils.formatDateTime(localTime, "ja-JP"),
    "2026-09-09 12:00:00",
  );
});
// end
