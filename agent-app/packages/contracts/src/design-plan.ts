import { z } from "zod";

/**
 * IR 控件类型（与 client-project-ir 对齐；后续计划扩展控件时同步）。
 * DesignPlan 只是规划层（描述性占位），控件约束在 IR 编译阶段由
 * ControlIR 严格执行，因此这里只需类型名，不携带几何/属性。
 */
export const DesignPlanControlType = z.enum([
  "text", "button", "inputnumber", "switch", "checkbox", "radio",
  "select", "image", "tabs", "table", "richtext", "spacer",
]);
export type DesignPlanControlType = z.infer<typeof DesignPlanControlType>;

/**
 * 设计方案的共享契约（brief Task 3）。planning 阶段的产物：描述页面
 * 布局意图，不绑定 KF GUID 或几何坐标——这些在 Task 6 编译到
 * ClientProjectIR/ControlIR 时由实现层补齐。.strict() 保证 LLM 输出里
 * 多余字段不会静默通过。
 */
export const DesignPlanSchema = z
  .object({
    schema: z.literal("kf-design-plan/v1"),
    displayName: z.string().min(1),
    summary: z.string(),
    layoutConcept: z.string().max(400),
    styleDirection: z.string(),
    sections: z
      .array(
        z.object({
          id: z.string().min(1),
          label: z.string(),
          controls: z
            .array(
              z.object({
                type: DesignPlanControlType,
                text: z.string().optional(),
                note: z.string().optional(),
              }),
            )
            .max(12),
        }),
      )
      .min(1)
      .max(8),
    signature: z.string(),
  })
  .strict();

export type DesignPlan = z.infer<typeof DesignPlanSchema>;
