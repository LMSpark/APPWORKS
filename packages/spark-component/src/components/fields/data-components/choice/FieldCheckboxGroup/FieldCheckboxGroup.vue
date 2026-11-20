<!--
@module @spark-appworks/spark-component:components/fields/data-components/choice/FieldCheckboxGroup/FieldCheckboxGroup
职责：实现 FieldCheckboxGroup（r-checkbox-group）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 field-level/data-field 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 field checkbox group 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #form>
      <el-checkbox-group :model-value="fieldValue" :disabled="!isCurrentFieldEditable" @update:model-value="handleChange">
        <component
          :is="buttonStyle ? 'el-checkbox-button' : 'el-checkbox'"
          v-for="option in options"
          :key="String(option.value)"
          :label="option.value"
          :disabled="option.disabled || undefined"
        >
          {{ option.label }}
        </component>
      </el-checkbox-group>
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
/**
 * @description 复选框组字段，绑定数组值，可切换按钮样式。
 */
import { useOptionFieldState } from '../../composables/state/useOptionFieldState'
import { emitFieldValueUpdate, type FieldValueUpdateEmits } from '../../composables/value/useControlledFieldChange'
import { coercePrimitiveOptionArray } from '../../composables/value/fieldValueCoercion'
import FieldContextRenderer from '../../../non-data-components/FieldContextRenderer.vue'
import type { CheckboxGroupMultiValue, RCheckboxGroupProps } from './FieldCheckboxGroup.props'

const props = withDefaults(defineProps<RCheckboxGroupProps>(), {
  type: 'r-checkbox-group',
  buttonStyle: false,
})

const emit = defineEmits<FieldValueUpdateEmits<CheckboxGroupMultiValue>>()

const { optionResult, fieldCtx, handleControlledChange } = useOptionFieldState<CheckboxGroupMultiValue>({
  props,
  fieldType: 'r-checkbox-group',
  fallbackValue: [],
  coerce: coercePrimitiveOptionArray,
  emitUpdate: value => emitFieldValueUpdate(emit, value),
})

const { options, fieldValue, isCurrentFieldEditable } = optionResult

async function handleChange(value: CheckboxGroupMultiValue): Promise<void> {
  await handleControlledChange(value)
}
</script>
