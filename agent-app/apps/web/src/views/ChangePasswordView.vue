<script setup lang="ts">
import { reactive, ref } from "vue";
import { useRouter } from "vue-router";
import { useSession } from "../stores/session";

/**
 * 首次登录强制修改密码页（I2）。
 * 只有 mustChangePassword=true 的受限会话能访问本页（其它 API 被服务端
 * TenantGuard 拒绝）；改密成功后服务端直接下发完整会话 cookie，前端同步
 * 清除标志并进入工作区。
 */
const router = useRouter();
const session = useSession();

const form = reactive({ currentPassword: "", newPassword: "", confirmPassword: "" });
const errorMessage = ref<string | null>(null);

async function submit(): Promise<void> {
  errorMessage.value = null;
  if (form.newPassword.length < 8) {
    errorMessage.value = "新密码长度至少 8 位";
    return;
  }
  if (form.newPassword !== form.confirmPassword) {
    errorMessage.value = "两次输入的新密码不一致";
    return;
  }
  try {
    await session.changePassword({
      currentPassword: form.currentPassword,
      newPassword: form.newPassword,
    });
    await router.push("/workspaces");
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : String(error);
  }
}
</script>

<template>
  <main class="change-password-page">
    <form class="change-card" data-testid="change-password-form" @submit.prevent="submit">
      <h1>设置新密码</h1>
      <p class="subtitle">首次登录需要修改临时密码后才能继续</p>
      <label>
        当前密码
        <input v-model="form.currentPassword" data-testid="change-current-password" type="password" autocomplete="current-password" required />
      </label>
      <label>
        新密码
        <input v-model="form.newPassword" data-testid="change-new-password" type="password" autocomplete="new-password" required />
      </label>
      <label>
        确认新密码
        <input v-model="form.confirmPassword" data-testid="change-confirm-password" type="password" autocomplete="new-password" required />
      </label>
      <p v-if="errorMessage" class="error" data-testid="change-password-error">{{ errorMessage }}</p>
      <button type="submit" data-testid="change-password-submit" :disabled="session.state.loading">
        {{ session.state.loading ? "提交中…" : "确认修改" }}
      </button>
    </form>
  </main>
</template>

<style scoped>
.change-password-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0f172a;
}
.change-card {
  width: 22rem;
  background: #ffffff;
  border-radius: 12px;
  padding: 2rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
.change-card h1 {
  margin: 0;
  font-size: 1.4rem;
}
.subtitle {
  margin: 0;
  color: #64748b;
  font-size: 0.9rem;
}
.change-card label {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.85rem;
}
.change-card input {
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
