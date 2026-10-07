<!--
@module @spark-appworks/spark-component:components/fields/data-components/text/FieldTextarea/FieldTextarea
职责：实现 FieldTextarea（r-textarea）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 field-level/data-field 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 field textarea 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #table-cell="{ value }">
      <span class="textarea-display">{{ value }}</span>
    </template>
    <template #form>
      <el-input
        :model-value="typeof fieldValue === 'string' ? fieldValue : (fieldValue == null ? '' : String(fieldValue))"
        type="textarea"
        :rows="rows"
        :autosize="autosize"
        :maxlength="maxlength"
        :show-word-limit="showWordLimit"
        :placeholder="placeholder"
        :disabled="!isCurrentFieldEditable"
        @update:model-value="handleChange"
      />
    </template>
    <template #tree>
      <span class="textarea-display">{{ currentDisplayValue }}</span>
    </template>
    <template #detail>
      <div class="field-display">
        <span class="field-label">{{ fieldCtx.displayLabel }}：</span>
        <span class="field-value textarea-display">{{ currentDisplayValue }}</span>
      </div>
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
/**
 * @description 多行文本字段，绑定 string 值，支持自动高度和字数限制。
 */
import { useBasicFieldState } from '../../composables/state/useBasicFieldState'
import { emitFieldValueUpdate, type FieldValueUpdateEmits } from '../../composables/value/useControlledFieldChange'
import { coerceStringValue } from '../../composables/value/fieldValueCoercion'
import FieldContextRenderer from '../../../non-data-components/FieldContextRenderer.vue'
import type { RTextareaProps } from './FieldTextarea.props'

const props = withDefaults(defineProps<RTextareaProps>(), {
  type: 'r-textarea',
  rows: 4,
  autosize: false,
  showWordLimit: false,
  placeholder: '请输入内容',
})

const emit = defineEmits<FieldValueUpdateEmits<string>>()

const { permission, fieldCtx, handleControlledChange } = useBasicFieldState<string>({
  props,
  fieldType: 'r-textarea',
  fallbackValue: '',
  coerce: coerceStringValue,
  emitUpdate: value => emitFieldValueUpdate(emit, value),
})

const { fieldValue, isCurrentFieldEditable, currentDisplayValue } = permission

async function handleChange(value: string): Promise<void> {
  await handleControlledChange(value)
}
</script>

<style scoped>
.textarea-display {
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
