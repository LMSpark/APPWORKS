<!--
@module @spark-appworks/spark-component:components/fields/data-components/datetime/FieldTimePicker/FieldTimePicker
职责：实现 FieldTimePicker（r-time-picker）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 field-level/data-field 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 field time picker 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #form>
      <el-time-picker
        :model-value="fieldValue"
        :placeholder="placeholder"
        :is-range="isRange"
        :range-separator="rangeSeparator"
        :start-placeholder="startPlaceholder"
        :end-placeholder="endPlaceholder"
        :arrow-control="arrowControl"
        :format="format"
        :disabled="!isCurrentFieldEditable"
        :clearable="clearable"
        @update:model-value="handleChange"
      />
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
/**
 * @description 时间选择字段，绑定时间字符串或 Date 值。
 */
import { useBasicFieldState } from '../../composables/state/useBasicFieldState'
import { emitFieldValueUpdate, type FieldValueUpdateEmits } from '../../composables/value/useControlledFieldChange'
import { coerceStringOrDateValue } from '../../composables/value/fieldValueCoercion'
import FieldContextRenderer from '../../../non-data-components/FieldContextRenderer.vue'
import type { RTimePickerProps } from './FieldTimePicker.props'

const props = withDefaults(defineProps<RTimePickerProps>(), {
  type: 'r-time-picker',
  placeholder: '选择时间',
  isRange: false,
  rangeSeparator: '至',
  startPlaceholder: '开始时间',
  endPlaceholder: '结束时间',
  arrowControl: false,
  format: 'HH:mm:ss',
  clearable: true,
})

const emit = defineEmits<FieldValueUpdateEmits<string | Date>>()

function formatTimeValue(value: unknown): string {
  if (!value) return ''
  if (typeof value === 'string') return value
  if (value instanceof Date) return value.toLocaleTimeString()
  return String(value)
}

const { permission, fieldCtx, handleControlledChange } = useBasicFieldState<string | Date>({
  props,
  fieldType: 'r-time-picker',
  fallbackValue: '',
  formatDisplay: formatTimeValue,
  coerce: coerceStringOrDateValue,
  emitUpdate: value => emitFieldValueUpdate(emit, value),
})

const { fieldValue, isCurrentFieldEditable } = permission

async function handleChange(value: string | Date): Promise<void> {
  await handleControlledChange(value)
}
</script>

