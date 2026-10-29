import { describe, expect, it, vi } from "vitest";
import { KfNodeCatalog } from "../src/modules/redundancy/api/node-catalog";
import type { RedundancyHttpClient } from "../src/modules/redundancy/api/http-client";

describe("KF node catalog", () => {
  it.each([
    ["running", true],
    [1, true],
    [true, true],
    [0, false],
    ["0", false],
    ["stopped", false],
  ])("normalizes node status %s to online=%s", async (status, online) => {
    const http = {
      request: vi.fn().mockResolvedValue([
        {
          nodeId: "node-1",
          nodeName: "节点1",
          address: "192.168.3.32",
          nodeStatus: status,
        },
      ]),
    } as unknown as RedundancyHttpClient;

    await expect(new KfNodeCatalog(http).listNodes()).resolves.toMatchObject([
      {
        nodeId: "node-1",
        nodeName: "节点1",
        nodeIp: "192.168.3.32",
        online,
      },
    ]);
  });
});
