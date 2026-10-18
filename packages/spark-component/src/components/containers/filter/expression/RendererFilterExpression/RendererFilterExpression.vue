<!--
@module @spark-appworks/spark-component:components/containers/filter/expression/RendererFilterExpression/RendererFilterExpression
职责：标准绑定过滤定义编辑器。边界：读写原DataView字段，持久化由调用页原owner负责。AI用途：以r-filter-expression配置定义维护。
-->
<template>
  <div>
    <p v-if="problem" role="alert">{{ problem }}</p>
    <FilterExpressionEditor v-else-if="readable" :key="revision" :model-value="parsed.tree" :columns="columns"
      v-bind="editorOptions"
      :display="display" :display-mode="displayMode" :on-editing-change="editingForRevision" :disabled="disabled || formDisabled" :readonly="readonly || access?.write !== 'allowed'" :apply-error="error" @update:model-value="applyForRevision" />
  </div>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, watch} from 'vue'
import {useFormDisabled} from 'element-plus'
import {DataViewFilter, DataViewFilterCodec, type DataViewFilterTree} from '@spark-appworks/spark-data'
import {useLayoutDataContext} from '../../../runtime/layout-data-context'
import {useDataViewEventBridge} from '../../../runtime/useDataViewEventBridge'
import {resolveDataViewEditingRow, writeDataViewEditingValue} from '../../../../fields/context/dataViewEditing'
import FilterExpressionEditor from '../FilterExpressionEditor/FilterExpressionEditor.vue'
import type {RFilterExpressionProps} from './RendererFilterExpression.props'

const props = withDefaults(defineProps<RFilterExpressionProps>(), {type: 'r-filter-expression', format: 'tree', display: 'dialog', displayMode: 'box', clearable: undefined})
const editorOptions = computed(() => ({
  functionContext: DataViewFilter.editorContext(props.functionContext),
  ...(props.placeholder === undefined ? {} : {placeholder: props.placeholder}),
  ...(props.title === undefined ? {} : {title: props.title}),
  ...(props.clearable === undefined ? {} : {clearable: props.clearable}),
  ...(props.dialogWidth === undefined ? {} : {dialogWidth: props.dialogWidth}),
  ...(props.autoFullscreenBelow === undefined ? {} : {autoFullscreenBelow: props.autoFullscreenBelow}),
  ...(props.maxDepth === undefined ? {} : {maxDepth: props.maxDepth}),
  ...(props.maxRules === undefined ? {} : {maxRules: props.maxRules}),
}))
const {resolvedView, row, aggregateError} = useLayoutDataContext(props)
const formDisabled = useFormDisabled()
const tick = ref(0), revision = ref(0), candidateRevision = ref(0), error = ref(''), editing = ref(false)
let active = true
onBeforeUnmount(() => {active = false; props.onEditingChange?.(false)})
const refresh = () => {tick.value++}
const invalidate = () => {revision.value++; editing.value = false; error.value = ''; refresh()}
watch(editing, value => props.onEditingChange?.(value), {immediate: true})
const editingForRevision = computed(() => {
  const captured = revision.value
  return (value: boolean): void => {if (active && captured === revision.value) editing.value = value}
})
useDataViewEventBridge({resolvedView, onEditingChanged: refresh, onRowsChanged: invalidate,
  onCleared: invalidate, onConfigChanged: invalidate, onRequestStateChanged: invalidate})
const currentRow = computed(() => {tick.value; return resolveDataViewEditingRow(resolvedView.value, row.value) ?? row.value})
const identity = computed(() => {tick.value; return row.value ? resolvedView.value?.getPkKey(row.value) : undefined})
const accessState = computed(() => {
  tick.value
  try {return {value: resolvedView.value?.fieldAccess(row.value, props.field), error: ''}}
  catch (cause) {return {value: undefined, error: cause instanceof Error ? cause.message : String(cause)}}
})
const access = computed(() => accessState.value.value)
const readable = computed(() => access.value?.read === 'visible')
const editable = computed(() => readable.value && access.value?.write === 'allowed' && !props.disabled && !props.readonly && !formDisabled.value)
const rawValue = computed(() => readable.value ? currentRow.value?.[props.field] : undefined)
const parsed = computed(() => {
  try {
    if (props.format === 'spark-json') {
      const value = rawValue.value
      if (value !== undefined && value !== null && typeof value !== 'string') throw new Error('SPARK过滤定义必须是字符串')
      return {tree: DataViewFilterCodec.parseStored(value)?.toJSON(), error: ''}
    }
    if (rawValue.value === undefined) return {tree: undefined, error: ''}
    const result = DataViewFilter.parse(rawValue.value)
    if (!result.ok) throw new Error(result.issues.map(issue => `${issue.path}: ${issue.message}`).join('\n'))
    return {tree: result.value.toJSON(), error: ''}
  } catch (cause) {return {tree: undefined, error: cause instanceof Error ? cause.message : String(cause)}}
})
const problem = computed(() => aggregateError.value?.message || (!resolvedView.value || identity.value === undefined ? '过滤定义未绑定有效数据行'
  : !resolvedView.value.columns.some(column => column.name === props.field) ? `过滤定义字段不存在：${props.field}` : accessState.value.error || parsed.value.error))
watch([resolvedView, identity, rawValue, editable, () => props.field, () => props.format,
  () => props.display], invalidate, {deep: true, flush: 'sync'})
watch([() => props.columns, () => props.functionContext, () => props.maxDepth, () => props.maxRules], () => {
  candidateRevision.value++; error.value = ''
}, {deep: true, flush: 'sync'})
const applyForRevision = computed(() => {
  const captured = revision.value, candidates = candidateRevision.value
  return (tree: DataViewFilterTree | undefined): void => {
    if (!active || captured !== revision.value || candidates !== candidateRevision.value || !editable.value || problem.value) return
    try {
      const filter = tree === undefined ? undefined : DataViewFilter.parse(tree)
      if (filter && !filter.ok) throw new Error(filter.issues.map(issue => issue.message).join('\n'))
      const value = props.format === 'spark-json' ? DataViewFilterCodec.serializeStored(filter?.value) : filter?.value.toJSON()
      if (!writeDataViewEditingValue({source: resolvedView.value, row: row.value, field: props.field, value})) throw new Error('过滤定义编辑目标已失效')
    } catch (cause) {error.value = cause instanceof Error ? cause.message : String(cause)}
  }
})
</script>
