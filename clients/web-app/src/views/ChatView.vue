<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import { getAccessToken, getCurrentUser } from '@/lib/tokenStorage';
import { logout } from '@/lib/auth';
import { resolveChatWsUrl } from '@/lib/ws-chat-client';
import {
  useChatStream,
  type LocalMedia,
} from '@/composables/useChatStream';
import MessageBubble from '@/components/chat/MessageBubble.vue';
import ChatInput from '@/components/chat/ChatInput.vue';
import ImagePickerButton from '@/components/chat/ImagePickerButton.vue';
import ConnectionStatus from '@/components/chat/ConnectionStatus.vue';

const router = useRouter();
const user = getCurrentUser();
const token = getAccessToken() ?? '';
const apiBase = import.meta.env.VITE_API_BASE_URL ?? '';
const wsUrl = computed(() => resolveChatWsUrl(apiBase, token));
const { messages, connectionState, isStreaming, send, reset } = useChatStream({ url: wsUrl.value });

const caption = ref('');

function handleSendText(text: string): void {
  send([{ role: 'user', content: text }]);
  caption.value = '';
}

function handleMediaReady(media: LocalMedia[]): void {
  const trimmed = caption.value.trim();
  const fallback =
    media.length === 1 && media[0]?.mediaType === 'image'
      ? '看这张图'
      : media.some((m) => m.mediaType === 'video')
        ? '我发了一段视频'
        : '看看这些';
  send([{ role: 'user', content: trimmed || fallback, media }]);
  caption.value = '';
}

function handleLogout(): void {
  logout();
  router.push('/login');
}

const isDisconnected = computed(() => connectionState.value !== 'open');
</script>

<template>
  <div class="chat">
    <header>
      <h1>Falcon Web — {{ user?.display_name }}</h1>
      <div>
        <button :disabled="!messages.length" @click="reset">清空</button>
        <button @click="handleLogout">退出</button>
      </div>
    </header>
    <ConnectionStatus :state="connectionState" />
    <div v-if="isDisconnected" class="hint">⚠ 服务器未响应</div>
    <div class="messages">
      <MessageBubble v-for="m in messages" :key="m.id" :message="m" />
      <p v-if="!messages.length" class="empty">
        👋 输入消息，按回车发送。点 📎 上传图片或视频。
      </p>
    </div>
    <div class="inputRow">
      <ImagePickerButton :disabled="isDisconnected" @media-ready="handleMediaReady" />
      <ChatInput
        v-model="caption"
        :disabled="isDisconnected"
        :is-streaming="isStreaming"
        @send="handleSendText"
      />
    </div>
  </div>
</template>

<style scoped>
.chat {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #fff;
}
header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #ccc;
}
header h1 {
  font-size: 18px;
  margin: 0;
}
header button {
  margin-left: 8px;
  padding: 6px 12px;
}
.hint {
  background: #fef3c7;
  color: #92400e;
  padding: 8px 12px;
  font-size: 12px;
}
.messages {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}
.empty {
  text-align: center;
  color: #666;
  margin-top: 40px;
  padding: 0 24px;
}
.inputRow {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 8px 12px;
  border-top: 1px solid #ccc;
}
</style>