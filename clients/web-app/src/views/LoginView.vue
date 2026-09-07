<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { LoginRequestSchema } from '@multimodal/api-contract/auth';
import { login } from '@/lib/auth';

const router = useRouter();
const username = ref('');
const password = ref('');
const isSubmitting = ref(false);
const errorMessage = ref<string | null>(null);

async function handleSubmit(): Promise<void> {
  errorMessage.value = null;
  const parsed = LoginRequestSchema.safeParse({ username: username.value, password: password.value });
  if (!parsed.success) {
    errorMessage.value = parsed.error.issues[0]?.message ?? 'Invalid input';
    return;
  }
  isSubmitting.value = true;
  try {
    await login(parsed.data);
    await router.push('/chat');
  } catch (err) {
    errorMessage.value = err instanceof Error ? err.message : 'Login failed';
  } finally {
    isSubmitting.value = false;
  }
}

const canSubmit = (): boolean =>
  !isSubmitting.value && username.value.length > 0 && password.value.length >= 8;
</script>

<template>
  <div class="login">
    <h1>Sign in</h1>
    <p class="hint">Try demo / demo1234</p>
    <input v-model="username" placeholder="Username" :disabled="isSubmitting" />
    <input v-model="password" type="password" placeholder="Password" :disabled="isSubmitting" />
    <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
    <button :disabled="!canSubmit()" @click="handleSubmit">
      {{ isSubmitting ? 'Signing in…' : 'Sign in' }}
    </button>
  </div>
</template>

<style scoped>
.login { max-width: 360px; margin: 80px auto; padding: 24px; display: flex; flex-direction: column; gap: 12px; }
h1 { text-align: center; margin: 0; }
.hint { color: #666; text-align: center; margin: 0 0 8px; }
input { padding: 12px; border: 1px solid #ccc; border-radius: 6px; font-size: 16px; }
button { padding: 12px; background: #3b82f6; color: white; border: none; border-radius: 6px; cursor: pointer; }
button:disabled { opacity: 0.5; cursor: not-allowed; }
.error { color: #c00; text-align: center; margin: 0; }
</style>