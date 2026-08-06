<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useGsap } from "../composables/useGsap";

/**
 * 全局氛围背景（苹果风）：
 *  - 多层大号柔和径向光斑（accent 蓝 / 淡紫 / 青绿），fixed 铺满视口；
 *  - GSAP 让光斑缓慢漂移（yoyo，~40s 周期），界面「灵动」的来源；
 *  - 极淡 SVG 网格纹理 + 顶部提亮渐变叠加，苹果质感；
 *  - prefers-reduced-motion 时光斑静止；prefers-reduced-transparency 时去掉 blur。
 *
 * 零依赖：SVG 用 data URI 内联，不请求外网资源（服务器可离线部署）。
 */
const { gsap, track, reduceMotion } = useGsap();
const blobsEl = ref<HTMLElement | null>(null);

onMounted(() => {
  const wrap = blobsEl.value;
  if (wrap === null) return;
  if (reduceMotion()) return;
  // 光斑缓慢漂移：40s 周期往返，幅度小（不干扰内容阅读）。
  const tl = gsap.timeline({ repeat: -1, yoyo: true, ease: "sine.inOut" });
  tl.to(wrap.querySelector(".blob-a"), { x: 90, y: -60, duration: 42 }, 0)
    .to(wrap.querySelector(".blob-b"), { x: -110, y: 80, duration: 50 }, 0)
    .to(wrap.querySelector(".blob-c"), { x: 70, y: 50, duration: 46 }, 0);
  track(tl);
});
</script>

<template>
  <div ref="blobsEl" class="ambient" aria-hidden="true">
    <!-- 光斑层（带基础色，确保非白底可见） -->
    <div class="blob blob-a" />
    <div class="blob blob-b" />
    <div class="blob blob-c" />
  </div>
</template>

<style scoped>
.ambient {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
  /* 基础渐变底：淡蓝→近白→淡紫，让光斑有环境色而非纯白。 */
  background:
    radial-gradient(120% 90% at 12% 8%, rgba(214, 228, 248, 0.9) 0%, rgba(245, 245, 247, 0) 55%),
    radial-gradient(110% 90% at 88% 92%, rgba(235, 226, 250, 0.8) 0%, rgba(245, 245, 247, 0) 55%),
    var(--color-bg);
}
.blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(90px);
  will-change: transform;
}
.blob-a {
  width: 46vw;
  height: 46vw;
  top: -14vw;
  left: -10vw;
  background: radial-gradient(circle at 30% 30%, rgba(10, 132, 255, 0.28), rgba(10, 132, 255, 0) 70%);
}
.blob-b {
  width: 42vw;
  height: 42vw;
  bottom: -16vw;
  right: -8vw;
  background: radial-gradient(circle at 60% 60%, rgba(147, 112, 219, 0.24), rgba(147, 112, 219, 0) 70%);
}
.blob-c {
  width: 30vw;
  height: 30vw;
  top: 45%;
  left: 38%;
  background: radial-gradient(circle at 50% 50%, rgba(52, 199, 89, 0.12), rgba(52, 199, 89, 0) 70%);
}
/* 极淡网格纹理叠加（8px 网格，4% 透明度）——苹果质感。 */
.ambient::after {
  content: "";
  position: absolute;
  inset: 0;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Cpath d='M24 0H0v24' fill='none' stroke='%23000' stroke-opacity='0.035'/%3E%3C/svg%3E");
}
@media (prefers-reduced-transparency: reduce) {
  .blob { filter: none; }
}
</style>
