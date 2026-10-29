// modified by jinlong.feng at 2026-10-10 冗余功能构建期开关
/**
 * 构建期功能开关。
 *
 * 约定：只有把变量显式配置成字符串 "false" 才视为关闭，其余情况（包括未配置）
 * 一律视为开启。这样默认构建与历史版本行为完全一致，不会因为漏配一个变量
 * 而把现场功能误关。
 *
 * 用法：
 *   npm run build                 → 含节点冗余功能（默认）
 *   npm run build:no-redundancy   → 屏蔽节点冗余功能
 */

/** 节点冗余功能是否启用。 */
export const REDUNDANCY_ENABLED = import.meta.env.VITE_ENABLE_REDUNDANCY !== 'false';

/**
 * 冗余功能涉及的路由名。
 *
 * 开关关闭时这些路由不会被注册，直接手敲 hash 地址会匹配不到，
 * 因此路由守卫需要据此把用户重定向回默认首页，避免白屏。
 */
export const REDUNDANCY_ROUTE_NAMES = new Set(['redundancy', 'redundancyEvents']);
// end modified by jinlong.feng at 2026-10-10 冗余功能构建期开关
