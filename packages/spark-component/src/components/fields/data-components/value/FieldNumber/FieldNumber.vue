<!--
@module @spark-appworks/spark-component:components/fields/data-components/value/FieldNumber/FieldNumber
职责：实现 FieldNumber（r-number）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 field-level/data-field 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 field number 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #form>
      <div v-if="isRangeFilter" class="field-number-range">
        <el-input-number
          :model-value="rangeStart"
          :min="min"
          :max="max"
          :precision="precision"
          :disabled="!isCurrentFieldEditable"
          @update:model-value="handleRangeStartChange"
        />
        <span class="field-number-range-separator">至</span>
        <el-input-number
          :model-value="rangeEnd"
          :min="min"
          :max="max"
          :precision="precision"
          :disabled="!isCurrentFieldEditable"
          @update:model-value="handleRangeEndChange"
        />
      </div>
      <el-input-number
        v-else
        :model-value="typeof fieldValue === 'number' ? fieldValue : (fieldValue == null ? 0 : (typeof fieldValue === 'boolean' ? 0 : Number(fieldValue)))"
        :min="min"
        :max="max"
        :precision="precision"
        :disabled="!isCurrentFieldEditable"
        @update:model-value="handleChange"
      />
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
/**
 * @description 数字输入字段，绑定 number 值，筛选模式下支持范围（最小-最大）双输入。
 * @notes filterMode - 'range' 启用范围过滤模式
 */
import { useBasicFieldState } from '../../composables/state/useBasicFieldState'
import { emitFieldValueUpdate, type FieldValueUpdateEmits } from '../../composables/value/useControlledFieldChange'
import { coerceNumberRangeValue } from '../../composables/value/fieldValueCoercion'
import { useRangeFilterMode } from '../../composables/value/useRangeFilterMode'
import FieldContextRenderer from '../../../non-data-components/FieldContextRenderer.vue'
import type { RNumberProps } from './FieldNumber.props'
import { computed } from 'vue'

const props = withDefaults(defineProps<RNumberProps>(), {
  type: 'r-number',
})

const emit = defineEmits<FieldValueUpdateEmits<number | [number | undefined, number | undefined]>>()

function formatNumberValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(item => formatNumberValue(item)).join(' ~ ')
  if (typeof value === 'number') return String(value)
  if (value === null || value === undefined || value === '') return '0'
  return String(value)
}

const isRangeFilter = useRangeFilterMode(props)

const { permission, fieldCtx } = useBasicFieldState<number | [number | undefined, number | undefined]>({
  props,
  fieldType: 'r-number',
  fallbackValue: 0,
  formatDisplay: formatNumberValue,
  coerce: coerceNumberRangeValue,
  emitUpdate: value => emitFieldValueUpdate(emit, value),
})

const { fieldValue, isCurrentFieldEditable, syncValue } = permission

const rangeStart = computed(() => Array.isArray(fieldValue.value) ? fieldValue.value[0] : undefined)
const rangeEnd = computed(() => Array.isArray(fieldValue.value) ? fieldValue.value[1] : undefined)

function updateValue(value: number | [number | undefined, number | undefined]): void {
  emitFieldValueUpdate(emit, value)
  syncValue(value)
}

function handleChange(value: number): void {
  updateValue(value)
}

function handleRangeStartChange(value: number | undefined): void {
  updateValue([value, rangeEnd.value])
}

function handleRangeEndChange(value: number | undefined): void {
  updateValue([rangeStart.value, value])
}
</script>

<style scoped>
.field-number-range {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.field-number-range-separator {
  color: #606266;
}
</style>
