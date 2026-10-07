<!--
@module @spark-appworks/spark-component:components/fields/data-components/choice/FieldSelect/FieldSelect
职责：实现 FieldSelect（r-select）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 field-level/data-field 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 field select 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #form>
      <el-select
        :model-value="fieldValue"
        :placeholder="placeholder"
        :clearable="clearable"
        :filterable="filterable"
        :disabled="!isCurrentFieldEditable"
        @update:model-value="handleChange"
      >
        <el-option
          v-for="option in options"
          :key="String(option.value)"
          :label="option.label"
          :value="option.value"
          :disabled="option.disabled || undefined"
        />
      </el-select>
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
/**
 * @description 单选下拉字段，绑定 string/number 值，支持静态选项列表或 optionDataViewKey 动态数据源绑定。
 */
import { useChoiceFieldState } from '../../composables/state/useChoiceFieldState'
import { emitFieldValueUpdate, type FieldValueUpdateEmits } from '../../composables/value/useControlledFieldChange'
import { coercePrimitiveOptionValue } from '../../composables/value/fieldValueCoercion'
import FieldContextRenderer from '../../../non-data-components/FieldContextRenderer.vue'
import type { RSelectProps } from './FieldSelect.props'

const props = withDefaults(defineProps<RSelectProps>(), {
  type: 'r-select',
  placeholder: '请选择',
  clearable: true,
  filterable: false,
})

const emit = defineEmits<FieldValueUpdateEmits<string | number>>()

const {
  fieldOptions: options,
  fieldValue,
  isCurrentFieldEditable,
  fieldCtx,
  handleControlledChange,
} = useChoiceFieldState<string | number>({
  props,
  fieldType: 'r-select',
  fallbackValue: '',
  coerce: coercePrimitiveOptionValue,
  emitUpdate: value => emitFieldValueUpdate(emit, value),
})

async function handleChange(value: string | number): Promise<void> {
  await handleControlledChange(value)
}
</script>

