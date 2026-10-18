<!--
@module @spark-appworks/spark-component:components/fields/data-components/choice/FieldSelect/FieldSelect
职责：实现 FieldSelect（r-select）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 field-level/data-field 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 field select 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <FieldContextRenderer v-bind="fieldCtx" :edit-on-dblclick="props.showCellControl ? false : props.editOnDblclick">
    <template #table-cell="{row, value}">
      <span v-if="!props.showCellControl || permission.isTableCellMasked(row)" :class="['field-table-value', props.valueClassName]">{{ value }}</span>
      <FieldTableCellScope v-else :source="permission.dataSource.value ?? undefined" :row="row">
        <FieldSelect v-bind="cellProps" :readonly="props.readonly || props.cellReadonly?.(row) === true"
          @update:model-value="value => emitFieldValueUpdate(emit, value)" />
      </FieldTableCellScope>
    </template>
    <template #form>
      <el-tabs v-if="presentation === 'tabs'" class="field-select-tabs" :model-value="fieldValue" @update:model-value="handleTabChange">
        <el-tab-pane v-for="option in options" :key="String(option.value)" :name="option.value" :label="option.label"
          :disabled="!isCurrentFieldEditable || option.disabled === true" />
      </el-tabs>
      <el-select
        v-else
        :model-value="fieldValue"
        :placeholder="placeholder"
        :clearable="clearable"
        :value-on-clear="''"
        :filterable="filterable"
        :persistent="false"
        :disabled="!isCurrentFieldEditable"
        @update:model-value="handleChange"
      >
        <template #label>{{ selectedLabel }}</template>
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
import {computed} from 'vue'
import { useOptionFieldState } from '../../composables/state/useOptionFieldState'
import { emitFieldValueUpdate, type FieldValueUpdateEmits } from '../../composables/value/useControlledFieldChange'
import { coercePrimitiveOptionValue } from '../../composables/value/fieldValueCoercion'
import FieldContextRenderer from '../../../non-data-components/FieldContextRenderer.vue'
import FieldTableCellScope from '../../../non-data-components/FieldTableCellScope.vue'
import type { RSelectProps } from './FieldSelect.props'

const props = withDefaults(defineProps<RSelectProps>(), {
  type: 'r-select',
  placeholder: '请选择',
  clearable: true,
  filterable: false,
})

const emit = defineEmits<FieldValueUpdateEmits<string | number>>()
const cellProps = computed<RSelectProps>(() => Object.fromEntries(Object.entries(props)
  .filter(([key, value]) => value !== undefined && key !== 'modelValue' && key !== 'value')))

const {
  optionResult: permission,
  fieldCtx,
  handleControlledChange,
} = useOptionFieldState<string | number>({
  props,
  fieldType: 'r-select',
  fallbackValue: '',
  coerce: coercePrimitiveOptionValue,
  emitUpdate: value => emitFieldValueUpdate(emit, value),
})
const {options, fieldValue, isCurrentFieldEditable} = permission
// 标题从当前选项源派生，不依赖关闭后已释放或候选变化前的ElOption缓存。
const selectedLabel = computed(() => options.value.find(option => option.value === fieldValue.value)?.label ?? String(fieldValue.value))

async function handleChange(value: string | number): Promise<void> {
  await handleControlledChange(value)
}
async function handleTabChange(value: string | number): Promise<void> {
  if (!isCurrentFieldEditable.value || !options.value.some(option => option.value === value && !option.disabled)) return
  await handleChange(value)
}
</script>

<style scoped>
.field-select-tabs {width:100%; min-width:0;}
.field-select-tabs :deep(.el-tabs__header) {margin:0;}
.field-select-tabs :deep(.el-tabs__content) {display:none;}
</style>

