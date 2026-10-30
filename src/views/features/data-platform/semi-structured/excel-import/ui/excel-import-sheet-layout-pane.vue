<template>
  <section>
    <h2>Sheet 布局</h2>
    <textarea :value="text" rows="5" class="excel-import-pane" @input="onInput" />
  </section>
</template>
<script setup lang="ts">
import {computed} from 'vue'
import {parseJsonValue} from '@/lowcode/resources/repository/staged-design-file-view'
const props = defineProps<{modelValue: unknown}>()
const emit = defineEmits<{ 'update:modelValue': [value: unknown] }>()
const text = computed(() => JSON.stringify(props.modelValue ?? [], null, 2))
function onInput(event: Event): void {
  if (!(event.target instanceof HTMLTextAreaElement)) return
  try {emit('update:modelValue', parseJsonValue(event.target.value, []))}
  catch { /* 编辑态保留 */ }
}
</script>
<style scoped>
.excel-import-pane { width: 100%; font-family: monospace; }
</style>
