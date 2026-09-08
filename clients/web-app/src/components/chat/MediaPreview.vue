<script setup lang="ts">
import type { LocalMedia } from '@/composables/useChatStream';
defineProps<{ media: LocalMedia }>();
</script>

<template>
  <img
    v-if="media.mediaType === 'image'"
    :src="media.localUri"
    :alt="'attachment'"
    class="image"
  />
  <a v-else :href="media.uploadedUrl" target="_blank" class="videoBox">
    ▶ 视频
  </a>
</template>

<style scoped>
.image {
  width: 160px;
  height: 160px;
  object-fit: cover;
  border-radius: 8px;
}
.videoBox {
  display: inline-block;
  width: 160px;
  height: 100px;
  background: #111827;
  color: white;
  text-decoration: none;
  border-radius: 8px;
  line-height: 100px;
  text-align: center;
}
</style>