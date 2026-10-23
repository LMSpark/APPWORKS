<!--
@module @spark-appworks/spark-component:components/fields/data-components/text/FieldText/FieldText
职责：实现 FieldText（r-text）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 field-level/data-field 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 field text 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <FieldContextRenderer v-bind="fieldCtx" :edit-on-dblclick="props.showCellControl ? false : props.editOnDblclick">
    <template #table-cell="{row, value}">
      <span v-if="!props.showCellControl || permission.isTableCellMasked(row)" :class="['field-table-value', props.valueClassName]">{{ value }}</span>
      <FieldTableCellScope v-else :source="permission.dataSource.value ?? undefined" :row="row">
        <FieldText v-bind="cellProps" :readonly="props.readonly || props.cellReadonly?.(row) === true"
          @update:model-value="value => emitFieldValueUpdate(emit, value)" />
      </FieldTableCellScope>
    </template>
    <template #form>
      <el-input
        :model-value="typeof fieldValue === 'string' ? fieldValue : (fieldValue == null ? '' : String(fieldValue))"
        :disabled="!isCurrentFieldEditable"
        :placeholder="placeholder"
        :clearable="clearable"
        :maxlength="maxlength"
        :type="showPassword ? 'password' : 'text'"
        :show-password="showPassword"
        @update:model-value="handleChange"
      />
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
/**
 * @description 文本输入字段，绑定 string 值。
 */
import { useBasicFieldState } from '../../composables/state/useBasicFieldState'
import {computed} from 'vue'
import { emitFieldValueUpdate, type FieldValueUpdateEmits } from '../../composables/value/useControlledFieldChange'
import { coerceStringValue } from '../../composables/value/fieldValueCoercion'
import FieldContextRenderer from '../../../non-data-components/FieldContextRenderer.vue'
import FieldTableCellScope from '../../../non-data-components/FieldTableCellScope.vue'
import type { RTextProps } from './FieldText.props'

const props = withDefaults(defineProps<RTextProps>(), {
  type: 'r-text',
})

const emit = defineEmits<FieldValueUpdateEmits<string>>()
const cellProps = computed<RTextProps>(() => Object.fromEntries(Object.entries(props)
  .filter(([key, value]) => value !== undefined && key !== 'modelValue' && key !== 'value')))

const { permission, fieldCtx, handleControlledChange } = useBasicFieldState<string>({
  props,
  fieldType: 'r-text',
  fallbackValue: '',
  coerce: coerceStringValue,
  formatDisplay: value => props.displayFormatter ? props.displayFormatter(value)
    : value == null || value === '' ? (props.emptyText ?? '') : String(value),
  emitUpdate: value => emitFieldValueUpdate(emit, value),
})

const { fieldValue, isCurrentFieldEditable } = permission

async function handleChange(value: string): Promise<void> {
  await handleControlledChange(value)
}
</script>
