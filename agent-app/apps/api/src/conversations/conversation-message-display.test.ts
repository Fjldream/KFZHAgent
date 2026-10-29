// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import { describe, expect, it } from "vitest";
import { encodeBlueprintConfirmation } from "@kf/agent-orchestrator";
import { sanitizeConversationMessage } from "./conversation.service.js";

describe("customer history and fork confirmation records", () => {
  it.each(["vref1", "vbpr1", "vcont1", "veng1"])("does not expose or copy a complete %s receipt as customer text", prefix => {
    const content = `${prefix}:${"a".repeat(64)}:${"b".repeat(64)}`;
    const source = { id: "message", role: "user", content };
    const display = sanitizeConversationMessage(source);
    expect(display.id).toBe(source.id);
    expect(display.content).toBe("已记录流程确认。历史记录不授予新一轮确认或外发权限。");
    expect(display.content).not.toContain(prefix);
    expect(source.content).toBe(content);
  });
  it("turns an exact blueprint control record into readable history without mutating stored control input", () => {
    const content = encodeBlueprintConfirmation(2, "a".repeat(64));
    const source = { role: "user", content };
    expect(sanitizeConversationMessage(source).content).toBe("已记录蓝图确认。后续新操作仍需独立确认当前方案。");
    expect(source.content).toBe(content);
  });
  it("preserves ordinary text, incomplete examples and customer-facing blueprints", () => {
    for (const source of [{ role: "user", content: "解释 vbpr1: 示例" }, { role: "user", content: "vref1:incomplete" },
      { role: "assistant", content: '{"schema":"kf-design-plan/v3","objective":"客户蓝图"}' }]) {
      expect(sanitizeConversationMessage(source)).toEqual(source);
    }
  });
  it("keeps the existing technical assistant payload filter", () => {
    expect(sanitizeConversationMessage({ role: "assistant", content: '{"schema":"kf-server-plan-envelope/v1","signature":"private-fixture","plan":{}}' }).content)
      .toBe("工程正在按已确认的效果蓝图生成，技术实施细节由系统自动校验。");
  });
});
// end
