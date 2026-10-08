<template>
  <div class="data-space-value-function-editor">
    <p v-if="parseError" role="alert">ValueFun 无法解析，原文已保留：{{ parseError }}</p>
    <p v-else-if="unknownType" role="alert">当前上下文没有 {{ parsedValue?.Type }} 的编辑定义，原文已保留；可选择新函数修正或显式清空。</p>
    <p v-else-if="parsedValue">当前值函数：{{ functionLabel }}</p>
    <p v-else>未配置值函数</p>
    <el-button data-action="edit" :disabled="disabled" @click="openForSession">编辑值函数</el-button>
    <el-button v-if="hasValue" data-action="clear" :disabled="disabled" @click="clearForSession">清空值函数</el-button>
    <FilterValueFunctionDialog
      :key="revision"
      :model-value="dialogVisible"
      :value="dialogValue"
      :context="editorFunctionContext"
      @update:model-value="dialogVisibilityForSession"
      @confirm="confirmForSession"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { getDataViewFilterFunctionDefinitions } from '@spark-appworks/spark-data'
import type { DataViewFilterFunctionContext, DataViewFilterValueFunction } from '@spark-appworks/spark-data'
import { FilterValueFunctionDialog } from '@spark-appworks/spark-component'
import { DataSpaceDesignApi } from '@spark-appworks/spark-lowcode-api'
import { createDataSpaceValueFunctionContext } from './data-space-value-function-context'
import type { DataSpaceValueFunctionEditorProps } from './DataSpaceValueFunctionEditor.props'

type FilterFunctionDefinition = NonNullable<DataViewFilterFunctionContext['definitions']>[number]
const props = withDefaults(defineProps<DataSpaceValueFunctionEditorProps>(), { disabled: false })
const emit = defineEmits<{ change: [event: { contextKey: string; value: string }] }>()
const revision = ref(0)
const dialogVisible = ref(false)
const parsed = computed(() => {
  try { return { value: DataSpaceDesignApi.parseValueFunction(props.modelValue), error: '' } }
  catch (error) { return { value: undefined, error: error instanceof Error ? error.message : String(error) } }
})
const parsedValue = computed(() => parsed.value.value)
const parseError = computed(() => parsed.value.error)
const hasValue = computed(() => typeof props.modelValue === 'string' && props.modelValue.trim() !== '')
const editorFunctionContext = computed(() => {
  const context = createDataSpaceValueFunctionContext(props.functionContext)
  const constantDefinition: FilterFunctionDefinition = {
    type: 'GetConstValue',
    label: '常量',
    fields: [{ key: 'Value', label: '常量值', control: 'json', required: true }],
  }
  const definitions = (context.definitions ?? []).filter(item => item.type !== constantDefinition.type)
  return { ...context, definitions: [...definitions, constantDefinition] }
})
const knownTypes = computed(() => new Set(getDataViewFilterFunctionDefinitions(editorFunctionContext.value).map(item => item.type)))
const unknownType = computed(() => Boolean(parsedValue.value && !knownTypes.value.has(parsedValue.value.Type)))
const functionLabel = computed(() => getDataViewFilterFunctionDefinitions(editorFunctionContext.value)
  .find(item => item.type === parsedValue.value?.Type)?.label ?? parsedValue.value?.Type ?? '')
const dialogValue = computed<DataViewFilterValueFunction>(() => parsedValue.value ?? { Type: '' })

watch(() => [props.contextKey, props.modelValue, props.disabled, props.functionContext], () => {
  revision.value += 1
  dialogVisible.value = false
}, { deep: true, flush: 'sync' })

const openForSession = computed(() => {
  const capturedRevision = revision.value
  return () => {
    if (capturedRevision !== revision.value || props.disabled) return
    dialogVisible.value = true
  }
})

const clearForSession = computed(() => {
  const capturedRevision = revision.value
  const capturedContextKey = props.contextKey
  const capturedValue = props.modelValue
  return () => {
    if (capturedRevision !== revision.value || capturedContextKey !== props.contextKey
      || capturedValue !== props.modelValue || props.disabled || !hasValue.value) return
    emit('change', { contextKey: capturedContextKey, value: '' })
  }
})

const dialogVisibilityForSession = computed(() => {
  const capturedRevision = revision.value
  return (visible: boolean) => {
    if (capturedRevision !== revision.value) return
    dialogVisible.value = visible
  }
})

const confirmForSession = computed(() => {
  const capturedRevision = revision.value
  const capturedContextKey = props.contextKey
  const capturedValue = props.modelValue
  return (value: DataViewFilterValueFunction) => {
    if (capturedRevision !== revision.value || capturedContextKey !== props.contextKey
      || capturedValue !== props.modelValue || props.disabled) return
    const serialized = JSON.stringify(value)
    if (typeof serialized !== 'string' || !DataSpaceDesignApi.parseValueFunction(serialized)) return
    emit('change', { contextKey: capturedContextKey, value: serialized })
  }
})
</script>
