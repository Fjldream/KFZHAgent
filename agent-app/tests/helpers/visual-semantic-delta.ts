// modified by jinlong.feng at 2026-10-26 Agent工作台迭代
import { canonicalServerHash, VisualSemanticGraphSchema } from "../../packages/contracts/src/index.js";

/** Encodes an explicit trusted test target; never imported by the production gateway/repair path. */
export function visualSemanticDeltaFixture(base: unknown, target: unknown) {
  const previous = VisualSemanticGraphSchema.parse(base);
  const next = VisualSemanticGraphSchema.parse(target);
  const operations: unknown[] = [];
  const different = (left: unknown, right: unknown) => canonicalServerHash(left ?? null) !== canonicalServerHash(right ?? null);
  const nodes = next.nodes.filter(node => different(previous.nodes.find(item => item.id === node.id), node));
  const removed = previous.nodes.filter(node => !next.nodes.some(item => item.id === node.id)).map(node => node.id);
  if (nodes.length) operations.push({ op: "upsert-nodes", nodes });
  if (removed.length) operations.push({ op: "remove-nodes", nodeIds: removed });
  const oldPlan = previous.plan as Record<string, unknown>;
  const newPlan = next.plan as Record<string, unknown>;
  const previousStyles = oldPlan.roleStyles as Array<{ role: string }>;
  const styles = (newPlan.roleStyles as Array<{ role: string }>).filter(style => different(previousStyles.find(item => item.role === style.role), style));
  if (styles.length) operations.push({ op: "upsert-role-styles", styles });
  for (const [field, value] of Object.entries(newPlan)) if (field !== "roleStyles" && different(oldPlan[field], value)) operations.push({ op: "set-plan-field", field, value });
  if (different(previous.bindings, next.bindings)) operations.push({ op: "replace-bindings", bindings: next.bindings });
  return { schema: "kf-visual-semantic-graph-delta/v1", baseDraftHash: canonicalServerHash(base), operations };
}
// end
