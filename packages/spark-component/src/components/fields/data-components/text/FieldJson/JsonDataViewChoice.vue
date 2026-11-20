<!--
@module @spark-appworks/spark-component:components/fields/data-components/text/FieldJson/JsonDataViewChoice
FieldJson内部的标量及原生标量数组选项控件，复用同一DataView选项解析，不查询、编辑选项记录或保存数据。
-->
<template>
  <p v-if="state.error" role="alert">{{ state.error }}</p>
  <template v-else>
    <span v-if="nonScalar">当前值：{{ JSON.stringify(modelValue) }}</span>
    <p v-if="unmatched.length" role="status">未匹配选项：{{ unmatched.join('、') }}</p>
    <el-select :key="allowCreate ? controlIntent.key : undefined" :model-value="controlValue" :multiple="multiple" :disabled="state.disabled" :aria-label="label" :persistent="false"
      :filterable="allowCreate" :allow-create="creationEnabled" :clearable="allowCreate" :value-on-clear="''"
      placeholder="未配置" @update:model-value="controlIntent.choose">
      <template #label="selected">{{ optionLabel(multiple ? selected.value : modelValue) }}</template>
      <el-option v-for="(option, index) in state.options" :key="index" :value="option.value" :label="option.label" :disabled="option.disabled" />
    </el-select>
  </template>
</template>
<script setup lang="ts">
import {computed, onBeforeUnmount} from 'vue'
import {parseDataViewKey} from '@spark-appworks/spark-data'
import {PAGE_RUNTIME, useSparkConsume} from '../../../../internal'
import {useFieldOptions} from '../../../options/useFieldOptions'

const props = defineProps<{
  /** 原JSON成员值，不填默认值或改变未知值。 */
  modelValue: unknown
  /** 必须包含场景、正式模型及视图身份的选项键。 */
  optionDataViewKey: string
  /** JSON成员的显示标题。 */
  label?: string
  /** 原字段只读或提交锁，只能进一步限制交互。 */
  disabled: boolean
  /** 数组成员直接读写原生标量数组，不转换为对象行。 */
  multiple?: boolean
  /** 数组items声明的标量类型；不转换候选或已有值。 */
  itemType?: string | undefined
  /** 仅由Schema显式声明的字符串成员启用，不新增选项记录或开放数组任意输入。 */
  allowCreate?: boolean
}>()
/** 保持原生类型的JSON标量选项值。 */
type Scalar = string | number | boolean
const emit = defineEmits<{'update:modelValue': [value: Scalar | Scalar[], isCurrentIntent: () => boolean]}>()
const {sparkConsume} = useSparkConsume(), runtime = sparkConsume(PAGE_RUNTIME)
let active = true
const source = computed(() => {
  try {
    if (!parseDataViewKey(props.optionDataViewKey)?.scope) throw new Error('JSON_OPTION_VIEW: 选项必须使用完整数据视图键')
    const view = runtime?.resolveView(props.optionDataViewKey)
    if (!view) throw new Error(`DATA_VIEW_MISSING: ${props.optionDataViewKey}`)
    return {view, error: ''}
  } catch (cause) {return {view: undefined, error: cause instanceof Error ? cause.message : String(cause)}}
})
const helpers = useFieldOptions({get optionDataViewKey() {return source.value.view ? props.optionDataViewKey : undefined}})
const state = computed(() => {
  const options = helpers.flatOptions.value, view = source.value.view
  return {options, error: source.value.error || helpers.optionError.value,
    disabled: props.disabled || !view || view.destroyed || !helpers.optionsAvailable.value}
})
function scalar(value: unknown): value is Scalar {return ['string', 'number', 'boolean'].includes(typeof value)}
const nonScalar = computed(() => props.modelValue !== undefined && props.modelValue !== null
  && (props.multiple ? !Array.isArray(props.modelValue) || !props.modelValue.every(scalar) : !scalar(props.modelValue)))
const controlValue = computed(() => nonScalar.value ? props.multiple ? [] : undefined : props.modelValue)
const creationEnabled = computed(() => props.allowCreate === true && !props.multiple && !state.value.disabled && helpers.optionsReady.value)
const controlIntent = computed(() => {
  void props.optionDataViewKey; void props.allowCreate; void props.multiple; void props.itemType; void source.value.view; void helpers.flatOptions.value
  const valid = helpers.captureOptionsGuard(), key=Symbol()
  return {key, choose: (value: unknown) => {if (valid()) choose(value,key)}}
})
const unmatched = computed(() => (props.multiple && Array.isArray(props.modelValue) ? props.modelValue : [])
  .filter(scalar).filter(value => !state.value.options.some(option => option.value === value)))
function optionLabel(value: unknown): string {return state.value.options.find(option => option.value === value)?.label ?? String(value ?? '')}
function matchesItemType(value: Scalar): boolean {
  return !props.itemType || props.itemType === typeof value || props.itemType === 'integer' && typeof value === 'number' && Number.isInteger(value)
}
function choose(value: unknown, key: symbol): void {
  const view = source.value.view
  if (!active || state.value.disabled || !view || view.destroyed || view.dataSet?.destroyed) return
  const multiple=props.multiple===true, creating=props.allowCreate===true
  const sourceValid=helpers.captureOptionsGuard(), previous:unknown[]=Array.isArray(props.modelValue)?[...props.modelValue]:[]
  let next:Scalar|Scalar[]
  if(multiple){if(!Array.isArray(value)||!value.every(scalar)||new Set(value).size!==value.length)return;next=[...value]}
  else {if(!scalar(value))return;next=value}
  const initialCandidate=!multiple&&state.value.options.some(option=>option.value===next)
  const valid=()=>{
    if(!active||view!==source.value.view||view.destroyed||view.dataSet?.destroyed||controlIntent.value.key!==key||!sourceValid()||multiple!==(props.multiple===true))return false
    if(creating&&(!props.allowCreate||!helpers.optionsReady.value))return false
    if(Array.isArray(next))return next.every(item=>previous.includes(item)||matchesItemType(item)&&state.value.options.some(option=>option.value===item&&option.disabled!==true))
    const candidate=state.value.options.find(option=>option.value===next)
    if(initialCandidate)return candidate!==undefined&&candidate.disabled!==true
    return creating&&props.allowCreate===true&&typeof next==='string'&&(next===''||!!next.trim())&&candidate?.disabled!==true
  }
  if(valid())emit('update:modelValue',next,valid)
}

onBeforeUnmount(() => {active = false})
</script>
