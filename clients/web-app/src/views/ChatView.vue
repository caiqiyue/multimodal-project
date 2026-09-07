<script setup lang="ts">
import { getCurrentUser } from '@/lib/tokenStorage';
import { logout } from '@/lib/auth';
import { useRouter } from 'vue-router';
const user = getCurrentUser();
const router = useRouter();
function handleLogout(): void {
  logout();
  router.push('/login');
}
</script>
<template>
  <div style="padding:24px">
    <h1>Welcome, {{ user?.display_name }}</h1>
    <button @click="handleLogout">退出登录</button>
    <p>Chat UI lands in feat-166.</p>
  </div>
</template>