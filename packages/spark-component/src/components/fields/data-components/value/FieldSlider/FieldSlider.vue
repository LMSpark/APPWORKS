<!--
@module @spark-appworks/spark-component:components/fields/data-components/value/FieldSlider/FieldSlider
职责：实现 FieldSlider（r-slider）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 field-level/data-field 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 field slider 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #form>
      <el-slider
        :model-value="fieldValue"
        :min="min"
        :max="max"
        :step="step"
        :disabled="!isCurrentFieldEditable"
        :show-input="showInput"
        @update:model-value="handleChange"
      />
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
/**
 * @description 滑块字段，绑定 number 值。
 */
import { useBasicFieldState } from '../../composables/state/useBasicFieldState'
import { emitFieldValueUpdate, type FieldValueUpdateEmits } from '../../composables/value/useControlledFieldChange'
import { coerceNumberValue } from '../../composables/value/fieldValueCoercion'
import FieldContextRenderer from '../../../non-data-components/FieldContextRenderer.vue'
import type { RSliderProps } from './FieldSlider.props'

const props = withDefaults(defineProps<RSliderProps>(), {
  type: 'r-slider',
  min: 0,
  max: 100,
  step: 1,
  showInput: false,
})

const emit = defineEmits<FieldValueUpdateEmits<number>>()

const { permission, fieldCtx, handleControlledChange } = useBasicFieldState<number>({
  props,
  fieldType: 'r-slider',
  fallbackValue: 0,
  formatDisplay: value => String(value ?? 0),
  coerce: coerceNumberValue,
  emitUpdate: value => emitFieldValueUpdate(emit, value),
})

const { fieldValue, isCurrentFieldEditable } = permission

async function handleChange(value: number): Promise<void> {
  await handleControlledChange(value)
}
</script>

