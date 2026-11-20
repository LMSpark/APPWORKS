<!--
@module @spark-appworks/spark-component:components/fields/data-components/choice/FieldMultiSelect/FieldMultiSelect
职责：实现 FieldMultiSelect（r-multi-select）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 field-level/data-field 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 field multi select 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
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
        :collapse-tags="collapseTags"
        :collapse-tags-tooltip="collapseTagsTooltip"
        :max-collapse-tags="maxCollapseTags"
        multiple
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
 * @description 多选下拉字段，绑定数组值，支持标签折叠（collapseTags）显示。
 */
import { useChoiceFieldState } from '../../composables/state/useChoiceFieldState'
import { emitFieldValueUpdate, type FieldValueUpdateEmits } from '../../composables/value/useControlledFieldChange'
import { coercePrimitiveOptionArray } from '../../composables/value/fieldValueCoercion'
import FieldContextRenderer from '../../../non-data-components/FieldContextRenderer.vue'
import type { RMultiSelectProps, MultiValue } from './FieldMultiSelect.props'

const props = withDefaults(defineProps<RMultiSelectProps>(), {
  type: 'r-multi-select',
  placeholder: '请选择',
  clearable: true,
  filterable: false,
  collapseTags: false,
  collapseTagsTooltip: false,
  maxCollapseTags: 1,
})

const emit = defineEmits<FieldValueUpdateEmits<MultiValue>>()

const {
  fieldOptions: options,
  fieldValue,
  isCurrentFieldEditable,
  fieldCtx,
  handleControlledChange,
} = useChoiceFieldState<MultiValue>({
  props,
  fieldType: 'r-multi-select',
  fallbackValue: [],
  coerce: coercePrimitiveOptionArray,
  emitUpdate: value => emitFieldValueUpdate(emit, value),
})

async function handleChange(value: MultiValue): Promise<void> {
  await handleControlledChange(value)
}
</script>

