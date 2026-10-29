import type { NodeCandidate } from "../types/redundancy";
import { RedundancyHttpClient } from "./http-client";

export interface NodeCatalog {
  listNodes(): Promise<NodeCandidate[]>;
}

export class KfNodeCatalog implements NodeCatalog {
  constructor(private readonly http: RedundancyHttpClient) {}

  async listNodes(): Promise<NodeCandidate[]> {
    const result = await this.http.request<unknown[]>({
      method: "GET",
      url: "/nodes/list",
    });
    return result.map((node) => normalizeNode(node as Record<string, unknown>));
  }
}

function normalizeNode(node: Record<string, unknown>): NodeCandidate {
  const read = (method: string, field: string) => {
    const candidate = node[method];
    return typeof candidate === "function" ? candidate.call(node) : node[field];
  };
  const status = read("getNodeStatus", "nodeStatus");
  return {
    nodeId: String(read("getNodeId", "nodeId") ?? ""),
    nodeName: String(
      read("getNodeName", "nodeName") ?? read("getName", "name") ?? "",
    ),
    nodeIp: String(
      read("getNodeIp", "nodeIp") ??
        read("getAddress", "address") ??
        read("getIp", "ip") ??
        "",
    ),
    online: status === "running" || status === 1 || status === true,
  };
}
