<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useGsap } from "../composables/useGsap";

/**
 * 全局氛围背景（苹果风）：
 *  - 两个大号柔和径向光斑（accent 蓝 + 淡紫），fixed 铺满视口，blur 模糊制造氛围；
 *  - GSAP 让光斑缓慢漂移（yoyo，~40s 周期），界面「灵动」的来源；
 *  - 极淡 SVG 网格纹理叠加，苹果质感；
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
    .to(wrap.querySelector(".blob-b"), { x: -110, y: 80, duration: 50 }, 0);
  track(tl);
});
</script>

<template>
  <div ref="blobsEl" class="ambient" aria-hidden="true">
    <div class="blob blob-a" />
    <div class="blob blob-b" />
  </div>
</template>

<style scoped>
.ambient {
  position: fixed;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
  /* 极淡网格纹理（SVG data URI，8px 网格，4% 透明度）——苹果质感。 */
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24'%3E%3Cpath d='M24 0H0v24' fill='none' stroke='%23000' stroke-opacity='0.035'/%3E%3C/svg%3E");
}
.blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  will-change: transform;
}
.blob-a {
  width: 42vw;
  height: 42vw;
  top: -12vw;
  left: -8vw;
  background: radial-gradient(circle at 30% 30%, rgba(10, 132, 255, 0.18), rgba(10, 132, 255, 0) 70%);
}
.blob-b {
  width: 38vw;
  height: 38vw;
  bottom: -14vw;
  right: -6vw;
  background: radial-gradient(circle at 60% 60%, rgba(147, 112, 219, 0.14), rgba(147, 112, 219, 0) 70%);
}
@media (prefers-reduced-transparency: reduce) {
  .blob { filter: none; }
}
</style>
