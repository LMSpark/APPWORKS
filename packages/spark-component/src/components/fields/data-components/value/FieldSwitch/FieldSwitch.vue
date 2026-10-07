<!--
@module @spark-appworks/spark-component:components/fields/data-components/value/FieldSwitch/FieldSwitch
职责：实现 FieldSwitch（r-switch）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 field-level/data-field 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 field switch 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #form>
      <el-switch
        :model-value="fieldValue"
        :active-text="activeText"
        :inactive-text="inactiveText"
        :disabled="isDisabled || !isSwitchEditable"
        @update:model-value="handleChange"
      />
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
/**
 * @description 开关字段，绑定 boolean 值，支持自定义开/关文本说明。
 */
import { computed } from 'vue'
import { useSparkPageComponent } from '../../../../internal'
import { useBasicFieldState } from '../../composables/state/useBasicFieldState'
import { emitFieldValueUpdate, type FieldValueUpdateEmits } from '../../composables/value/useControlledFieldChange'
import { coerceNullableBooleanValue } from '../../composables/value/fieldValueCoercion'
import { useSwitchNullValue } from '../../composables/value/useSwitchNullValue'
import FieldContextRenderer from '../../../non-data-components/FieldContextRenderer.vue'
import type { RSwitchProps } from './FieldSwitch.props'

const props = withDefaults(defineProps<RSwitchProps>(), {
  type: 'r-switch',
  activeText: '是',
  inactiveText: '否',
})

const { isDisabled } = useSparkPageComponent(props)

const emit = defineEmits<FieldValueUpdateEmits<boolean | null>>()

function formatSwitchValue(value: unknown): string {
  return value ? props.activeText : props.inactiveText
}

const { permission, fieldCtx, handleControlledChange } = useBasicFieldState<boolean | null>({
  props,
  fieldType: 'r-switch',
  fallbackValue: false,
  formatDisplay: formatSwitchValue,
  coerce: coerceNullableBooleanValue,
  emitUpdate: value => emitFieldValueUpdate(emit, value),
})

const { boundColumn, contextData, dataSource, currentRow, fieldName, fieldValue, isCurrentFieldEditable, syncValue } = permission

const isSwitchEditable = computed(() => {
  // 字段级开关在无行上下文或未绑定字段时默认可编辑；
  // 若已解析到权限快照，则仍遵循字段级 editable 约束。
  if (currentRow.value === null || fieldName.value === '') return true
  return isCurrentFieldEditable.value
})

useSwitchNullValue({
  boundColumn,
  contextData,
  dataSource,
  fieldName,
  syncValue,
})

async function handleChange(value: boolean): Promise<void> {
  await handleControlledChange(value)
}
</script>
