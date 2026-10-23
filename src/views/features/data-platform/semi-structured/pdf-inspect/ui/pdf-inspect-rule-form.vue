<template>
  <section>
    <h2>规则 JSON</h2>
    <textarea :value="text" rows="8" class="pdf-inspect-rule-form" @input="onInput" />
  </section>
</template>
<script setup lang="ts">
import {computed} from 'vue'
import {parseJsonObject} from '@/lowcode/resources/shared/staged-design-file-view'
const props = defineProps<{modelValue: unknown}>()
const emit = defineEmits<{ 'update:modelValue': [value: unknown] }>()
const text = computed(() => JSON.stringify(props.modelValue ?? {}, null, 2))
function onInput(event: Event): void {
  if (!(event.target instanceof HTMLTextAreaElement)) return
  try {emit('update:modelValue', parseJsonObject(event.target.value))}
  catch { /* 编辑态保留 */ }
}
</script>
<style scoped>
.pdf-inspect-rule-form { width: 100%; font-family: monospace; }
</style>
