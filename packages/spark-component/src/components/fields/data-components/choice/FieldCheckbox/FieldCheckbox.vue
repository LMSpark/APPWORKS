<!--
@module @spark-appworks/spark-component:components/fields/data-components/choice/FieldCheckbox/FieldCheckbox
职责：实现 FieldCheckbox（r-checkbox）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 field-level/data-field 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 field checkbox 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #table-cell="{row, value}">
      <span v-if="permission.isTableCellMasked(row)">{{ value }}</span>
      <FieldTableCellScope v-else :source="permission.dataSource.value ?? undefined" :row="row">
        <FieldCheckbox v-bind="cellProps" :readonly="props.readonly || props.cellReadonly?.(row) === true"
          @update:model-value="value => emitFieldValueUpdate(emit, value)" />
      </FieldTableCellScope>
    </template>
    <template #form>
      <el-checkbox
        :model-value="fieldValue"
        :disabled="!isCurrentFieldEditable"
        :aria-label="displayLabel"
        @update:model-value="handleChange"
      >
        {{ cell ? checkboxText : checkboxText || displayLabel }}
      </el-checkbox>
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
/**
 * @description 标准复选框字段，交互值为boolean；trueValue/falseValue显式转换写入原字段的值。表格逐行呈现独立控件，复用原视图编辑覆盖和权限。
 * @notes checkedText / uncheckedText - 自定义选中/未选中显示文本（代替 trueLabel / falseLabel）
 */
import {computed, inject} from 'vue'
import { useBasicFieldState } from '../../composables/state/useBasicFieldState'
import { emitFieldValueUpdate, type FieldValueUpdateEmits } from '../../composables/value/useControlledFieldChange'
import { coerceBooleanValue } from '../../composables/value/fieldValueCoercion'
import FieldContextRenderer from '../../../non-data-components/FieldContextRenderer.vue'
import type { RCheckboxProps } from './FieldCheckbox.props'
import FieldTableCellScope from '../../../non-data-components/FieldTableCellScope.vue'
import {TABLE_FIELD_CELL} from '../../../context/tableCellContext'

const props = withDefaults(defineProps<RCheckboxProps>(), {
  type: 'r-checkbox',
  checkedText: '是',
  uncheckedText: '否',
  checkboxText: '',
  trueValue: true,
  falseValue: false,
})
const cell = inject(TABLE_FIELD_CELL, undefined)
// A table cell consumes its row, never the enclosing field's scalar override or Boolean prop default.
const cellProps = computed<RCheckboxProps>(() => Object.fromEntries(Object.entries(props)
  .filter(([key, value]) => value !== undefined && key !== 'modelValue' && key !== 'value')))

const emit = defineEmits<FieldValueUpdateEmits<boolean>>()

function formatCheckboxValue(value: unknown): string {
  return toChecked(value) ? props.checkedText : props.uncheckedText
}

function toChecked(value: unknown): boolean {
  return props.trueValue === true && props.falseValue === false ? coerceBooleanValue(value) : value === props.trueValue
}

const { permission, fieldCtx, handleControlledChange } = useBasicFieldState<boolean>({
  props,
  fieldType: 'r-checkbox',
  fallbackValue: false,
  formatDisplay: formatCheckboxValue,
  coerce: toChecked,
  toSourceValue: value => value ? props.trueValue : props.falseValue,
  emitUpdate: value => emitFieldValueUpdate(emit, value),
})

const { fieldValue, isCurrentFieldEditable, displayLabel } = permission

async function handleChange(value: boolean): Promise<void> {
  await handleControlledChange(value)
}
</script>

