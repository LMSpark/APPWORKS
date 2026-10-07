<!--
@module @spark-appworks/spark-component:components/fields/data-components/picker/FieldTreeSelect/FieldTreeSelect
职责：实现 FieldTreeSelect（r-tree-select）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 field-level/data-field 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 field tree select 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #form>
      <el-tree-select
        :model-value="fieldValue"
        :data="options"
        :placeholder="placeholder"
        :clearable="clearable"
        :filterable="filterable"
        :multiple="multiple"
        :check-strictly="checkStrictly"
        :default-expand-all="defaultExpandAll"
        :render-after-expand="renderAfterExpand"
        :disabled="!isCurrentFieldEditable"
        @update:model-value="handleChange"
      />
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
/**
 * @description 树形选择字段，绑定单值或数组。
 */
import { useOptionFieldState } from '../../composables/state/useOptionFieldState'
import { emitFieldValueUpdate, type FieldValueUpdateEmits } from '../../composables/value/useControlledFieldChange'
import { coerceTreeSelectValue } from '../../composables/value/fieldValueCoercion'
import FieldContextRenderer from '../../../non-data-components/FieldContextRenderer.vue'
import type { RTreeSelectProps } from './FieldTreeSelect.props'

const props = withDefaults(defineProps<RTreeSelectProps>(), {
  type: 'r-tree-select',
  placeholder: '请选择',
  clearable: true,
  filterable: false,
  multiple: false,
  checkStrictly: false,
  defaultExpandAll: false,
  renderAfterExpand: true,
})

const emit = defineEmits<FieldValueUpdateEmits<string | number | boolean | Array<string | number | boolean>>>()

const { optionResult, fieldCtx, handleControlledChange } = useOptionFieldState<string | number | boolean | Array<string | number | boolean>>({
  props,
  fieldType: 'r-tree-select',
  fallbackValue: '',
  coerce: coerceTreeSelectValue,
  emitUpdate: value => emitFieldValueUpdate(emit, value),
})

const { options, fieldValue, isCurrentFieldEditable } = optionResult

async function handleChange(value: string | number | boolean | Array<string | number | boolean>): Promise<void> {
  await handleControlledChange(value)
}
</script>

