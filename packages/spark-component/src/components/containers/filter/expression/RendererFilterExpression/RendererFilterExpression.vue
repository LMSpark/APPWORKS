<!--
@module @spark-appworks/spark-component:components/containers/filter/expression/RendererFilterExpression/RendererFilterExpression
职责：标准绑定过滤定义编辑器。边界：读写原DataView字段，持久化沿原DataSet/DataView保存链。AI用途：以r-filter-expression配置定义维护。
-->
<template>
  <div>
    <p v-if="problem" role="alert">{{ problem }}</p>
    <p v-if="columnState.error || contextState.error" role="alert">{{ columnState.error || contextState.error }}</p>
    <FilterExpressionEditor v-if="!problem && readable" :key="revision" :model-value="parsed.tree" :columns="columnState.columns"
      v-bind="editorOptions"
      :display="display" :display-mode="displayMode" :on-editing-change="editingForRevision" :disabled="disabled || formDisabled || !!columnState.error || !!contextState.error" :readonly="readonly || access?.write !== 'allowed'" :apply-error="error" @update:model-value="applyForRevision" />
  </div>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, watch} from 'vue'
import {useFormDisabled} from 'element-plus'
import {DataViewFilter, DataViewFilterCodec, type DataViewFilterTree} from '@spark-appworks/spark-data'
import {useLayoutDataContext} from '../../../runtime/layout-data-context'
import {useDataViewEventBridge} from '../../../runtime/useDataViewEventBridge'
import {resolveDataViewEditingRow, writeDataViewEditingValue} from '../../../../fields/context/dataViewEditing'
import {JsonFieldPath} from '../../../../fields/context/json/json-field-path'
import FilterExpressionEditor from '../FilterExpressionEditor/FilterExpressionEditor.vue'
import {FilterExpressionEditorDraft} from '../FilterExpressionEditor/FilterExpressionEditor.props'
import type {RFilterExpressionProps} from './RendererFilterExpression.props'
import {useInputParameterFunctionContext} from '../../../../fields/options/useInputParameterFunctionContext'
import {useFilterColumnView} from './useFilterColumnView'

const props = withDefaults(defineProps<RFilterExpressionProps>(), {type: 'r-filter-expression', format: 'tree', display: 'dialog', displayMode: 'box', clearable: undefined})
const inputContext=useInputParameterFunctionContext(props)
const columnState=useFilterColumnView(props)
const contextState=computed(()=>{
  const context=inputContext.value,table=props.columnTable
  if(!table||columnState.value.error||!columnState.value.columns.length)return {value:context,error:''}
  if(!table.name.trim())return {value:context,error:'过滤字段目录的模型名称不能为空'}
  if(context.tables?.some(item=>item.name===table.name))return {value:context,error:'过滤字段目录与已声明的值函数模型名称重复'}
  return {value:{...context,tables:[...context.tables??[],{...table,fields:columnState.value.columns.map(column=>({name:column.name,...(column.label===undefined?{}:{label:column.label})}))}]},error:''}
})
const editorOptions = computed(() => ({
  functionContext: DataViewFilter.editorContext(contextState.value.value),
  ...(props.placeholder === undefined ? {} : {placeholder: props.placeholder}),
  ...(props.title === undefined ? {} : {title: props.title}),
  ...(props.clearable === undefined ? {} : {clearable: props.clearable}),
  ...(props.dialogWidth === undefined ? {} : {dialogWidth: props.dialogWidth}),
  ...(props.autoFullscreenBelow === undefined ? {} : {autoFullscreenBelow: props.autoFullscreenBelow}),
  ...(props.maxDepth === undefined ? {} : {maxDepth: props.maxDepth}),
  ...(props.maxRules === undefined ? {} : {maxRules: props.maxRules}),
  ...(props.allowedOperators === undefined ? {} : {allowedOperators: props.allowedOperators}),
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
watch(resolvedView,(view,_previous,cleanup)=>{
  if(!view)return
  const discarded=(ids:ReadonlyArray<string|number>|undefined):void=>{
    const key=identity.value
    if(ids===undefined||(key!==undefined&&ids.includes(key)))invalidate()
  }
  view.events.on('editingDiscarded',discarded)
  cleanup(()=>view.events.off('editingDiscarded',discarded))
},{immediate:true})
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
const rawRoot = computed(() => readable.value ? currentRow.value?.[props.field] : undefined)
const pathValue = computed(() => {
  if (!readable.value || !props.valuePath?.length) return {value: rawRoot.value, identity: '', error: ''}
  try {
    const root = JsonFieldPath.root(rawRoot.value,props.valueFormat !== 'text')
    return {value: JsonFieldPath.read(root, props.valuePath, true), identity: JsonFieldPath.identity(root, props.valuePath), error: ''}
  } catch (cause) {return {value: undefined, identity: '', error: cause instanceof Error ? cause.message : String(cause)}}
})
const rawValue = computed(() => pathValue.value.value)
const parsed = computed(() => {
  try {
    if (pathValue.value.error) throw new Error(pathValue.value.error)
    if (props.format === 'spark-object') {
      const value=rawValue.value
      if(value===null||value===undefined)return {tree:undefined,error:''}
      if(typeof value!=='object'||Array.isArray(value))throw new Error('SPARK过滤定义必须是对象')
      return {tree:DataViewFilterCodec.decode(value).toJSON(),error:''}
    }
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
watch([resolvedView, identity, () => JSON.stringify(rawValue.value), () => pathValue.value.identity, editable, () => props.field, () => props.format, () => props.valueFormat, () => JSON.stringify(props.valuePath ?? []),
  () => props.display, () => props.inputParameterDataViewKey, () => props.columnDataViewKey], invalidate, {flush: 'sync'})
watch([columnState, contextState, () => props.allowedOperators, () => props.maxDepth, () => props.maxRules], () => {
  candidateRevision.value++; error.value = ''
}, {deep: true, flush: 'sync'})
const applyForRevision = computed(() => {
  const captured = revision.value, candidates = candidateRevision.value
  let directory:ReturnType<typeof columnState.resolveSource>
  try{directory=columnState.resolveSource()}catch{directory=null}
  const projection=JSON.stringify(columnState.value)
  return (tree: DataViewFilterTree | undefined): void => {
    if (!active || captured !== revision.value || candidates !== candidateRevision.value || !editable.value || problem.value || columnState.value.error || contextState.value.error) return
    try {
      const currentColumns=columnState.readCurrent()
      if(directory!==columnState.resolveSource()||currentColumns.error||JSON.stringify(currentColumns)!==projection)throw Error('过滤字段目录已变化，请重新确认条件')
      const filter = tree === undefined ? undefined : DataViewFilter.parse(tree)
      if (filter && !filter.ok) throw new Error(filter.issues.map(issue => issue.message).join('\n'))
      if(filter){const issues=filter.value.validate({fields:FilterExpressionEditorDraft.fields(columnState.value.columns,props.allowedOperators)})
        if(issues.length)throw Error(issues.map(issue=>`${issue.path}: ${issue.message}`).join('\n'))}
      const value = props.format === 'spark-json' ? DataViewFilterCodec.serializeStored(filter?.value)
        : props.format === 'spark-object' ? filter ? DataViewFilterCodec.encode(filter.value) : null : filter?.value.toJSON()
      let stored:unknown=value
      if(props.valuePath?.length){
        const next=JsonFieldPath.replace(JsonFieldPath.root(rawRoot.value,props.valueFormat!=='text'),props.valuePath,value,true)
        stored=props.valueFormat==='text'?JSON.stringify(next):next
      }
      if (!writeDataViewEditingValue({source: resolvedView.value, row: row.value, field: props.field, value: stored})) throw new Error('过滤定义编辑目标已失效')
    } catch (cause) {error.value = cause instanceof Error ? cause.message : String(cause)}
  }
})
</script>
