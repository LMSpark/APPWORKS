<!--
@module @spark-appworks/spark-component:components/fields/data-components/choice/FieldSegmented/FieldSegmented
职责：实现 FieldSegmented（r-segmented）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 field-level/data-field 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 field segmented 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <el-segmented
    v-if="isVisible"
    :model-value="selectedValue"
    :options="resolvedOptions"
    :size="size"
    :block="block"
    :disabled="isDisabled || !isCurrentFieldEditable"
    @update:model-value="handleChange"
  />
</template>

<script setup lang="ts">
/**
 * @description 分段选择器字段，绑定 string/number 值。
 */
import { ref, computed, watch } from 'vue'
import { useSparkPageComponent } from '../../../../internal'
import { emitFieldValueUpdate, type FieldValueUpdateEmits } from '../../composables/value/useControlledFieldChange'
import { useOptionFieldState } from '../../composables/state/useOptionFieldState'
import { coercePrimitiveOptionValue } from '../../composables/value/fieldValueCoercion'
import type { RSegmentedProps } from './FieldSegmented.props'

const props = withDefaults(defineProps<RSegmentedProps>(), {
  type: 'r-segmented',
  size: 'default',
  block: false,
})

const emit = defineEmits<FieldValueUpdateEmits<string | number> & {
  /**
   * Segmented value changed; 用户切换分段选项。
   * @param value Next selected segment value.
   */
  change: [value: string | number]
}>()

const { isVisible, isDisabled } = useSparkPageComponent(props)

const { optionResult, handleControlledChange } = useOptionFieldState<string | number>({
  props,
  fieldType: 'r-segmented',
  fallbackValue: '',
  coerce: coercePrimitiveOptionValue,
  emitUpdate: value => emitFieldValueUpdate(emit, value),
})

const { options: fieldOptions, fieldValue, isCurrentFieldEditable } = optionResult

type ResolvedSegmentedOption = {
  label: string
  value: string | number
  disabled?: boolean}

function toSegmentedValue(value: string | number | boolean): string | number {
  return typeof value === 'boolean' ? String(value) : value
}

const resolvedOptions = computed<ResolvedSegmentedOption[]>(() =>
  fieldOptions.value.map(option => {
    const segmentedOption: ResolvedSegmentedOption = {
      label: option.label,
      value: toSegmentedValue(option.value),
    }
    if (option.disabled === true) {
      segmentedOption.disabled = true
    }
    return segmentedOption
  }),
)

const selectedValue = ref(props.modelValue ?? resolvedOptions.value[0]?.value ?? '')

watch(() => fieldValue.value, (value) => {
  if (value === undefined || value === null || value === '') {
    selectedValue.value = resolvedOptions.value[0]?.value ?? ''
    return
  }
  selectedValue.value = toSegmentedValue(value)
})

async function handleChange(val: string | number) {
  selectedValue.value = val
  await handleControlledChange(val)
  emit('change', val)
}
</script>
