<script setup lang="ts">
import type { MessageItem } from '@/composables/useChatStream';
import StreamingText from './StreamingText.vue';
import ToolCallCard from './ToolCallCard.vue';
import MediaPreview from './MediaPreview.vue';
defineProps<{ message: MessageItem }>();
</script>

<template>
  <div v-if="message.kind === 'user'" class="row right">
    <div class="bubble user">
      <div v-if="message.media?.length" class="strip">
        <MediaPreview v-for="m in message.media" :key="m.id" :media="m" />
      </div>
      <div v-if="message.text">{{ message.text }}</div>
    </div>
  </div>
  <div v-else-if="message.kind === 'assistant'" class="row left">
    <div class="bubble assistant">
      <ToolCallCard v-for="tc in message.toolCalls" :key="tc.toolCallId" :toolCall="tc" />
      <StreamingText :content="message.content" :streaming="message.streaming" />
    </div>
  </div>
  <div v-else class="row center">
    <div class="bubble error">
      <strong>⚠ {{ message.code }}</strong>
      <div>{{ message.message }}</div>
    </div>
  </div>
</template>

<style scoped>
.row {
  display: flex;
  padding: 4px 12px;
  margin: 2px 0;
}
.right {
  justify-content: flex-end;
}
.left {
  justify-content: flex-start;
}
.center {
  justify-content: center;
}
.bubble {
  max-width: 85%;
  padding: 10px;
  border-radius: 12px;
}
.user {
  background: #3b82f6;
  color: white;
}
.assistant {
  background: #f3f4f6;
  color: #111;
}
.error {
  background: #fee2e2;
  color: #7f1d1d;
  border: 1px solid #ef4444;
}
.strip {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 6px;
}
</style>