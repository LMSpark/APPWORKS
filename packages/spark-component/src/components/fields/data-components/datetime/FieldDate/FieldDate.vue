<!--
@module @spark-appworks/spark-component:components/fields/data-components/datetime/FieldDate/FieldDate
职责：实现 FieldDate（r-date）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 field-level/data-field 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 field date 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #form>
      <el-date-picker
        :model-value="safeDateValue"
        :type="resolvedPickerType"
        :placeholder="isRangeType ? undefined : placeholder"
        :start-placeholder="isRangeType ? startPlaceholder : undefined"
        :end-placeholder="isRangeType ? endPlaceholder : undefined"
        :range-separator="isRangeType ? rangeSeparator : undefined"
        :format="format"
        :value-format="valueFormat"
        :disabled="!isCurrentFieldEditable"
        :clearable="clearable"
        @update:model-value="handleChange"
      />
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
/**
 * @description 日期选择字段，绑定日期/字符串值。
 * @notes type - 选择器类型（'date'|'datetime'|'daterange' 等）
 * @notes format - 显示格式
 * @notes valueFormat - 绑定值格式
 */
import { computed } from 'vue'
import { useBasicFieldState } from '../../composables/state/useBasicFieldState'
import { emitFieldValueUpdate, type FieldValueUpdateEmits } from '../../composables/value/useControlledFieldChange'
import { coerceDateFieldValue } from '../../composables/value/fieldValueCoercion'
import { useRangeFilterMode } from '../../composables/value/useRangeFilterMode'
import FieldContextRenderer from '../../../non-data-components/FieldContextRenderer.vue'
import type { RDateProps, DatePickerType } from './FieldDate.props'

const props = withDefaults(defineProps<RDateProps>(), {
  type: 'r-date',
  placeholder: '选择日期',
  startPlaceholder: '开始日期',
  endPlaceholder: '结束日期',
  rangeSeparator: '至',
  clearable: true,
})

const emit = defineEmits<FieldValueUpdateEmits<string | Date | Array<string | Date>>>()

function formatDateValue(value: unknown): string {
  if (!value) return ''
  if (Array.isArray(value)) return value.map(item => formatDateValue(item)).join(' ~ ')
  if (typeof value === 'string') return value
  if (value instanceof Date) return value.toLocaleDateString()
  return String(value)
}

const isRangeFilter = useRangeFilterMode(props)

const RANGE_TYPES = new Set<string>(['daterange', 'datetimerange', 'monthrange', 'yearrange'])

const resolvedPickerType = computed((): DatePickerType => {
  if (props.dateType) return props.dateType
  return isRangeFilter.value ? 'daterange' : 'date'
})

const isRangeType = computed(() => RANGE_TYPES.has(resolvedPickerType.value))

const { permission, fieldCtx, handleControlledChange } = useBasicFieldState<string | Date | Array<string | Date>>({
  props,
  fieldType: 'r-date',
  fallbackValue: '',
  formatDisplay: formatDateValue,
  coerce: coerceDateFieldValue,
  emitUpdate: value => emitFieldValueUpdate(emit, value),
})

const { fieldValue, isCurrentFieldEditable } = permission

const safeDateValue = computed<string | Date | Array<string | Date> | null>(() => {
  const v = fieldValue.value
  if (v === null || v === undefined) return null
  if (typeof v === 'string' || v instanceof Date || Array.isArray(v)) return v
  return null
})

async function handleChange(value: string | Date | Array<string | Date>): Promise<void> {
  await handleControlledChange(value)
}
</script>
