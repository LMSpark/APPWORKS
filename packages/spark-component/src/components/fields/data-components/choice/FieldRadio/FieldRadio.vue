<!--
@module @spark-appworks/spark-component:components/fields/data-components/choice/FieldRadio/FieldRadio
职责：实现 FieldRadio（r-radio）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 field-level/data-field 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 field radio 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #form>
      <el-radio-group :model-value="radioValue" :disabled="!isCurrentFieldEditable" @update:model-value="handleChange">
        <component
          :is="buttonStyle ? 'el-radio-button' : 'el-radio'"
          v-for="option in options"
          :key="String(option.value)"
          :value="option.value"
          :disabled="option.disabled || undefined"
        >
          {{ option.label }}
        </component>
      </el-radio-group>
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
/**
 * @description 单选按钮组字段，绑定 string/number 值，可切换按钮样式渲染。
 */
import { computed } from 'vue'
import { useChoiceFieldState } from '../../composables/state/useChoiceFieldState'
import { emitFieldValueUpdate, type FieldValueUpdateEmits } from '../../composables/value/useControlledFieldChange'
import { coercePrimitiveOptionValue } from '../../composables/value/fieldValueCoercion'
import FieldContextRenderer from '../../../non-data-components/FieldContextRenderer.vue'
import type { RRadioProps } from './FieldRadio.props'

const props = withDefaults(defineProps<RRadioProps>(), {
  type: 'r-radio',
  buttonStyle: false,
})

const emit = defineEmits<FieldValueUpdateEmits<string | number>>()

const {
  fieldOptions: options,
  fieldValue,
  isCurrentFieldEditable,
  fieldCtx,
  handleControlledChange,
} = useChoiceFieldState<string | number>({
  props,
  fieldType: 'r-radio',
  fallbackValue: '',
  coerce: coercePrimitiveOptionValue,
  emitUpdate: value => emitFieldValueUpdate(emit, value),
})

// 字典值常以字符串保存而业务字段为数值；按字符串身份选中，写回时保持原字段的数值类型。
const radioValue = computed(() => options.value.find(option => String(option.value) === String(fieldValue.value))?.value ?? fieldValue.value)

async function handleChange(value: string | number): Promise<void> {
  const numeric = typeof fieldValue.value === 'number' && typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))
  await handleControlledChange(numeric ? Number(value) : value)
}
</script>

