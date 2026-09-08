<script setup lang="ts">
import { ref } from 'vue';
const props = defineProps<{ disabled?: boolean; isStreaming?: boolean }>();
const emit = defineEmits<{
  (e: 'send', text: string): void;
  (e: 'update:modelValue', value: string): void;
}>();
const value = defineModel<string>({ default: '' });

function handleSend(): void {
  if (value.value.trim() && !props.disabled && !props.isStreaming) {
    emit('send', value.value.trim());
    value.value = '';
  }
}
</script>

<template>
  <input
    v-model="value"
    :disabled="disabled"
    :placeholder="isStreaming ? '等待回复...' : '输入消息，回车发送'"
    @keydown.enter.exact.prevent="handleSend"
    class="input"
  />
</template>

<style scoped>
.input {
  flex: 1;
  padding: 10px 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 16px;
}
</style>