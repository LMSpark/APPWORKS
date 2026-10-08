<template>
  <div class="data-space-filter-editor">
    <p v-if="parseError" role="alert">过滤配置无法解析：{{ parseError }}</p>
    <FilterExpressionEditor
      v-else
      :key="revision"
      :model-value="filter?.toJSON()"
      :columns="columns"
      :function-context="editorFunctionContext"
      :disabled="disabled"
      @update:model-value="applyForRevision"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { DataViewFilter } from '@spark-appworks/spark-data'
import type { DataViewFilterFunctionContext, DataViewFilterTree } from '@spark-appworks/spark-data'
import { FilterExpressionEditor } from '@spark-appworks/spark-component'
import { DataSpaceDesignApi } from '@spark-appworks/spark-lowcode-api'
import type { DataSpaceFilterEditorProps, DataSpaceFilterEditorValidation } from './DataSpaceFilterEditor.props'
import { createDataSpaceValueFunctionContext } from './data-space-value-function-context'

const props = withDefaults(defineProps<DataSpaceFilterEditorProps>(), { disabled: false })
const emit = defineEmits<{
  change: [event: { contextKey: string; value: string }]
  validation: [event: DataSpaceFilterEditorValidation]
}>()
const revision = ref(0)
const parsed = computed(() => {
  try { return { filter: DataSpaceDesignApi.parseFilter(props.modelValue), error: '' } }
  catch (error) { return { filter: undefined, error: error instanceof Error ? error.message : String(error) } }
})
const filter = computed(() => parsed.value.filter)
const parseError = computed(() => parsed.value.error)

const editorFunctionContext = computed<DataViewFilterFunctionContext>(() => {
  return createDataSpaceValueFunctionContext(props.functionContext)
})

watch(() => [props.contextKey, props.modelValue] as const, ([contextKey, value]) => {
  const message = parsed.value.error
  emit('validation', { contextKey, value, valid: message === '', message })
}, { immediate: true })

watch(() => [props.contextKey, props.modelValue, props.disabled, props.columns, props.functionContext], () => {
  revision.value += 1
}, { deep: true })

const applyForRevision = computed(() => {
  const capturedRevision = revision.value
  const capturedContextKey = props.contextKey
  return (tree: DataViewFilterTree | undefined) => {
    if (capturedRevision !== revision.value || capturedContextKey !== props.contextKey) return
    apply(tree, capturedContextKey)
  }
})

function apply(tree: DataViewFilterTree | undefined, contextKey: string): void {
  if (props.disabled || parseError.value) return
  if (tree === undefined) {
    emit('change', { contextKey, value: DataSpaceDesignApi.serializeFilter(undefined) })
    return
  }
  const result = DataViewFilter.parse(tree)
  if (!result.ok) return
  emit('change', { contextKey, value: DataSpaceDesignApi.serializeFilter(result.value) })
}
</script>
