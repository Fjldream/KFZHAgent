// @ts-nocheck -- brief 逐字测试代码（JS 风格、无类型标注），运行时行为由 vitest 断言验证。
import { describe, expect, it } from "vitest";
import { DomainRegistry } from "./domain-registry.js";

const client = {
  kind: "kingclient",
  displayName: "客户端工程",
  supported: true,
  capabilities: { create: true, import: true, modify: true, validate: true, package: true },
  inspect: async () => ({}),
  compile: async () => ({}),
  patch: async () => ({}),
  validate: async () => ({
    status: "pass",
    checks: {
      packageStructure: "pass",
      jsonSchema: "pass",
      references: "pass",
      businessRules: "pass",
      changeScope: "pass",
      roundTrip: "pass"
    },
    warnings: []
  }),
  package: async () => "artifact-1"
};

describe("DomainRegistry", () => {
  it("resolves a registered domain", () => {
    const registry = new DomainRegistry();
    registry.register(client);
    expect(registry.require("kingclient")).toEqual(client);
  });

  it("rejects duplicate registrations", () => {
    const registry = new DomainRegistry();
    registry.register(client);
    expect(() => registry.register(client)).toThrow("domain already registered: kingclient");
  });

  it("reports unsupported metadata without a compiler", () => {
    const registry = new DomainRegistry();
    registry.registerMetadata({
      kind: "kingalarm",
      displayName: "告警工程",
      supported: false,
      capabilities: { create: false, import: false, modify: false, validate: false, package: false }
    });
    expect(registry.metadata("kingalarm").supported).toBe(false);
  });
});
