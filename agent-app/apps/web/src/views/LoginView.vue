<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useSession } from "../stores/session";
import { useGsap } from "../composables/useGsap";
import BrandLogo from "../components/BrandLogo.vue";

const router = useRouter();
const route = useRoute();
const session = useSession();
const { gsap, track, reduceMotion } = useGsap();

const form = reactive({ tenant: "", username: "", password: "" });
const remember = ref(true);
const errorMessage = ref<string | null>(null);
const pageEl = ref<HTMLElement | null>(null);
const cardEl = ref<HTMLElement | null>(null);

/** 功能亮点（与产品实际能力对应：对话生成 / 无损编辑 / 实时预览）。 */
const highlights = [
  { icon: "◈", title: "对话式生成", desc: "用自然语言描述需求，AI 自动生成 KingFusion 客户端工程。" },
  { icon: "✎", title: "无损编辑", desc: "上传原生 .gz 工程包，未知字段与人工修改逐字节保留。" },
  { icon: "◎", title: "实时预览", desc: "构建前查看变更计划、页面预览与六层校验报告。" },
];

/** 示例 Prompt（只读演示）：点击在预览区播放一段模拟的生成动画。 */
const examplePrompts = ["新建一个设备监控大屏", "给按钮加上报警联动"];
const activeExample = ref(0);
const exampleBusy = ref(false);

function playExample(index: number): void {
  if (exampleBusy.value) return;
  activeExample.value = index;
  exampleBusy.value = true;
  const chip = pageEl.value?.querySelector(".example-preview");
  if (chip === null || chip === undefined) {
    exampleBusy.value = false;
    return;
  }
  // 模拟「正在生成…」的呼吸动画，1.2s 后定格在「演示」状态。
  const tl = gsap.timeline();
  tl.fromTo(chip, { opacity: 0.4 }, { opacity: 1, duration: 0.5, yoyo: true, repeat: 2, ease: "power1.inOut" })
    .add(() => {
      exampleBusy.value = false;
    }, "+=0.1");
  if (!reduceMotion()) track(tl);
}

onMounted(() => {
  const page = pageEl.value;
  const card = cardEl.value;
  if (reduceMotion()) {
    if (page !== null) gsap.set(page.querySelectorAll(".brand-col > *, .login-card"), { opacity: 1, y: 0 });
    return;
  }
  // 左栏品牌区 stagger 入场 + 右栏登录卡片弹入。
  const tl = gsap.timeline();
  tl.fromTo(
    page?.querySelectorAll(".brand-col > *") ?? [],
    { opacity: 0, y: 14 },
    { opacity: 1, y: 0, stagger: 0.07, duration: 0.38, ease: "power3.out" },
  );
  if (card !== null) {
    tl.fromTo(card, { opacity: 0, y: 20, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: "power3.out" }, "-=0.3");
  }
  track(tl);
});

function onForgot(): void {
  // 后端暂未提供找回密码（预留入口）。
  errorMessage.value = "请联系平台管理员重置密码。";
}

async function submit(): Promise<void> {
  errorMessage.value = null;
  try {
    await session.login({
      tenant: form.tenant.trim(),
      username: form.username.trim(),
      password: form.password,
    });
    // I2: 首次登录（临时密码）先强制改密，改密完成后服务端才发完整会话。
    const target = session.state.mustChangePassword
      ? "/change-password"
      : typeof route.query.redirect === "string"
        ? route.query.redirect
        : "/workspaces";
    await router.push(target);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  }
}
</script>

<template>
  <main ref="pageEl" class="login-page">
    <!-- 左栏：品牌价值区 -->
    <section class="brand-col" aria-label="智绘介绍">
      <div class="brand-head">
        <BrandLogo :size="30" text="智绘" />
      </div>
      <h1 class="slogan">用一句话，<br />生成你的 KingFusion 工程</h1>
      <p class="tagline">描述需求，智绘帮你设计、构建并验证完整的客户端工程。</p>

      <ul class="highlights">
        <li v-for="h in highlights" :key="h.title" class="highlight">
          <span class="h-icon">{{ h.icon }}</span>
          <div class="h-text">
            <span class="h-title">{{ h.title }}</span>
            <span class="h-desc">{{ h.desc }}</span>
          </div>
        </li>
      </ul>

      <!-- 示例 Prompt 演示（预留：完整交互需登录后） -->
      <div class="examples">
        <p class="examples-title">试试这样说</p>
        <div class="example-pills">
          <button
            v-for="(p, i) in examplePrompts"
            :key="p"
            type="button"
            class="pill"
            :class="{ active: activeExample === i }"
            :disabled="exampleBusy"
            @click="playExample(i)"
          >
            {{ p }}
          </button>
        </div>
        <p class="example-preview" data-testid="example-preview">
          <template v-if="exampleBusy">正在生成工程…</template>
          <template v-else>点击上方示例查看演示（完整功能需登录后使用）</template>
        </p>
      </div>
    </section>

    <!-- 右栏：登录卡片 -->
    <form ref="cardEl" class="login-card" data-testid="login-form" @submit.prevent="submit">
      <h2 class="card-title">登录</h2>
      <p class="subtitle">进入客户解决方案工作台</p>

      <label>
        租户
        <input v-model="form.tenant" data-testid="login-tenant" type="text" autocomplete="organization" required />
      </label>
      <label>
        用户名
        <input v-model="form.username" data-testid="login-username" type="text" autocomplete="username" required />
      </label>
      <label>
        密码
        <input v-model="form.password" data-testid="login-password" type="password" autocomplete="current-password" required />
      </label>

      <div class="row">
        <label class="check">
          <input v-model="remember" type="checkbox" data-testid="login-remember" />
          <span>记住我</span>
        </label>
        <button type="button" class="link" data-testid="login-forgot" @click="onForgot">忘记密码？</button>
      </div>

      <p v-if="errorMessage" class="error" data-testid="login-error">{{ errorMessage }}</p>

      <button type="submit" class="submit" data-testid="login-submit" :disabled="session.state.loading">
        {{ session.state.loading ? "登录中…" : "登录" }}
      </button>

      <p class="foot-note">没有账号？请联系平台管理员开通。</p>
    </form>
  </main>
</template>

<style scoped>
.login-page {
  position: relative;
  z-index: 1;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: clamp(2rem, 6vw, 6rem);
  padding: 2rem clamp(1.5rem, 4vw, 4rem);
  /* 氛围背景由 AmbientBackground 提供，这里只留极淡的顶部提亮。 */
  background: linear-gradient(180deg, rgba(232, 237, 245, 0.5) 0%, transparent 60%);
}

/* ---------- 左栏品牌区 ---------- */
.brand-col {
  max-width: 26rem;
  display: flex;
  flex-direction: column;
  gap: 1.1rem;
}
.brand-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.15rem;
  font-weight: 600;
}
.slogan {
  margin: 0.4rem 0 0;
  font-size: clamp(1.8rem, 3.4vw, 2.6rem);
  line-height: 1.12;
  letter-spacing: -0.03em;
}
.tagline {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 1rem;
}

.highlights {
  list-style: none;
  margin: 0.8rem 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}
.highlight {
  display: flex;
  gap: 0.7rem;
  align-items: flex-start;
}
.h-icon {
  flex: 0 0 auto;
  width: 2rem;
  height: 2rem;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(10, 132, 255, 0.1);
  color: var(--color-accent);
}
.h-text {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}
.h-title {
  font-weight: 600;
  font-size: 0.95rem;
}
.h-desc {
  color: var(--color-text-secondary);
  font-size: 0.85rem;
}

.examples {
  margin-top: 0.6rem;
}
.examples-title {
  margin: 0 0 0.5rem;
  font-size: 0.85rem;
  color: var(--color-text-secondary);
}
.example-pills {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.pill {
  padding: 0.45rem 0.9rem;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.7);
  color: var(--color-text);
  font-size: 0.85rem;
  cursor: pointer;
  transition: transform 140ms var(--ease-out), background 140ms var(--ease-out);
}
.pill:hover {
  background: var(--color-surface);
}
.pill:active {
  transform: scale(0.97);
}
.pill.active {
  border-color: var(--color-accent);
  color: var(--color-accent);
}
.pill:disabled {
  opacity: 0.6;
  cursor: default;
}
.example-preview {
  margin: 0.7rem 0 0;
  padding: 0.7rem 0.9rem;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.6);
  border: 1px solid var(--color-border);
  font-size: 0.85rem;
  color: var(--color-text-secondary);
}

/* ---------- 右栏登录卡片 ---------- */
.login-card {
  width: min(22rem, 92vw);
  background: rgba(255, 255, 255, 0.78);
  backdrop-filter: var(--blur-glass);
  border-radius: var(--radius-sheet);
  box-shadow: var(--shadow-float);
  padding: 2.2rem;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  opacity: 0; /* GSAP 进入动画起点；reduced-motion 时由 gsap.set 直达终态 */
}
.card-title {
  margin: 0;
  font-size: 1.5rem;
  letter-spacing: -0.02em;
}
.subtitle {
  margin: 0;
  color: var(--color-text-secondary);
  font-size: 0.9rem;
}
.login-card label {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.85rem;
}
.login-card input[type="text"],
.login-card input[type="password"] {
  padding: 0.65rem 0.85rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-button);
  font-size: 1rem;
  background: rgba(255, 255, 255, 0.85);
}
.login-card input:focus {
  outline: 2px solid var(--color-accent);
  outline-offset: -1px;
  border-color: transparent;
}
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.85rem;
}
.check {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-direction: row !important;
}
.check input {
  accent-color: var(--color-accent);
}
.link {
  border: none;
  background: none;
  color: var(--color-accent);
  cursor: pointer;
  padding: 0;
  font-size: 0.85rem;
}
.link:active {
  transform: scale(0.97);
}
.submit {
  padding: 0.7rem;
  border: none;
  border-radius: var(--radius-button);
  background: var(--color-accent);
  color: #fff;
  font-size: 1rem;
  cursor: pointer;
  transition: transform 140ms var(--ease-out), background 140ms var(--ease-out);
}
.submit:active {
  transform: scale(0.98);
  background: var(--color-accent-pressed);
}
.submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.error {
  color: var(--color-danger);
  margin: 0;
  font-size: 0.85rem;
}
.foot-note {
  margin: 0.2rem 0 0;
  text-align: center;
  color: var(--color-text-secondary);
  font-size: 0.8rem;
}

/* 窄屏：品牌区收起为顶部简版，卡片居中。 */
@media (max-width: 760px) {
  .login-page {
    flex-direction: column;
    justify-content: flex-start;
    gap: 1.6rem;
    padding-top: 3rem;
  }
  .brand-col {
    max-width: 22rem;
  }
  .highlights,
  .examples {
    display: none;
  }
}
</style>
