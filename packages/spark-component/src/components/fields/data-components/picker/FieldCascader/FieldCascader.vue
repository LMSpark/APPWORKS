<!--
@module @spark-appworks/spark-component:components/fields/data-components/picker/FieldCascader/FieldCascader
职责：实现 FieldCascader（r-cascader）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 field-level/data-field 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 field cascader 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #form>
      <el-cascader
        :model-value="fieldValue"
        :options="options"
        :props="cascaderProps"
        :placeholder="placeholder"
        :clearable="clearable"
        :filterable="filterable"
        :disabled="!isCurrentFieldEditable"
        @update:model-value="handleChange"
      />
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
/**
 * @description 级联选择字段，绑定路径数组值。
 */
import { computed } from 'vue'
import { emitFieldValueUpdate, type FieldValueUpdateEmits } from '../../composables/value/useControlledFieldChange'
import { useOptionFieldState } from '../../composables/state/useOptionFieldState'
import { coerceCascaderValue } from '../../composables/value/fieldValueCoercion'
import FieldContextRenderer from '../../../non-data-components/FieldContextRenderer.vue'
import type { RCascaderProps, CascaderValue } from './FieldCascader.props'

const props = withDefaults(defineProps<RCascaderProps>(), {
  type: 'r-cascader',
  placeholder: '请选择',
  clearable: true,
  filterable: false,
  multiple: false,
  checkStrictly: false,
  emitPath: true,
})

const emit = defineEmits<FieldValueUpdateEmits<CascaderValue>>()

const { optionResult, fieldCtx, handleControlledChange } = useOptionFieldState<CascaderValue>({
  props,
  fieldType: 'r-cascader',
  fallbackValue: [],
  formatDisplay: (value, helpers) => helpers.formatCascaderValue(value),
  coerce: coerceCascaderValue,
  emitUpdate: value => emitFieldValueUpdate(emit, value),
})

const { options, fieldValue, isCurrentFieldEditable } = optionResult

const cascaderProps = computed(() => ({
  multiple: props.multiple,
  checkStrictly: props.checkStrictly,
  emitPath: props.emitPath,
}))

async function handleChange(value: CascaderValue): Promise<void> {
  await handleControlledChange(value)
}
</script>

