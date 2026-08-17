import { describe, expect, it } from "vitest";
import {
  assertDesignKnowledgeIntegrity,
  getDesignKnowledgeSnapshot,
} from "./design-knowledge-catalog.js";

describe("design knowledge catalog", () => {
  it("cross-validates all technical and semantic references", () => {
    expect(() => assertDesignKnowledgeIntegrity()).not.toThrow();
  });

  it("returns a deterministic deeply frozen snapshot", () => {
    const snapshot = getDesignKnowledgeSnapshot();
    expect(snapshot.schema).toBe("kf-design-knowledge-catalog/v1");
    expect(snapshot.version).toBe("1.0.0");
    expect(snapshot.controlDesignProfiles).toHaveLength(26);
    expect(snapshot.styleCapabilityProfiles).toHaveLength(26);
    expect(snapshot.scriptCapabilityProfiles).toHaveLength(26);
    expect(snapshot.compositionRecipes).toHaveLength(6);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.controlDesignProfiles)).toBe(true);
  });

  it("exports defensive canonical data rather than mutable copies", () => {
    const first = getDesignKnowledgeSnapshot();
    const second = getDesignKnowledgeSnapshot();
    expect(second).toBe(first);
  });
});
