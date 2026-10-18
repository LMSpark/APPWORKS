<!--
@module @spark-appworks/spark-component:components/fields/data-components/value/FieldValueFunction/FieldValueFunction
职责：把值函数弹窗接入标准字段绑定、权限和事件链。
边界：确认时写回原DataView编辑域；取消、失权和切换均不写回，不执行函数。
AI用途：业务页通过r-value-function配置，不复制值函数草稿和保存逻辑。
-->
<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #table-cell="{row, value}">
      <span v-if="state.isTableCellMasked(row)">{{ value }}</span>
      <FieldTableCellScope v-else :source="state.dataSource.value ?? undefined" :row="row">
        <FieldValueFunction v-bind="cellProps" :readonly="props.readonly || props.cellReadonly?.(row) === true"
          @update:model-value="value => emit('update:modelValue', value)" />
      </FieldTableCellScope>
    </template>
    <template #form>
      <div>
        <el-input v-if="cell" data-function-text :model-value="state.fieldValue.value" :disabled="!state.isCurrentFieldEditable.value"
          clearable placeholder="请输入值函数或点击设置" @update:model-value="changeText">
          <template #append><el-button data-function-open :disabled="!state.isCurrentFieldEditable.value" @click.stop="open">设置</el-button></template>
        </el-input>
        <template v-else>
          <span>{{ state.currentDisplayValue.value || '未配置' }}</span>
          <el-button data-function-open :disabled="!state.isCurrentFieldEditable.value" @click.stop="open">编辑值函数</el-button>
          <el-button v-if="state.fieldValue.value" data-function-clear :disabled="!state.isCurrentFieldEditable.value || visible" @click.stop="changeText('')">清空值函数</el-button>
        </template>
        <p v-if="diagnostic" role="alert" data-function-diagnostic>{{ diagnostic }}</p>
        <p v-if="error" role="alert">{{ error }}</p>
        <FilterValueFunctionDialog v-if="visible" :key="revision" :model-value="visible" :value="parsed"
          :context="context" @update:model-value="visible = $event" @confirm="confirmForRevision" />
      </div>
    </template>
  </FieldContextRenderer>
</template>
<script setup lang="ts">
import {computed, inject, onBeforeUnmount, ref, watch} from 'vue'
import {DataViewFilter, getDataViewFilterFunctionDefinitions, type DataViewFilterJsonValue, type DataViewFilterValueFunction} from '@spark-appworks/spark-data'
import {useFieldPermission} from '../../../context/useFieldPermission'
import {useFieldOptions} from '../../../options/useFieldOptions'
import {useFieldControlState} from '../../composables/state/useFieldControlState'
import FieldContextRenderer from '../../../non-data-components/FieldContextRenderer.vue'
import FieldTableCellScope from '../../../non-data-components/FieldTableCellScope.vue'
import {TABLE_FIELD_CELL} from '../../../context/tableCellContext'
import FilterValueFunctionDialog from '../../../../containers/filter/value/FilterValueFunctionDialog/FilterValueFunctionDialog.vue'
import type {RValueFunctionProps} from './FieldValueFunction.props'

const props = withDefaults(defineProps<RValueFunctionProps>(), {type: 'r-value-function'})
const cell = inject(TABLE_FIELD_CELL, undefined)
const cellProps = computed<RValueFunctionProps>(() => Object.fromEntries(Object.entries(props)
  .filter(([key, value]) => value !== undefined && key !== 'modelValue' && key !== 'value')))
const emit = defineEmits<{'update:modelValue': [value: string]}>()
const options = useFieldOptions({get optionDataViewKey() {return props.publicParameterDataViewKey}})
const inputOptions = useFieldOptions({get optionDataViewKey() {return props.inputParameterDataViewKey}})
const context = computed(() => {
  const configured = DataViewFilter.editorContext({...props.functionContext,
    ...(props.inputParameterDataViewKey === undefined ? {} : {inputParams: inputOptions.flatOptions.value.map(({value, label}) => ({value, label}))}),
    ...(props.publicParameterDataViewKey === undefined ? {} : {apiPublicParams: options.flatOptions.value.map(({value, label}) => ({value, label}))})})
  return {...configured, definitions: [...(configured.definitions ?? []).filter(definition => definition.type !== 'GetConstValue'),
    {...configured.definitions?.find(definition => definition.type === 'GetConstValue'),
      type: 'GetConstValue', label: '常量', fields: [{key: 'Value', label: '常量值', control: 'json' as const, required: true}]}]}
})
const state = useFieldPermission<string>({props, type: 'r-value-function', fallbackValue: '', coerce: value => typeof value === 'string' ? value : '',
  formatDisplay: value => {
    if (!value) return ''
    try {const parsed: unknown = JSON.parse(String(value)); return parsed && typeof parsed === 'object' && 'Type' in parsed ? String(parsed.Type) : '原始文本'}
    catch {return '原始文本'}
  }})
const {fieldCtx, handleControlledChange} = useFieldControlState({props, fieldType: 'r-value-function', state, emitUpdate: value => emit('update:modelValue', value)})
const visible = ref(false), revision = ref(0), error = ref('')
function isValueFunction(value: DataViewFilterJsonValue | undefined): value is DataViewFilterValueFunction {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && 'Type' in value && typeof value['Type'] === 'string'
}
const parsed = computed<DataViewFilterValueFunction>(() => {
  if (!state.fieldValue.value) return {Type: 'GetConstValue'}
  try {
    const value: unknown = JSON.parse(state.fieldValue.value)
    const result = DataViewFilter.parse({field: 'value', operator: 'eq', value})
    const tree = result.ok ? result.value.toJSON() : undefined
    if (tree && 'field' in tree && isValueFunction(tree.value)) return tree.value
  } catch { /* 损坏原文保留，用户显式选择函数后才可替换。 */ }
  return {Type: ''}
})
const diagnostic = computed(() => {
  if (!state.fieldValue.value) return ''
  if (!parsed.value.Type) return '值函数原文已保留；格式无效，请明确选择函数修复或清空。'
  if (!getDataViewFilterFunctionDefinitions(context.value).some(item => item.type === parsed.value.Type)) return '值函数原文已保留；当前上下文不支持此类型，请明确选择可用函数后替换。'
  return ''
})
watch([state.dataSource, state.contextData, state.fieldName, state.fieldValue, state.isCurrentFieldEditable,
  () => props.publicParameterDataViewKey, () => props.inputParameterDataViewKey], () => {
  revision.value++; visible.value = false; error.value = ''
}, {flush: 'sync'})
watch(visible, value => props.onDialogVisibleChange?.(value), {flush: 'sync'})
onBeforeUnmount(() => {if (visible.value) visible.value = false})
function open(): void {
  if (!state.isCurrentFieldEditable.value) return
  revision.value++; visible.value = true
}
async function changeText(value: string): Promise<void> {
  try {await handleControlledChange(value)}
  catch (cause) {error.value = cause instanceof Error ? cause.message : String(cause)}
}
const confirmForRevision = computed(() => {
  const own = revision.value, candidates = context.value, valid = state.captureWriteGuard()
  return async (value: DataViewFilterValueFunction): Promise<void> => {
    if (!visible.value || own !== revision.value || candidates !== context.value || !valid()) return
    try {
      if (!getDataViewFilterFunctionDefinitions(candidates).some(definition => definition.type === value.Type)) throw new Error(`当前上下文不支持值函数 ${value.Type}`)
      const issues = DataViewFilter.condition({field: 'value', operator: 'eq', value}).validate({fields: [{name: 'value', type: 'text'}], valueFunctions: candidates})
      if (issues.length) throw new Error(issues.map(issue => issue.message).join('\n'))
      await handleControlledChange(JSON.stringify(value))
    } catch (cause) {error.value = cause instanceof Error ? cause.message : String(cause)}
  }
})
</script>
