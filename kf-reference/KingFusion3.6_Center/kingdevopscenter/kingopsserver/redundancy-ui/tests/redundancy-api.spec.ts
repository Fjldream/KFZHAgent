// modified by jinlong.feng at 0901 冗余功能开发
import { describe, expect, it, vi } from "vitest";
import type { AxiosInstance } from "axios";
import {
  RedundancyApiError,
  RedundancyHttpClient,
} from "../src/modules/redundancy/api/http-client";

describe("RedundancyHttpClient", () => {
  it("unwraps the KF response envelope and forwards bearer token", async () => {
    const request = vi.fn().mockResolvedValue({
      data: { code: 0, message: "success", data: ["ok"] },
    });
    const client = new RedundancyHttpClient({
      getToken: () => "access-token",
      instance: { request } as unknown as AxiosInstance,
    });

    await expect(
      client.request<string[]>({ method: "GET", url: "/redundancies" }),
    ).resolves.toEqual(["ok"]);
    expect(request.mock.calls[0][0].headers.Authorization).toBe(
      "Bearer access-token",
    );
  });

  it("keeps the stable backend error code for UI recovery decisions", async () => {
    const request = vi.fn().mockResolvedValue({
      data: {
        code: "REDUNDANCY_REVISION_CONFLICT",
        message: "配置已更新",
        data: null,
      },
    });
    const client = new RedundancyHttpClient({
      getToken: () => null,
      instance: { request } as unknown as AxiosInstance,
    });

    await expect(
      client.request({ method: "PUT", url: "/redundancies/id" }),
    ).rejects.toMatchObject({
      code: "REDUNDANCY_REVISION_CONFLICT",
      message: "配置已更新",
    } satisfies Partial<RedundancyApiError>);
  });

  it("KF 返回 token 缺失业务码时通知独立壳重新登录", async () => {
    const onUnauthorized = vi.fn();
    const request = vi.fn().mockResolvedValue({
      data: { code: 20000, message: "token缺失", data: null },
    });
    const client = new RedundancyHttpClient({
      getToken: () => null,
      onUnauthorized,
      instance: { request } as unknown as AxiosInstance,
    });

    await expect(
      client.request({ method: "GET", url: "/redundancies" }),
    ).rejects.toMatchObject({ code: 20000 });
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });
});
// end
