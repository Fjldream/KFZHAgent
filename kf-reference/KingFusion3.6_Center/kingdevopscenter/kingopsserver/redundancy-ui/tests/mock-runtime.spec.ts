// modified by jinlong.feng at 0901 冗余功能开发
import { describe, expect, it } from "vitest";
import { createMockRuntime } from "../src/demo/mock-runtime";

describe("冗余 Mock 运行时", () => {
  it("提供与设计稿一致的节点地址，并保留可用于新建的在线节点", async () => {
    const runtime = createMockRuntime();
    const nodes = await runtime.nodeCatalog.listNodes();

    expect(nodes.slice(0, 4).map((node) => node.nodeIp)).toEqual([
      "192.168.3.32",
      "192.168.3.33",
      "192.168.3.42",
      "192.168.3.43",
    ]);
    expect(nodes.find((node) => node.nodeId === "node-9")).toMatchObject({
      online: true,
    });
  });

  it("创建配置后把未生效配置加入列表，并保留两侧 APP 选择", async () => {
    const runtime = createMockRuntime();
    const before = await runtime.api.list();

    const created = await runtime.api.create({
      name: "冷备配置演示",
      primaryNodeId: "node-9",
      standbyNodeId: "node-10",
      initialActiveNodeId: "node-9",
      primaryAppIds: ["node-9-app-1", "node-9-app-2"],
      standbyAppIds: ["node-10-app-1"],
    });
    const after = await runtime.api.list();

    expect(after).toHaveLength(before.length + 1);
    expect(created).toMatchObject({
      name: "冷备配置演示",
      lifecycle: "DISABLED",
      healthStatus: "DISABLED",
      activeNodeId: null,
      primaryAppIds: ["node-9-app-1", "node-9-app-2"],
      standbyAppIds: ["node-10-app-1"],
    });
    expect(after.at(-1)?.redundancyId).toBe(created.redundancyId);
  });

  it("每次创建 Mock 运行时都从独立的初始数据开始", async () => {
    const first = createMockRuntime();
    await first.api.create({
      name: "临时配置",
      primaryNodeId: "node-9",
      standbyNodeId: "node-10",
      initialActiveNodeId: "node-9",
      primaryAppIds: ["node-9-app-1"],
      standbyAppIds: ["node-10-app-1"],
    });

    const second = createMockRuntime();

    expect(await second.api.list()).toHaveLength(4);
  });

  it("为修改 APP 页面保留未纳入冗余的候选 APP", async () => {
    const runtime = createMockRuntime();
    const candidates = await runtime.api.candidates("rd-1", "node-1");

    expect(candidates).toHaveLength(8);
    expect(candidates.filter((app) => app.selected)).toHaveLength(6);
  });
});
// end
