<template>
  <section>
    <h2>节点</h2>
    <textarea :value="text" :disabled="disabled" rows="6" class="workflow-design-panel" @input="onInput" />
  </section>
</template>
<script setup lang="ts">
import {computed} from 'vue'
const props = defineProps<{modelValue: unknown; disabled?: boolean}>()
const emit = defineEmits<{ 'update:modelValue': [value: unknown] }>()
const text = computed(() => JSON.stringify(props.modelValue ?? [], null, 2))
function onInput(event: Event): void {
  if (!(event.target instanceof HTMLTextAreaElement)) return
  const raw = event.target.value
  try {
    const parsed: unknown = JSON.parse(raw)
    emit('update:modelValue', parsed)
  }
  catch { /* 保留编辑态，保存前由服务端校验 */ }
}
</script>
<style scoped>
.workflow-design-panel { width: 100%; font-family: monospace; }
</style>
