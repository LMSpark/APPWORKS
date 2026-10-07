<!--
@module @spark-appworks/spark-component:components/fields/data-components/choice/FieldCheckbox/FieldCheckbox
职责：实现 FieldCheckbox（r-checkbox）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 field-level/data-field 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 field checkbox 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #form>
      <el-checkbox
        :model-value="fieldValue"
        :disabled="!isCurrentFieldEditable"
        @update:model-value="handleChange"
      >
        {{ checkboxText || displayLabel }}
      </el-checkbox>
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
/**
 * @description 单个复选框字段，绑定 boolean 值，支持自定义选中/未选中显示文本。
 * @notes checkedText / uncheckedText - 自定义选中/未选中显示文本（代替 trueLabel / falseLabel）
 */
import { useBasicFieldState } from '../../composables/state/useBasicFieldState'
import { emitFieldValueUpdate, type FieldValueUpdateEmits } from '../../composables/value/useControlledFieldChange'
import { coerceBooleanValue } from '../../composables/value/fieldValueCoercion'
import FieldContextRenderer from '../../../non-data-components/FieldContextRenderer.vue'
import type { RCheckboxProps } from './FieldCheckbox.props'

const props = withDefaults(defineProps<RCheckboxProps>(), {
  type: 'r-checkbox',
  checkedText: '是',
  uncheckedText: '否',
  checkboxText: '',
})

const emit = defineEmits<FieldValueUpdateEmits<boolean>>()

function formatCheckboxValue(value: unknown): string {
  return value ? props.checkedText : props.uncheckedText
}

const { permission, fieldCtx, handleControlledChange } = useBasicFieldState<boolean>({
  props,
  fieldType: 'r-checkbox',
  fallbackValue: false,
  formatDisplay: formatCheckboxValue,
  coerce: coerceBooleanValue,
  emitUpdate: value => emitFieldValueUpdate(emit, value),
})

const { fieldValue, isCurrentFieldEditable, displayLabel } = permission

async function handleChange(value: boolean): Promise<void> {
  await handleControlledChange(value)
}
</script>

