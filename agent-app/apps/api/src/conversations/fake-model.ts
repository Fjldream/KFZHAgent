import type { ChangePlan } from "@kf/contracts";
import { solutionId } from "@kf/contracts";
import { deriveGuid } from "@kf/domain-client";
import type {
  ClassifyIntentResult,
  ModelPort,
  ModelPortContext,
  ProjectDesign,
} from "@kf/agent-orchestrator";

/**
 * 确定性演示模型（E2E / 演示环境用）。
 *
 * 生产 ModelPort 由部署方接线（Phase 3）；本实现通过环境变量
 * `MODEL_PORT_MODE=fake` 注入，使 E2E 能走完整「确定性 fake-model 请求」
 * 流程（brief Step 6）：
 *  - 需求含「新建/创建/生成/设计」→ NEW_REQUIREMENT（new 流程）
 *  - 需求含「修改/改成/颜色/按钮/添加/删除」→ MODIFY_REQUIREMENT（modify 流程）
 *  - 其余 → QUESTION（回到 idle，无副作用）
 *
 * 计划输出是固定、确定性的：new 流程修改初始 Text1 的文本；modify 流程
 * 修改上传包中 Button1（guid=button-guid-1）的背景色，customFutureField
 * 等未知字段由 patcher 无损保留。
 */
export class DeterministicFakeModelPort implements ModelPort {
  classifyIntent(input: ModelPortContext): Promise<ClassifyIntentResult> {
    const text = input.requirementText ?? "";
    if (/新建|创建|生成|设计/.test(text)) {
      return Promise.resolve({ intent: "NEW_REQUIREMENT", requestedDomains: ["kingclient"] });
    }
    if (/修改|改成|改为|颜色|按钮|添加|删除|红色/.test(text)) {
      return Promise.resolve({ intent: "MODIFY_REQUIREMENT", requestedDomains: ["kingclient"] });
    }
    return Promise.resolve({
      intent: "QUESTION",
      requestedDomains: ["kingclient"],
      reply: "（确定性演示模型）已收到你的问题，请继续描述需求。",
    });
  }

  createProjectDesign(_input: ModelPortContext): Promise<ProjectDesign> {
    void _input;
    return Promise.resolve({
      schema: "kf-solution-ir/v1",
      solutionId: solutionId("sol-e2e"),
      displayName: "确定性初始设计",
      projects: [],
      dependencies: [],
      pendingRequirements: [],
    });
  }

  createChangePlan(input: ModelPortContext): Promise<ChangePlan> {
    // new 流程：编译后的控件 GUID 由 build seed（=workspaceId）确定性派生，
    // 因此 fake model 用同一 seed 计算 entityId，change-scope 才能定位实体。
    const textGuid = deriveGuid({ seed: input.workspaceId }, "Text1");
    return Promise.resolve({
      schema: "kf-change-plan/v1",
      workspaceId: input.workspaceId,
      operations: [
        {
          op: "update",
          entityId: textGuid,
          entityType: "text",
          changes: [{ path: "/text", value: "由 KF Solution Agent 生成" }],
        },
      ],
    });
  }

  reviseChangePlan(input: ModelPortContext): Promise<ChangePlan> {
    const text = input.requirementText ?? "";
    // modify 流程：需求涉及按钮/颜色/红色 → 修改上传包中 Button1 的背景色
    // （customFutureField 等未知字段由 patcher 无损保留）。
    if (/按钮|颜色|红色/.test(text) && !/新建|创建|生成/.test(text)) {
      return Promise.resolve({
        schema: "kf-change-plan/v1",
        workspaceId: input.workspaceId,
        operations: [
          {
            op: "update",
            entityId: "button-guid-1",
            entityType: "button",
            changes: [{ path: "/backgroundColor", value: "rgba(255, 0, 0, 1)" }],
          },
        ],
      });
    }
    // new 流程（或 new 流程的 revise）：修改初始 Text1 控件。
    // value 与 createChangePlan 不同，保证 revise 产生新的 planHash。
    const textGuid = deriveGuid({ seed: input.workspaceId }, "Text1");
    return Promise.resolve({
      schema: "kf-change-plan/v1",
      workspaceId: input.workspaceId,
      operations: [
        {
          op: "update",
          entityId: textGuid,
          entityType: "text",
          changes: [{ path: "/text", value: "由 KF Solution Agent 修订生成" }],
        },
      ],
    });
  }

  explainValidation(): Promise<string> {
    return Promise.resolve("（确定性演示模型）校验已通过。");
  }
}
