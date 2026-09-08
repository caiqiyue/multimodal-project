<script setup lang="ts">
defineProps<{ content: string; streaming: boolean }>();
</script>

<template>
  <span class="row">
    <span>{{ content }}</span>
    <span v-if="streaming" class="caret">▍</span>
  </span>
</template>

<style scoped>
.row {
  white-space: pre-wrap;
}
.caret {
  color: #888;
  margin-left: 2px;
}
</style>