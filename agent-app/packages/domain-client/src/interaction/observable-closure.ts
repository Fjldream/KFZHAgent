export interface ObservableClosureNode {
  readonly successors: readonly string[];
  readonly visible: boolean;
}

export interface ObservableClosureAnalysis {
  readonly missingObservablePath: boolean;
  readonly missingRoots: ReadonlySet<string>;
  readonly reachable: ReadonlySet<string>;
  readonly evaluatedStates: number;
  readonly evaluatedEdges: number;
}

/** Internal linear-time closure proof. Each node is evaluated at most once per inherited visibility state. */
export function analyzeObservableClosure(
  nodes: ReadonlyMap<string, ObservableClosureNode>,
  roots: readonly string[],
): ObservableClosureAnalysis {
  const memo = new Map<string, boolean>();
  const active = new Set<string>();
  const reachable = new Set<string>();
  let evaluatedStates = 0;
  let evaluatedEdges = 0;

  const visit = (id: string, inheritedVisible: boolean): boolean => {
    reachable.add(id);
    const stateKey = `${id}\0${inheritedVisible ? "1" : "0"}`;
    const cached = memo.get(stateKey);
    if (cached !== undefined) return cached;
    if (active.has(stateKey)) return true;
    active.add(stateKey);
    evaluatedStates += 1;
    const node = nodes.get(id);
    let missing: boolean;
    if (node === undefined) {
      missing = true;
    } else {
      const visible = inheritedVisible || node.visible;
      if (node.successors.length === 0) {
        missing = !visible;
      } else {
        missing = false;
        for (const successor of node.successors) {
          evaluatedEdges += 1;
          if (visit(successor, visible)) missing = true;
        }
      }
    }
    active.delete(stateKey);
    memo.set(stateKey, missing);
    return missing;
  };

  const missingRoots = new Set<string>();
  roots.forEach((root) => {
    if (visit(root, false)) missingRoots.add(root);
  });
  return {
    missingObservablePath: missingRoots.size > 0,
    missingRoots,
    reachable,
    evaluatedStates,
    evaluatedEdges,
  };
}
