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
    const redirect = typeof route.query.redirect === "string" ? route.query.redirect : "/workspaces";
    await router.push(redirect);
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
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0f172a;
}
.login-card {
  width: 22rem;
  background: #ffffff;
  border-radius: 12px;
  padding: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.login-card h1 {
  margin: 0;
  font-size: 1.4rem;
}
.subtitle {
  margin: 0;
  color: #64748b;
  font-size: 0.9rem;
}
.login-card label {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.85rem;
}
.login-card input {
  padding: 0.5rem;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
}
.error {
  color: #b91c1c;
  margin: 0;
  font-size: 0.85rem;
}
</style>
