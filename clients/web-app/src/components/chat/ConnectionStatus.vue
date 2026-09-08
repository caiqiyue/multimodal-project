<script setup lang="ts">
import type { ConnectionState } from '@/composables/useChatStream';
defineProps<{ state: ConnectionState }>();
const LABEL: Record<ConnectionState, string> = {
  connecting: '🔄 正在连接...',
  open: '✅ 已连接',
  closed: '❌ 已断开',
};
</script>

<template>
  <div class="banner" :class="state">{{ LABEL[state] }}</div>
</template>

<style scoped>
.banner {
  padding: 6px 12px;
  text-align: center;
  font-size: 12px;
  font-weight: 500;
}
.connecting {
  background: #fef3c7;
}
.open {
  background: #d1fae5;
}
.closed {
  background: #fee2e2;
}
</style>