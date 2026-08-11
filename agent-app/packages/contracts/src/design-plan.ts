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
export const LegacyDesignPlanSchema = z
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

const blueprintText = z.string().trim().min(1).max(600);
const blueprintTextList = z.array(blueprintText).max(12);

export const CustomerEffectBlueprintSchema = z
  .object({
    schema: z.literal("kf-design-plan/v2"),
    displayName: blueprintText,
    overview: z
      .object({
        objective: blueprintText,
        audiences: blueprintTextList.min(1),
        scenarios: blueprintTextList.min(1),
        valueProposition: blueprintText,
      })
      .strict(),
    informationArchitecture: z
      .object({
        narrative: blueprintText,
        wireframe: z.string().trim().min(1).max(1200),
      })
      .strict(),
    modules: z
      .array(
        z
          .object({
            id: z.string().trim().min(1).max(100),
            name: blueprintText,
            purpose: blueprintText,
            content: blueprintTextList.min(1),
            sampleData: z
              .array(
                z
                  .object({
                    label: blueprintText,
                    value: blueprintText,
                  })
                  .strict(),
              )
              .max(10),
            interactions: blueprintTextList,
            /** Controlled acceptance-boundary expectation; not a KF implementation detail. */
            expectedKind: z.string().trim().min(1).max(100).regex(/^[A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z][A-Za-z0-9_-]*)*$/).optional(),
            expectedCategory: blueprintText.optional(),
            interactionRequirements: z.array(z.object({
              type: z.enum(["navigate", "scroll", "open-modal", "submit", "filter", "toggle"]),
              actionKind: blueprintText,
              target: blueprintText,
            }).strict()).max(12).optional(),
            presentation: blueprintText,
          })
          .strict(),
      )
      .min(1)
      .max(12),
    visualDirection: z
      .object({
        tone: blueprintText,
        colors: blueprintTextList.min(1),
        typography: blueprintText,
        spacingAndSurfaces: blueprintText,
      })
      .strict(),
    highlights: blueprintTextList.min(1),
    revisionNotes: z
      .object({
        added: blueprintTextList,
        changed: blueprintTextList,
        retained: blueprintTextList,
      })
      .strict(),
    acceptanceCriteria: blueprintTextList.min(1),
    openQuestions: blueprintTextList,
  })
  .strict();

export const DesignPlanSchema = z.discriminatedUnion("schema", [
  LegacyDesignPlanSchema,
  CustomerEffectBlueprintSchema,
]);

export type LegacyDesignPlan = z.infer<typeof LegacyDesignPlanSchema>;
export type CustomerEffectBlueprint = z.infer<typeof CustomerEffectBlueprintSchema>;
export type DesignPlan = z.infer<typeof DesignPlanSchema>;
