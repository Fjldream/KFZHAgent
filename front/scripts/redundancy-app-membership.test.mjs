// modified by jinlong.feng at 20260914 冗余功能-APP列表两侧同时提交
import assert from "node:assert/strict";
import test from "node:test";

test("APP 管理同时保留主从节点草稿并生成一次提交的两侧变更", async () => {
  const utils = await import("../src/utils/redundancyUtils.js");

  assert.equal(typeof utils.createAppSelectionDrafts, "function");
  assert.equal(typeof utils.buildAppMembershipChanges, "function");

  const configuration = {
    primaryNodeId: "node-primary",
    standbyNodeId: "node-standby",
    primaryAppIds: ["app-primary-1"],
    standbyAppIds: ["app-standby-1"],
  };
  const drafts = utils.createAppSelectionDrafts(configuration);
  drafts.primary.push("app-primary-2");
  drafts.standby.splice(0, 1, "app-standby-2");

  assert.deepEqual(
    utils.buildAppMembershipChanges(configuration, drafts),
    [
      {
        nodeId: "node-primary",
        addAppIds: ["app-primary-2"],
        removeAppIds: [],
      },
      {
        nodeId: "node-standby",
        addAppIds: ["app-standby-2"],
        removeAppIds: ["app-standby-1"],
      },
    ],
  );
  assert.deepEqual(configuration.primaryAppIds, ["app-primary-1"]);
  assert.deepEqual(configuration.standbyAppIds, ["app-standby-1"]);
});
// end modified by jinlong.feng at 20260914 冗余功能-APP列表两侧同时提交
