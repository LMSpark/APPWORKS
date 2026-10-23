<template>
  <section>
    <h2>转换规则</h2>
    <textarea :value="text" rows="5" class="excel-import-pane" @input="onInput" />
    <RendererButton label="布局查找…" @click="emit('openLookup')" />
    <RendererButton label="规则编辑…" @click="emit('openRule')" />
  </section>
</template>
<script setup lang="ts">
import {computed} from 'vue'
import {RendererButton} from '@spark-appworks/spark-component'
import {parseJsonValue} from '@/lowcode/resources/shared/staged-design-file-view'
const props = defineProps<{modelValue: unknown}>()
const emit = defineEmits<{ 'update:modelValue': [value: unknown]; openLookup: []; openRule: [] }>()
const text = computed(() => JSON.stringify(props.modelValue ?? [], null, 2))
function onInput(event: Event): void {
  if (!(event.target instanceof HTMLTextAreaElement)) return
  try {emit('update:modelValue', parseJsonValue(event.target.value, []))}
  catch { /* 编辑态保留 */ }
}
</script>
