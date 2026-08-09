import { describe, expect, it } from "vitest";
import { createWorkerInstanceId } from "./worker-instance-id.js";

describe("worker instance identity", () => {
  it("does not collide for two startup instances on the same host and pid", () => {
    const first = createWorkerInstanceId("build-host", 42);
    const second = createWorkerInstanceId("build-host", 42);

    expect(first).not.toBe(second);
    expect(first).toMatch(/^worker-build-host-42-[0-9a-f-]{36}$/);
    expect(second).toMatch(/^worker-build-host-42-[0-9a-f-]{36}$/);
  });
});
