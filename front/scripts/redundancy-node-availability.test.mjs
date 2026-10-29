// modified by jinlong.feng at 20260914 冗余功能-新建配置禁用已占用节点
import assert from "node:assert/strict";
import test from "node:test";

const configurations = [
  {
    redundancyId: "redundancy-1",
    primaryNodeId: "node-1",
    standbyNodeId: "node-2",
  },
  {
    redundancyId: "redundancy-2",
    primaryNodeId: "node-3",
    standbyNodeId: "node-4",
  },
];

test("新建冗余配置时全部已配置节点均不可选择", async () => {
  const utils = await import("../src/utils/redundancyUtils.js");

  assert.equal(typeof utils.getOccupiedRedundancyNodeIds, "function");
  assert.deepEqual(
    [...utils.getOccupiedRedundancyNodeIds(configurations)].sort(),
    ["node-1", "node-2", "node-3", "node-4"],
  );
});

test("编辑冗余配置时当前配置节点仍可选择", async () => {
  const utils = await import("../src/utils/redundancyUtils.js");

  assert.equal(typeof utils.getOccupiedRedundancyNodeIds, "function");
  assert.deepEqual(
    [
      ...utils.getOccupiedRedundancyNodeIds(
        configurations,
        "redundancy-1",
      ),
    ].sort(),
    ["node-3", "node-4"],
  );
});
// end modified by jinlong.feng at 20260914 冗余功能-新建配置禁用已占用节点
