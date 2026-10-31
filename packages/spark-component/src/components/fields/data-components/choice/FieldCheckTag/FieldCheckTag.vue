<!--
@module @spark-appworks/spark-component:components/fields/data-components/choice/FieldCheckTag/FieldCheckTag
职责：实现 FieldCheckTag（r-check-tag）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 field-level/data-field 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 field check tag 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #form>
      <el-check-tag
        :checked="fieldValue"
        :disabled="!isCurrentFieldEditable"
        @change="handleChange"
      >
        <slot>{{ displayLabel }}</slot>
      </el-check-tag>
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
/**
 * @description 标签选择字段，绑定 boolean 值；选中状态读写所绑 DataView 字段，复用原视图编辑覆盖和字段权限。
 */
import { useBasicFieldState } from '../../composables/state/useBasicFieldState'
import { emitFieldValueUpdate, type FieldValueUpdateEmits } from '../../composables/value/useControlledFieldChange'
import { coerceBooleanValue } from '../../composables/value/fieldValueCoercion'
import FieldContextRenderer from '../../../non-data-components/FieldContextRenderer.vue'
import type { RCheckTagProps } from './FieldCheckTag.props'

const props = withDefaults(defineProps<RCheckTagProps>(), {
  type: 'r-check-tag',
})

const emit = defineEmits<FieldValueUpdateEmits<boolean>>()

const { permission, fieldCtx, handleControlledChange } = useBasicFieldState<boolean>({
  props,
  fieldType: 'r-check-tag',
  fallbackValue: false,
  formatDisplay: value => coerceBooleanValue(value) ? '是' : '否',
  coerce: coerceBooleanValue,
  emitUpdate: value => emitFieldValueUpdate(emit, value),
})

const { fieldValue, isCurrentFieldEditable, displayLabel } = permission

async function handleChange(value: boolean): Promise<void> {
  await handleControlledChange(value)
}
</script>
