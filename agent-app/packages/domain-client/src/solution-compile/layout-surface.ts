// modified by jinlong.feng at 2026-10-26 Agent工作台迭代
import { MAX_COMPILED_LAYOUT_EXTENT, type LayoutNode, type SolutionImplementationPlan } from "@kf/contracts";
import { resolveStyle } from "../style/theme-resolver.js";
import type { IntrinsicSize } from "./intrinsic-measure.js";

/** Compiler-derived border-box insets; never accepted from the model. */
export interface LayoutContentInsets {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

export const EMPTY_LAYOUT_INSETS: LayoutContentInsets = Object.freeze({ left: 0, right: 0, top: 0, bottom: 0 });

export function resolveLayoutContentInsets(plan: SolutionImplementationPlan, node: LayoutNode): LayoutContentInsets {
  if (node.styleRole === undefined) return EMPTY_LAYOUT_INSETS;
  const role = plan.roleStyles.find(style => style.role === node.styleRole);
  if (role === undefined) throw new Error(`LAYOUT_SURFACE_ROLE_MISSING: ${node.id}`);
  const resolved = resolveStyle(plan.theme, role, { declarations: {}, states: {} });
  const declarations = resolved.declarations;
  const expectedOverflow = node.layout === "scroll-region" ? "auto" : "visible";
  const geometryKeys = ["padding", "paddingHorizontal", "paddingVertical", "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth"];
  for (const [state, style] of [["normal", declarations], ...Object.entries(resolved.states)] as const) {
    if (style === undefined) continue;
    if (style.overflow !== undefined && style.overflow !== expectedOverflow) throw new Error(`LAYOUT_SURFACE_OVERFLOW: ${node.id}`);
    if (style.advanced?.some(declaration => declaration.kind === "background-image")) throw new Error(`LAYOUT_SURFACE_ASSET_UNSUPPORTED: ${node.id}`);
    if (state !== "normal" && geometryKeys.some(key => Object.hasOwn(style, key))) throw new Error(`LAYOUT_SURFACE_STATE_GEOMETRY: ${node.id}`);
  }
  const horizontal = declarations.paddingHorizontal ?? declarations.padding ?? 0;
  const vertical = declarations.paddingVertical ?? declarations.padding ?? 0;
  const inset = (padding: number, border: number) => Math.round((padding + border) * 100) / 100;
  return Object.freeze({
    left: inset(horizontal, declarations.borderLeftWidth ?? 0),
    right: inset(horizontal, declarations.borderRightWidth ?? 0),
    top: inset(vertical, declarations.borderTopWidth ?? 0),
    bottom: inset(vertical, declarations.borderBottomWidth ?? 0),
  });
}

export function expandLayoutIntrinsic(measured: IntrinsicSize, insets: LayoutContentInsets): IntrinsicSize {
  const horizontal = insets.left + insets.right;
  const vertical = insets.top + insets.bottom;
  if (horizontal === 0 && vertical === 0) return measured;
  // Maximum dimensions remain bounded by the same compiler limit as unstyled layouts.
  const expand = (value: number, inset: number) => Math.min(MAX_COMPILED_LAYOUT_EXTENT, Math.round((value + inset) * 100) / 100);
  return Object.freeze({
    minWidth: expand(measured.minWidth, horizontal), preferredWidth: expand(measured.preferredWidth, horizontal), maxWidth: expand(measured.maxWidth, horizontal),
    minHeight: expand(measured.minHeight, vertical), preferredHeight: expand(measured.preferredHeight, vertical), maxHeight: expand(measured.maxHeight, vertical),
    overflow: measured.overflow,
  });
}
// end
