<!--
@module app:views/app/dev-system/definition/ScenarioDefinitionTextEditor
职责：完整定义的窄文本交互，绑定同一ScenarioDefinitionDocument中的五类正式定义DataView。
边界：仅保留输入尚未通过校验的编辑缓冲；有效文本从原视图投影，写回、撤销及身份检查归定义文档，不执行IO或保存。
AI用途：DevSystem复杂配置文本编辑；不是可绑定任意字段的通用标准组件。
-->
<template>
  <SparkJsonEditor :model-value="text" :read-only="readonly || applying" :height="560" mode="text"
    @update:model-value="edit" />
</template>
<script setup lang="ts">
import {ref, watch} from 'vue'
import {SparkJsonEditor} from '@spark-appworks/spark-component'
import type {ScenarioDefinitionDocument} from '@spark-appworks/spark-project-model'

const props = defineProps<{document: ScenarioDefinitionDocument; revision: number; readonly?: boolean}>()
const emit = defineEmits<{error: [message: string]; changed: []}>()
const text = ref(''), applying = ref(false)
function read(): void {
  try {text.value = props.document.getText(); emit('error', '')}
  catch (cause) {emit('error', cause instanceof Error ? cause.message : String(cause))}
}
watch(() => [props.document, props.revision], () => {if (!applying.value) read()}, {immediate: true})
async function edit(value: string): Promise<void> {
  if (props.readonly || applying.value) return
  const document = props.document
  text.value = value; applying.value = true
  try {await document.setText(value); if (props.document === document) {emit('error', ''); emit('changed')}}
  catch (cause) {if (props.document === document) emit('error', cause instanceof Error ? cause.message : String(cause))}
  finally {applying.value = false; if (props.document !== document) read()}
}
</script>
