<!--
@module @spark-appworks/spark-component:components/fields/data-components/text/FieldAutocomplete/FieldAutocomplete
职责：实现 FieldAutocomplete（r-autocomplete）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 field-level/data-field 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 field autocomplete 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #form>
      <el-autocomplete
        :model-value="fieldValue"
        :placeholder="placeholder"
        :fetch-suggestions="fetchSuggestions"
        :trigger-on-focus="triggerOnFocus"
        :highlight-first-item="highlightFirstItem"
        :clearable="clearable"
        :disabled="!isCurrentFieldEditable"
        :value-key="valueKey"
        @update:model-value="handleChange"
        @select="handleSelect"
      />
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
/**
 * @description 自动补全输入字段，绑定 string 值。
 */
import { useBasicFieldState } from '../../composables/state/useBasicFieldState'
import { emitFieldValueUpdate, type FieldValueUpdateEmits } from '../../composables/value/useControlledFieldChange'
import { coerceStringValue } from '../../composables/value/fieldValueCoercion'
import FieldContextRenderer from '../../../non-data-components/FieldContextRenderer.vue'
import type { RAutocompleteProps } from './FieldAutocomplete.props'

/** 自动补全候选项的通用数据结构。 */
type SuggestionItem = {
  [key: string]: unknown}

const props = withDefaults(defineProps<RAutocompleteProps>(), {
  type: 'r-autocomplete',
  placeholder: '请输入',
  triggerOnFocus: true,
  highlightFirstItem: false,
  clearable: true,
  valueKey: 'value',
})

const emit = defineEmits<FieldValueUpdateEmits<string> & {
  /**
   * Suggestion selected; 用户从自动完成候选项中选择一项。
   * @param item Selected suggestion option.
   */
  'select': [item: SuggestionItem]
}>()

const { permission, fieldCtx, handleControlledChange } = useBasicFieldState<string>({
  props,
  fieldType: 'r-autocomplete',
  fallbackValue: '',
  formatDisplay: value => (value != null ? String(value) : ''),
  coerce: coerceStringValue,
  emitUpdate: value => emitFieldValueUpdate(emit, value),
})

const { fieldValue, isCurrentFieldEditable } = permission

async function handleChange(value: string): Promise<void> {
  await handleControlledChange(value)
}

function handleSelect(item: SuggestionItem): void {
  emit('select', item)
}
</script>

