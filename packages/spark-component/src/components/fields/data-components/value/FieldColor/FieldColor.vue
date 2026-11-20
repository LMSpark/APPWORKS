<!--
@module @spark-appworks/spark-component:components/fields/data-components/value/FieldColor/FieldColor
职责：实现 FieldColor（r-color）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 field-level/data-field 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 field color 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #table-cell="{ row, value }">
      <span class="color-cell">
        <span class="color-chip" :style="{ backgroundColor: getRowRawStringValue(row) || '#ffffff' }"></span>
        <span>{{ value }}</span>
      </span>
    </template>
    <template #form>
      <el-color-picker
        :model-value="fieldValue"
        :disabled="!isCurrentFieldEditable"
        @update:model-value="handleChange"
      />
    </template>
    <template #tree>
      <span class="color-cell">
        <span class="color-chip" :style="{ backgroundColor: currentRawStringValue || '#ffffff' }"></span>
        <span>{{ currentDisplayValue }}</span>
      </span>
    </template>
    <template #detail>
      <div class="field-display">
        <span class="field-label">{{ fieldCtx.displayLabel }}：</span>
        <span class="color-cell">
          <span class="color-chip" :style="{ backgroundColor: currentRawStringValue || '#ffffff' }"></span>
          <span class="field-value">{{ currentDisplayValue }}</span>
        </span>
      </div>
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
/**
 * @description 颜色选择字段，绑定十六进制颜色字符串，表格/详情模式显示色块预览。
 * @notes showAlpha - 是否支持透明度
 * @notes colorFormat - 颜色格式（'hex'|'rgb'|'hsl'|'hsv'）
 * @notes predefine - 预置颜色列表（string[]）
 */
import { useBasicFieldState } from '../../composables/state/useBasicFieldState'
import { emitFieldValueUpdate, type FieldValueUpdateEmits } from '../../composables/value/useControlledFieldChange'
import { coerceStringValue } from '../../composables/value/fieldValueCoercion'
import FieldContextRenderer from '../../../non-data-components/FieldContextRenderer.vue'
import type { RColorProps } from './FieldColor.props'

const props = withDefaults(defineProps<RColorProps>(), {
  type: 'r-color',
})

const emit = defineEmits<FieldValueUpdateEmits<string>>()

const { permission, fieldCtx, handleControlledChange } = useBasicFieldState<string>({
  props,
  fieldType: 'r-color',
  fallbackValue: '',
  formatDisplay: value => String(value ?? ''),
  coerce: coerceStringValue,
  emitUpdate: value => emitFieldValueUpdate(emit, value),
})

const {
  fieldValue,
  currentRawStringValue,
  isCurrentFieldEditable,
  currentDisplayValue,
  getRowRawStringValue,
} = permission

async function handleChange(value: string | null): Promise<void> {
  const next = value ?? ''
  await handleControlledChange(next)
}
</script>

<style scoped>
.color-cell {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.color-chip {
  width: 14px;
  height: 14px;
  border-radius: 3px;
  border: 1px solid #dcdfe6;
  box-sizing: border-box;
}
</style>

