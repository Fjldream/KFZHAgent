// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { Injectable } from "@nestjs/common";

/**
 * 精确 origin 白名单比对。
 *
 * 只认服务端配置的 origin：不用 CORS 代替 CSRF 防护，也不看
 * X-Forwarded-Host 之类可伪造的请求头。URL 规范化后比较 `origin`，
 * 因此大小写与默认端口差异被归一，而子域、端口、后缀混入都不算匹配。
 */
export function isAllowedMutationOrigin(origin: string | undefined, allowedOrigins: readonly string[]): boolean {
  if (origin === undefined || origin.length === 0) return false;

  let candidate: URL;
  try {
    candidate = new URL(origin);
  } catch {
    return false;
  }

  return allowedOrigins.some((entry) => {
    try {
      return new URL(entry).origin === candidate.origin;
    } catch {
      return false; // 配置项本身非法时视为不匹配，宁拒绝不放行
    }
  });
}

const configuredOrigins = (): string[] =>
  (process.env.AGENT_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

/** cookie 鉴权的写请求必须带允许的 Origin；缺失或不匹配一律 403。 */
@Injectable()
export class MutationOriginGuard implements CanActivate {
  // 不用构造器注入：Nest 会把 `string[]` 当成 DI token 去解析，
  // @UseGuards 直接实例化时会报 UnknownDependencies。改为 canActivate 时读环境。
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{ headers?: Record<string, string | undefined> }>();
    const origin = request.headers?.origin;
    return isAllowedMutationOrigin(origin, configuredOrigins());
  }
}
// end
