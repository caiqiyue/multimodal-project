<script setup lang="ts">
import type { ToolCallItem } from '@/composables/useChatStream';
defineProps<{ toolCall: ToolCallItem }>();
</script>

<template>
  <div class="card">
    <div class="title">🔧 {{ toolCall.name }}</div>
    <pre class="args">{{ JSON.stringify(toolCall.args, null, 2) }}</pre>
    <div v-if="toolCall.result !== null">
      <div class="label">→ 结果</div>
      <pre class="result">{{ toolCall.result }}</pre>
    </div>
    <div v-else class="label">⏳ 等待结果...</div>
  </div>
</template>

<style scoped>
.card {
  background: #f3f0ff;
  border: 1px solid #c8b8ff;
  border-radius: 8px;
  padding: 10px;
  margin: 6px 0;
  font-family: monospace;
  font-size: 12px;
}
.title {
  font-weight: 600;
  color: #5b21b6;
  margin-bottom: 4px;
}
.label {
  color: #5b21b6;
  font-size: 12px;
  margin: 4px 0;
}
.args {
  background: #ede9fe;
  padding: 6px;
  border-radius: 4px;
  margin: 0 0 6px;
}
.result {
  background: #fff;
  padding: 6px;
  border-radius: 4px;
  border: 1px solid #e5e7eb;
  margin: 0;
}
</style>