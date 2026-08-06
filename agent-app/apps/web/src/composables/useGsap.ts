import gsap from "gsap";
import { onBeforeUnmount } from "vue";

/**
 * 智绘动画工具（gsap-motion-playbook）。
 * 统一 GSAP 入口 + prefers-reduced-motion 短路 + 组件卸载自动清理。
 *
 * 规则（playbook）：只动 transform/opacity；进入用 power3.out；
 * 弹层用 back.out(1.7)；UI 动画 < 300ms；卸载时 kill 所有 timeline。
 */
export function useGsap() {
  /** prefers-reduced-motion 时跳过位移动画（只保留淡入淡出或直达终态）。 */
  function reduceMotion(): boolean {
    // jsdom 测试环境没有 matchMedia，直接视为非 reduce（动画会跑但测试不断言它）。
    if (typeof window.matchMedia !== "function") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  const timelines: gsap.core.Timeline[] = [];

  /** 注册一条 timeline，组件卸载时自动 kill。 */
  function track(tl: gsap.core.Timeline): gsap.core.Timeline {
    timelines.push(tl);
    return tl;
  }

  onBeforeUnmount(() => {
    for (const tl of timelines) {
      tl.kill();
    }
    timelines.length = 0;
  });

  return { gsap, track, reduceMotion };
}
