<!--
@module @spark-appworks/spark-component:components/containers/filter/value/FilterValueFunctionDialog/FilterValueFunctionDialog
职责：按实际函数定义编辑参数并确认不可变值函数。
边界：保留各类型草稿，确认前由 DataViewFilter 校验，不直接执行函数。
AI用途：接入过滤条件的值函数选择、参数编辑和校验交互。
-->
<template>
  <el-dialog :model-value="modelValue" title="值函数" width="720px" append-to-body @update:model-value="emit('update:modelValue', $event)">
    <el-select v-model="activeType" aria-label="值函数类型">
      <el-option v-for="definition in definitions" :key="definition.type" :label="definition.label" :value="definition.type" />
    </el-select>
    <template v-if="definition && draft">
      <div v-for="field in visibleFields" :key="field.key" class="filter-value-function-field">
        <label>{{ field.label }}{{ field.required ? ' *' : '' }}</label>
        <el-select v-if="field.control === 'select'" :model-value="selectValue(field)" :multiple="field.multiple" filterable clearable @update:model-value="update(field.key, $event)">
          <el-option v-for="option in options(field)" :key="String(option.value)" :label="option.label" :value="option.value" :disabled="option.disabled" />
        </el-select>
        <el-checkbox v-else-if="field.control === 'checkbox'" :model-value="draft[field.key] === true" @update:model-value="update(field.key, $event)">{{ field.label }}</el-checkbox>
        <el-input v-else :model-value="stringValue(field.key)" :type="field.control === 'textarea' ? 'textarea' : field.control === 'password' ? 'password' : 'text'" :show-password="field.control === 'password'" @update:model-value="update(field.key, $event)" />
      </div>
    </template>
    <p v-if="message" role="alert">{{ message }}</p>
    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button data-function-confirm type="primary" :disabled="!definition" @click="confirm">确认值函数</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { DataViewFilter, getDataViewFilterFunctionDefinitions, type DataViewFilterFunctionField, type DataViewFilterJsonValue, type DataViewFilterValueFunction } from '@spark-appworks/spark-data'
import type { FilterValueFunctionDialogProps } from './FilterValueFunctionDialog.props'
/** 单个函数类型的参数草稿；Type 固定标识当前定义，其余参数保留 JSON 值。 */
type FunctionDraft = { [key: string]: DataViewFilterJsonValue; Type: string }
const props = defineProps<FilterValueFunctionDialogProps>()
const emit = defineEmits<{ 'update:modelValue': [visible: boolean]; confirm: [value: DataViewFilterValueFunction] }>()
const definitions = computed(() => getDataViewFilterFunctionDefinitions(props.context))
const activeType = ref('')
const drafts = reactive<Record<string, FunctionDraft>>({})
const message = ref('')
const definition = computed(() => definitions.value.find(item => item.type === activeType.value))
const draft = computed(() => drafts[activeType.value])
const visibleFields = computed(() => definition.value?.fields.filter(field => draft.value && field.visible?.(draft.value, props.context) !== false) ?? [])
function ensureDrafts(): void {
  for (const item of definitions.value) if (!drafts[item.type]) drafts[item.type] = { Type: item.type }
}
watch(() => props.modelValue, visible => {
  if (!visible) return
  for (const key of Object.keys(drafts)) delete drafts[key]
  ensureDrafts()
  if (props.value) drafts[props.value.Type] = { ...props.value }
  activeType.value = props.value?.Type ?? definitions.value[0]?.type ?? ''
  message.value = ''
}, { immediate: true })
watch(definitions, ensureDrafts)
function options(field: DataViewFilterFunctionField) {
  if (!draft.value) return []
  return typeof field.options === 'function' ? field.options(draft.value, props.context) : field.options ?? []
}
function selectValue(field: DataViewFilterFunctionField): string | number | boolean | (string | number | boolean)[] | undefined {
  const value = draft.value?.[field.key]
  if (field.multiple && Array.isArray(value)) return value.filter((item): item is string | number | boolean => typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean')
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : undefined
}
function stringValue(key: string): string {
  const value = draft.value?.[key]
  return typeof value === 'string' ? value : value === undefined ? '' : JSON.stringify(value)
}
function update(key: string, value: unknown): void {
  if (!draft.value) return
  if (value === undefined) { delete draft.value[key]; return }
  const parsed = DataViewFilter.parse({ field: 'value', operator: 'eq', value })
  if (!parsed.ok) { message.value = parsed.issues.map(issue => issue.message).join('\n'); return }
  const tree = parsed.value.toJSON()
  if ('field' in tree && tree.value !== undefined) draft.value[key] = tree.value
  message.value = ''
}
function confirm(): void {
  if (!definition.value || !draft.value) { message.value = '当前上下文没有可用的值函数定义'; return }
  const filter = DataViewFilter.condition({ field: 'value', operator: 'eq', value: draft.value })
  const issues = filter.validate({ fields: [{ name: 'value', type: 'text' }], valueFunctions: props.context })
  if (issues.length > 0) { message.value = issues.map(issue => issue.message).join('\n'); return }
  const tree = filter.toJSON()
  if ('field' in tree && tree.value !== undefined && !Array.isArray(tree.value) && tree.value !== null && typeof tree.value === 'object' && 'Type' in tree.value && typeof tree.value['Type'] === 'string') {
    emit('confirm', Object.freeze({ ...tree.value, Type: tree.value['Type'] }))
    emit('update:modelValue', false)
  }
}
</script>

<style scoped>
.filter-value-function-field { display: grid; grid-template-columns: 140px 1fr; gap: 12px; align-items: center; margin: 12px 0; }
[role="alert"] { color: var(--el-color-danger); white-space: pre-wrap; }
</style>
