import { createHmacModuleArtifactAuthority } from "@kf/build-jobs";
import { describe, expect, it } from "vitest";
// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import { finalStateData } from "../../test-support/legacy-conversation-driver.js";
// end

const authority = createHmacModuleArtifactAuthority(Buffer.alloc(32, 0x46));

describe("conversation state projection", () => {
  it("removes legacy internal exception details from the SSE done payload", () => {
    const absolutePath = "/private/var/kf-agent/customer/workspace.kcp";
    const technicalPlan = JSON.stringify({
      schema: "kf-module-plan/v1",
      signature: "signature-5ad19df3c0f34819",
      secret: "KF_SECRET_SENTINEL_9e30bd",
    });
    const data = finalStateData({
      values: {
        stage: "idle",
        lastErrorCode: `MODULE_COMPILATION_FAILED:COMPILER_BUG ${absolutePath} ${technicalPlan}`,
      },
      tasks: [],
    }, authority);

    expect(data.lastErrorCode).toBe("MODULE_COMPILATION_FAILED");
    const serialized = JSON.stringify(data);
    for (const sentinel of [absolutePath, technicalPlan, "signature-5ad19df3c0f34819", "KF_SECRET_SENTINEL_9e30bd", "COMPILER_BUG"]) {
      expect(serialized).not.toContain(sentinel);
    }
  });
});
