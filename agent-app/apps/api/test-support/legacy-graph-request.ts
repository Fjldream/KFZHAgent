// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
/**
 * 历史领域场景的内存回合驱动，不是 HTTP 客户端，也不注册已下线的路由。
 * 保留原有编译/签名/交付断言；Run HTTP、队列和审批另由 runs 集成套件验收。
 */
import type { INestApplication } from "@nestjs/common";
import { HttpException } from "@nestjs/common";
import { EventEmitter } from "node:events";
import { SessionService, SESSION_COOKIE_NAME } from "../src/auth/session.service.js";
import { ConversationService } from "../src/conversations/conversation.service.js";
import { LegacyConversationController } from "./legacy-conversation-controller.js";
import type { LegacyConversationDriver } from "./legacy-conversation-driver.js";

type FixtureResponse = { status: number; body: Record<string, unknown>; text: string; headers: Record<string, string> };
type Expectation = number | ((response: FixtureResponse) => void);

class LegacyGraphRequest implements PromiseLike<FixtureResponse> {
  private readonly expectations: Expectation[] = [];
  private result: Promise<FixtureResponse> | undefined;
  constructor(private readonly execute: () => Promise<FixtureResponse>) {}
  expect(expectation: Expectation): this {
    this.expectations.push(expectation);
    return this;
  }
  then<TResult1 = FixtureResponse, TResult2 = never>(
    onfulfilled?: ((value: FixtureResponse) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    this.result ??= this.execute().then(response => {
      for (const expectation of this.expectations) {
        if (typeof expectation === "function") expectation(response);
        else if (response.status !== expectation) throw new Error(`historical graph fixture: expected ${expectation}, got ${response.status}: ${response.text}`);
      }
      return response;
    });
    return this.result.then(onfulfilled, onrejected);
  }
}

export function legacyGraphRequest(app: INestApplication, cookie: string, conversationId: string,
  action: { type: "message"; content: string } | { type: "resume"; body: { action?: string; planHash?: string } }): LegacyGraphRequest {
  return new LegacyGraphRequest(async () => {
    const token = cookie.split(";").map(part => part.trim()).find(part => part.startsWith(`${SESSION_COOKIE_NAME}=`))?.slice(SESSION_COOKIE_NAME.length + 1);
    const principal = token ? await app.get(SessionService).validateSession(token) : null;
    if (!principal || principal.mustChangePassword) throw new Error("historical graph fixture requires a full authenticated session");
    const controller = new LegacyConversationController(app.get<LegacyConversationDriver>(ConversationService));
    let text = "";
    const headers: Record<string, string> = {};
    const response = Object.assign(new EventEmitter(), {
      writableEnded: false,
      setHeader: (name: string, value: string) => { headers[name.toLowerCase()] = value; },
      flushHeaders: () => {},
      write: (chunk: string) => { text += chunk; return true; },
      end: () => { response.writableEnded = true; },
    });
    try {
      const req = { principal };
      const body = action.type === "message"
        ? (await controller.sendMessage(conversationId, req as never, { content: action.content }, response as never), {})
        : await controller.resume(conversationId, req as never, action.body);
      return { status: 200, body, text: text || JSON.stringify(body), headers };
    } catch (error) {
      if (!(error instanceof HttpException)) throw error;
      const body = error.getResponse();
      const record = typeof body === "string" ? { message: body } : body as Record<string, unknown>;
      return { status: error.getStatus(), body: record, text: JSON.stringify(record), headers };
    }
  });
}
// end
