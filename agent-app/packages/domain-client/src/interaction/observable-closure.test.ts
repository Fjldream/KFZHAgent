import { describe, expect, it } from "vitest";
import { analyzeObservableClosure } from "./observable-closure.js";

describe("analyzeObservableClosure", () => {
  it("evaluates a near-capacity converging diamond DAG with linear state visits", () => {
    const nodes = new Map<string, { successors: string[]; visible: boolean }>();
    nodes.set("root", { successors: ["left-0", "right-0"], visible: true });
    for (let layer = 0; layer < 66; layer += 1) {
      const left = `left-${layer}`;
      const right = `right-${layer}`;
      const join = `join-${layer}`;
      nodes.set(left, { successors: [join], visible: false });
      nodes.set(right, { successors: [join], visible: false });
      nodes.set(join, {
        successors: layer === 65 ? [] : [`left-${layer + 1}`, `right-${layer + 1}`],
        visible: false,
      });
    }

    const result = analyzeObservableClosure(nodes, ["root"]);
    expect(nodes.size).toBe(199);
    expect(result.missingObservablePath).toBe(false);
    expect(result.reachable.size).toBe(nodes.size);
    expect(result.evaluatedStates).toBeLessThanOrEqual(nodes.size * 2);
    expect(result.evaluatedEdges).toBeLessThanOrEqual(264 * 2);
  });

  it("visits every shared branch and rejects when any terminal path is not observable", () => {
    const result = analyzeObservableClosure(new Map([
      ["root", { successors: ["visible", "silent"], visible: false }],
      ["visible", { successors: [], visible: true }],
      ["silent", { successors: [], visible: false }],
    ]), ["root"]);

    expect(result.missingObservablePath).toBe(true);
    expect([...result.reachable].sort()).toEqual(["root", "silent", "visible"]);
  });
});
