<!--
@module @spark-appworks/spark-component:components/fields/data-components/picker/FieldEntityPicker/FieldEntityPicker
职责：实现 FieldEntityPicker（r-entity-picker）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 field-level/data-field 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 field entity picker 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #form>
      <div class="entity-picker-field">
        <el-input
          :model-value="currentDisplayValue"
          readonly
          :placeholder="placeholder"
        />
        <el-button class="primary-action-button" :disabled="!hasSelectorCapability" @click="openSelector">{{ primaryActionText }}</el-button>
        <el-button v-if="showClearButton" class="clear-action-button" @click="clearValue">清空</el-button>
      </div>
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
/**
 * @description 通用实体选择器字段，绑定实体对象或 ID 值，弹窗选择单个或多个实体记录。
 */
import { computed } from 'vue'
import FieldContextRenderer from '../../../non-data-components/FieldContextRenderer.vue'
import { useSelectorFieldActions } from '../../../actions/useSelectorFieldActions'
import { emitFieldValueUpdate, type FieldValueUpdateEmits } from '../../composables/value/useControlledFieldChange'
import { useEntityPickerState } from '../../composables/state/useEntityPickerState'
import { useOptionFieldState } from '../../composables/state/useOptionFieldState'
import { coerceTreeSelectValue } from '../../composables/value/fieldValueCoercion'
import type { REntityPickerProps } from './FieldEntityPicker.props'

const props = withDefaults(defineProps<REntityPickerProps>(), {
  type: 'r-entity-picker',
  placeholder: '请选择',
  buttonText: '选择',
  readonlyButtonText: '查看',
  clearable: true,
  multiple: false,
  searchable: true,
  valueMode: 'auto',
  entityName: '项目',
})

const emit = defineEmits<FieldValueUpdateEmits<NonNullable<REntityPickerProps['modelValue']>>>()

const { optionResult, fieldCtx, handleControlledChange } = useOptionFieldState<NonNullable<REntityPickerProps['modelValue']>>({
  props,
  fieldType: 'r-entity-picker',
  fallbackValue: '',
  coerce: coerceTreeSelectValue,
  emitUpdate: value => emitFieldValueUpdate(emit, value),
})

const {
  flatOptions,
  pageService,
  currentRawValue,
  currentRawStringValue,
  isCurrentFieldEditable,
  currentDisplayValue,
} = optionResult

const resolvedValueSeparator = computed(() => props.valueSeparator ?? ', ')

const { hasSelectorCapability, primaryAction, selectEntities } = useSelectorFieldActions({
  pageService,
  isEditable: isCurrentFieldEditable,
})

async function updateValue(value: NonNullable<REntityPickerProps['modelValue']>): Promise<void> {
  await handleControlledChange(value)
}

const {
  primaryActionText,
  showClearButton,
  openSelector,
  clearValue,
} = useEntityPickerState({
  buttonText: computed(() => props.buttonText),
  readonlyButtonText: computed(() => props.readonlyButtonText),
  clearable: computed(() => props.clearable),
  multiple: computed(() => props.multiple),
  searchable: computed(() => props.searchable),
  valueSeparator: resolvedValueSeparator,
  valueMode: computed(() => props.valueMode),
  entityName: computed(() => props.entityName),
  placeholder: computed(() => props.placeholder),
  flatOptions,
  currentRawValue,
  currentRawStringValue,
  isCurrentFieldEditable,
  hasSelectorCapability,
  primaryAction,
  selectEntities,
  updateValue,
})
</script>

<style scoped>
.entity-picker-field {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.entity-picker-field :deep(.el-input) {
  flex: 1;
}
</style>
