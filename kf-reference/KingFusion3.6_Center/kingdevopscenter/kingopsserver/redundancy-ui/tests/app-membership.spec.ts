import { describe, expect, it } from "vitest";
import type { RedundancyConfigDetail } from "../src/modules/redundancy/types/redundancy";
import {
  buildAppMembershipChanges,
  hasAppMembershipChanges,
} from "../src/modules/redundancy/utils/app-membership";

const configuration = {
  primaryNodeId: "node-1",
  standbyNodeId: "node-2",
  primaryAppIds: ["p-1", "p-2"],
  standbyAppIds: ["s-1"],
} as RedundancyConfigDetail;

describe("APP 成员差量", () => {
  it("把两侧完整选择结果转换为节点增删差量", () => {
    const changes = buildAppMembershipChanges(
      configuration,
      ["p-2", "p-3"],
      ["s-1", "s-2"],
    );

    expect(changes).toEqual([
      { nodeId: "node-1", addAppIds: ["p-3"], removeAppIds: ["p-1"] },
      { nodeId: "node-2", addAppIds: ["s-2"], removeAppIds: [] },
    ]);
    expect(hasAppMembershipChanges(changes)).toBe(true);
  });

  it("识别没有实际变化的提交", () => {
    const changes = buildAppMembershipChanges(
      configuration,
      ["p-1", "p-2"],
      ["s-1"],
    );

    expect(hasAppMembershipChanges(changes)).toBe(false);
  });
});
