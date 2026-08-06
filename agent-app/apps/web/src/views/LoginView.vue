<script setup lang="ts">
import { reactive, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useSession } from "../stores/session";

const router = useRouter();
const route = useRoute();
const session = useSession();

const form = reactive({ tenant: "", username: "", password: "" });
const errorMessage = ref<string | null>(null);

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
  <main class="login-page">
    <form class="login-card" data-testid="login-form" @submit.prevent="submit">
      <h1>KF Solution Agent</h1>
      <p class="subtitle">客户解决方案工作台</p>
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
      <p v-if="errorMessage" class="error" data-testid="login-error">{{ errorMessage }}</p>
      <button type="submit" data-testid="login-submit" :disabled="session.state.loading">
        {{ session.state.loading ? "登录中…" : "登录" }}
      </button>
    </form>
  </main>
</template>

<style scoped>
.login-page {
  min-height: 100vh; display: flex; align-items: center; justify-content: center;
  background: linear-gradient(180deg, #e8edf5 0%, var(--color-bg) 60%);
}
.login-card {
  width: 24rem; background: rgba(255, 255, 255, 0.72);
  backdrop-filter: var(--blur-glass);
  border-radius: var(--radius-sheet); box-shadow: var(--shadow-float);
  padding: 2.4rem; display: flex; flex-direction: column; gap: 1rem;
}
.login-card h1 { margin: 0; font-size: 1.8rem; display: flex; align-items: center; gap: 0.5rem; }
.login-card h1::before { content: "◈"; color: var(--color-accent); }
.subtitle { margin: 0; color: var(--color-text-secondary); font-size: 0.9rem; }
.login-card label { display: flex; flex-direction: column; gap: 0.3rem; font-size: 0.85rem; }
.login-card input {
  padding: 0.65rem 0.85rem; border: 1px solid var(--color-border); border-radius: var(--radius-button); font-size: 1rem;
}
.login-card input:focus { outline: 2px solid var(--color-accent); outline-offset: -1px; border-color: transparent; }
.login-card button {
  padding: 0.65rem; border: none; border-radius: var(--radius-button);
  background: var(--color-accent); color: #fff; font-size: 1rem; cursor: pointer;
}
.login-card button:active { transform: scale(0.98); background: var(--color-accent-pressed); }
.login-card button:disabled { opacity: 0.5; cursor: not-allowed; }
.error { color: var(--color-danger); margin: 0; font-size: 0.85rem; }
</style>
