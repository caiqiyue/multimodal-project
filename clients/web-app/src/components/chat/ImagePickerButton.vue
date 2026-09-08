<script setup lang="ts">
import { ref } from 'vue';
import type { LocalMedia } from '@/composables/useChatStream';
import { uploadMedia } from '@/lib/upload-media';

const emit = defineEmits<{ (e: 'media-ready', media: LocalMedia[]): void }>();
defineProps<{ disabled?: boolean }>();
const isBusy = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
let counter = 0;

async function handleFiles(files: FileList | null): Promise<void> {
  if (!files || isBusy.value) return;
  isBusy.value = true;
  try {
    const uploaded: LocalMedia[] = [];
    for (const file of Array.from(files)) {
      const mediaType: 'image' | 'video' = file.type.startsWith('image/') ? 'image' : 'video';
      try {
        const res = await uploadMedia({ file, mediaType });
        uploaded.push({
          id: `m-${++counter}`,
          localUri: URL.createObjectURL(file),
          uploadedUrl: res.url,
          mediaType,
          width: res.width ?? 0,
          height: res.height ?? 0,
        });
      } catch (err) {
        // eslint-disable-next-line no-alert
        alert(err instanceof Error ? err.message : '上传失败');
        break;
      }
    }
    if (uploaded.length) emit('media-ready', uploaded);
  } finally {
    isBusy.value = false;
    if (fileInput.value) fileInput.value.value = '';
  }
}
</script>

<template>
  <div class="wrap">
    <button :disabled="disabled || isBusy" @click="fileInput?.click()" class="btn">📎</button>
    <input
      ref="fileInput"
      type="file"
      accept="image/*,video/mp4"
      multiple
      style="display: none"
      @change="handleFiles(($event.target as HTMLInputElement).files)"
    />
  </div>
</template>

<style scoped>
.wrap {
  display: inline-flex;
}
.btn {
  width: 44px;
  height: 44px;
  border-radius: 22px;
  background: #f3f4f6;
  border: none;
  font-size: 22px;
  cursor: pointer;
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>