<!--
@module @spark-appworks/spark-component:components/fields/data-components/text/FieldCodeEditor/FieldCodeEditor
职责：实现绑定DataView字段的标准代码编辑器。
边界：字段权限、编辑覆盖及写回复用通用字段链；本组件不保存文件或定义文件业务规则。
AI用途：需要在标准字段容器中编辑脚本或样式文本时，查看本模块及SparkCodeEditor指南。
-->
<template>
  <FieldContextRenderer v-bind="fieldCtx">
    <template #table-cell="{ value }">
      <pre class="code-editor-display">{{ value }}</pre>
    </template>
    <template #form>
      <SparkCodeEditor
        :model-value="fieldValue"
        :language="language"
        :read-only="!isCurrentFieldEditable"
        :height="height"
        :tab-size="tabSize"
        :line-wrapping="lineWrapping"
        @update:model-value="handleChange"
      />
    </template>
    <template #tree>
      <pre class="code-editor-display">{{ currentDisplayValue }}</pre>
    </template>
    <template #detail>
      <div class="field-display">
        <span class="field-label">{{ fieldCtx.displayLabel }}：</span>
        <pre class="field-value code-editor-display">{{ currentDisplayValue }}</pre>
      </div>
    </template>
  </FieldContextRenderer>
</template>

<script setup lang="ts">
/** @description 绑定string字段的JavaScript/CSS编辑器。 */
import { useBasicFieldState } from '../../composables/state/useBasicFieldState'
import { emitFieldValueUpdate, type FieldValueUpdateEmits } from '../../composables/value/useControlledFieldChange'
import { coerceStringValue } from '../../composables/value/fieldValueCoercion'
import FieldContextRenderer from '../../../non-data-components/FieldContextRenderer.vue'
import SparkCodeEditor from '../../../../editors/SparkCodeEditor.vue'
import type { RCodeEditorProps } from './FieldCodeEditor.props'

const props = withDefaults(defineProps<RCodeEditorProps>(), {type: 'r-code-editor', language: 'javascript', height: 360, tabSize: 2, lineWrapping: false})
const emit = defineEmits<FieldValueUpdateEmits<string>>()
const {permission, fieldCtx, handleControlledChange} = useBasicFieldState<string>({
  props, fieldType: 'r-code-editor', fallbackValue: '', coerce: coerceStringValue,
  emitUpdate: value => emitFieldValueUpdate(emit, value),
})
const {fieldValue, isCurrentFieldEditable, currentDisplayValue} = permission

async function handleChange(value: string): Promise<void> {
  await handleControlledChange(value)
}
</script>

<style scoped>
.code-editor-display {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font: inherit;
}
</style>
