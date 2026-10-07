<!--
@module @spark-appworks/spark-component:components/fields/data-components/datetime/FieldTimeSelect/FieldTimeSelect
职责：实现 FieldTimeSelect（r-time-select）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 field-level/data-field 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 field time select 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #form>
      <el-time-select
        :model-value="fieldValue"
        :placeholder="placeholder"
        :start="start"
        :end="end"
        :step="step"
        :min-time="minTime"
        :max-time="maxTime"
        :disabled="!isCurrentFieldEditable"
        :clearable="clearable"
        @update:model-value="handleChange"
      />
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
/**
 * @description 时间间隔选择字段，绑定时间字符串值。
 */
import { useBasicFieldState } from '../../composables/state/useBasicFieldState'
import { emitFieldValueUpdate, type FieldValueUpdateEmits } from '../../composables/value/useControlledFieldChange'
import { coerceStringValue } from '../../composables/value/fieldValueCoercion'
import FieldContextRenderer from '../../../non-data-components/FieldContextRenderer.vue'
import type { RTimeSelectProps } from './FieldTimeSelect.props'

const props = withDefaults(defineProps<RTimeSelectProps>(), {
  type: 'r-time-select',
  placeholder: '选择时间',
  start: '08:30',
  end: '18:30',
  step: '00:15',
  clearable: true,
})

const emit = defineEmits<FieldValueUpdateEmits<string>>()

const { permission, fieldCtx, handleControlledChange } = useBasicFieldState<string>({
  props,
  fieldType: 'r-time-select',
  fallbackValue: '',
  formatDisplay: value => (value != null ? String(value) : ''),
  coerce: coerceStringValue,
  emitUpdate: value => emitFieldValueUpdate(emit, value),
})

const { fieldValue, isCurrentFieldEditable } = permission

async function handleChange(value: string): Promise<void> {
  await handleControlledChange(value)
}
</script>

