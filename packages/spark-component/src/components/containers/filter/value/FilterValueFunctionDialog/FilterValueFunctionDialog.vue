<!--
@module @spark-appworks/spark-component:components/containers/filter/value/FilterValueFunctionDialog/FilterValueFunctionDialog
职责：按实际函数定义编辑参数并确认不可变值函数。
边界：保留各类型草稿，确认前由 DataViewFilter 校验，不直接执行函数。
AI用途：接入过滤条件的值函数选择、参数编辑和校验交互。
-->
<template>
  <FullscreenDialog :model-value="modelValue" title="值函数设置" width="780px" append-to-body :auto-fullscreen-below="900"
    reset-fullscreen-on-close destroy-on-close v-on="{'update:modelValue': actions.changeVisible}">
    <el-tabs v-model="activeType" aria-label="值函数类型">
      <el-tab-pane v-for="item in definitions" :key="item.type" :label="item.label" :name="item.type">
    <div v-if="item.type === activeType && draft" class="filter-value-function-fields">
      <div v-for="{field, updateValue, updateDocument} in boundFields" :key="activeType + ':' + field.key" class="filter-value-function-field" :class="{'filter-value-function-field--json': field.control === 'json'}">
        <label>{{ field.label }}{{ field.required ? ' *' : '' }}</label>
        <el-select v-if="field.control === 'select'" :model-value="selectValue(field)" :aria-label="field.label" :multiple="field.multiple" filterable clearable v-on="{'update:modelValue': updateValue}">
          <el-option v-for="option in options(field)" :key="String(option.value)" :label="option.label" :value="option.value" :disabled="option.disabled" />
        </el-select>
        <el-checkbox v-else-if="field.control === 'checkbox'" :model-value="draft[field.key] === true" v-on="{'update:modelValue': updateValue}">{{ field.label }}</el-checkbox>
        <template v-else-if="field.control === 'json'">
          <JsonTreeEditor :document-value="{value: asJsonValue(draft[field.key] ?? null)}" :height="300" :policy="jsonPolicy"
            v-on="{'update:documentValue': updateDocument}" />
          <p v-if="jsonError(field.key)" role="alert">{{ jsonError(field.key) }}</p>
        </template>
        <el-input v-else :model-value="stringValue(field.key)" :aria-label="field.label" :type="field.control === 'textarea' ? 'textarea' : field.control === 'password' ? 'password' : 'text'" :show-password="field.control === 'password'" v-on="{'update:modelValue': updateValue}" />
      </div>
    </div>
      </el-tab-pane>
    </el-tabs>
    <p v-if="!definitions.length" role="status">当前上下文没有可用的值函数。</p>
    <p v-if="message" role="alert">{{ message }}</p>
    <p v-if="loadingFields" role="status">正在读取所选模型的字段…</p>
    <p v-if="fieldError" role="alert">{{ fieldError }} <el-button data-function-retry @click="loadFields">重试</el-button></p>
    <template #footer>
      <el-button v-on="{click: actions.cancel}">取消</el-button>
      <el-button data-function-confirm type="primary" :disabled="!definition || loadingFields || !!fieldError" v-on="{click: actions.confirm}">保存</el-button>
    </template>
  </FullscreenDialog>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, shallowRef, watch } from 'vue'
import { DataViewFilter, getDataViewFilterFunctionDefinitions, type DataViewFilterFunctionField, type DataViewFilterJsonValue, type DataViewFilterValueFunction } from '@spark-appworks/spark-data'
import {asJsonValue, type JsonDocument, type JsonTreePolicy} from '@spark-appworks/spark-json-document'
import JsonTreeEditor from '../../../../editors/JsonTreeEditor.vue'
import FullscreenDialog from '../../../layout/overlay/RendererDialog/FullscreenDialog.vue'
import type { FilterValueFunctionDialogProps } from './FilterValueFunctionDialog.props'
/** 单个函数类型的参数草稿；Type 固定标识当前定义，其余参数保留 JSON 值。 */
type FunctionDraft = { [key: string]: DataViewFilterJsonValue; Type: string }
type FunctionJsonDraftMap = Record<string, Record<string, string>>
const props = defineProps<FilterValueFunctionDialogProps>()
const fieldContext = shallowRef(props.context)
const loadingFields = ref(false), fieldError = ref('')
let fieldLoadRevision = 0
const emit = defineEmits<{ 'update:modelValue': [visible: boolean]; confirm: [value: DataViewFilterValueFunction] }>()
const definitions = computed(() => getDataViewFilterFunctionDefinitions(props.context))
const activeType = ref('')
const drafts = reactive<Record<string, FunctionDraft>>({})
const jsonErrors = reactive<FunctionJsonDraftMap>({})
const jsonPolicy: JsonTreePolicy = {canEditKey: path => path.length > 1 && typeof path.at(-1) === 'string', isProtected: path => path.length === 1, canAddChild: path => path.length > 0}
const message = ref('')
const editRevision = ref(0), fieldRevision = ref(0), sessionActive = ref(false)
let alive = true
const definition = computed(() => definitions.value.find(item => item.type === activeType.value))
const draft = computed(() => drafts[activeType.value])
const visibleFields = computed(() => definition.value?.fields.filter(field => draft.value && field.visible?.(draft.value, fieldContext.value) !== false) ?? [])
function ensureDrafts(): void {
  for (const item of definitions.value) if (!drafts[item.type]) drafts[item.type] = { Type: item.type }
}
watch(() => [props.modelValue, props.value] as const, ([visible]) => {
  editRevision.value++
  sessionActive.value = visible
  if (!visible) return
  for (const key of Object.keys(drafts)) delete drafts[key]
  for (const key of Object.keys(jsonErrors)) delete jsonErrors[key]
  ensureDrafts()
  if (props.value) drafts[props.value.Type] = { ...props.value }
  activeType.value = props.value?.Type ?? definitions.value[0]?.type ?? ''
  message.value = ''
}, { immediate: true, flush: 'sync' })
watch(definitions, ensureDrafts)
watch(activeType, () => {editRevision.value++}, {flush: 'sync'})
watch(() => props.context, () => {editRevision.value++}, {deep: true, flush: 'sync'})
onBeforeUnmount(() => {alive = false; sessionActive.value = false; editRevision.value++})
function captureEditor(): () => boolean {
  const revision = editRevision.value, type = activeType.value, target = draft.value
  return () => alive && props.modelValue && sessionActive.value && revision === editRevision.value
    && type === activeType.value && target === draft.value
}
const selectedTable = computed(() => {
  const value = draft.value
  const parsed = DataViewFilter.parse({field: 'value', operator: 'eq', value})
  return parsed.ok ? parsed.value.referencedTableNames()[0] : undefined
})
watch([() => props.context, selectedTable, activeType, () => props.modelValue, () => props.value], loadFields, {deep: true, immediate: true, flush: 'sync'})
function loadFields(): void {
  const revision = ++fieldLoadRevision, current = captureEditor()
  fieldContext.value = props.context; fieldError.value = ''; loadingFields.value = false
  const value = draft.value
  if (!value || !current() || !props.context.tables?.some(table => table.name === selectedTable.value && table.fields === undefined && table.loadFields)) return
  loadingFields.value = true
  const filter = DataViewFilter.condition({field: 'value', operator: 'eq', value})
  void filter.loadEditorContext(props.context).then(context => {
    if (!current() || revision !== fieldLoadRevision) return
    fieldContext.value = context
    fieldRevision.value++
  }).catch(cause => {
    if (current() && revision === fieldLoadRevision) fieldError.value = cause instanceof Error ? cause.message : String(cause)
  }).finally(() => {if (revision === fieldLoadRevision) loadingFields.value = false})
}
// Capture the rendered function and session, rather than routing a late event into the currently active draft.
const boundFields = computed(() => {
  const editorCurrent = captureEditor(), revision = fieldRevision.value
  const current = () => editorCurrent() && revision === fieldRevision.value
  return visibleFields.value.map(field => ({field,
    updateValue: (value: unknown) => {
      if (!current()) return
      update(field.key, value)
      // A selected parent can change several candidate lists, including lists with identical field names.
      if (field.control === 'select') fieldRevision.value++
    },
    updateDocument: (document: JsonDocument) => {if (current()) updateJsonDocument(field.key, document)},
  }))
})
const actions = computed(() => {
  const current = captureEditor()
  return {confirm: () => {if (current()) confirm()}, cancel: () => {if (current()) close()},
    changeVisible: (visible: boolean) => {if (!visible && current()) close()}}
})
function close(): void {
  sessionActive.value = false
  editRevision.value++
  emit('update:modelValue', false)
}
function options(field: DataViewFilterFunctionField) {
  if (!draft.value) return []
  return typeof field.options === 'function' ? field.options(draft.value, fieldContext.value) : field.options ?? []
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
function jsonError(key: string): string {
  return jsonErrors[activeType.value]?.[key] ?? ''
}
function updateJsonDocument(key: string, document: JsonDocument): void {
  if (!props.modelValue || !draft.value) return
  const errors = jsonErrors[activeType.value] ?? (jsonErrors[activeType.value] = {})
  if (Array.isArray(document) || Object.keys(document).length !== 1 || !Object.hasOwn(document, 'value')) {
    errors[key] = '请在 value 节点内编辑此参数。'; return
  }
  const parsed = DataViewFilter.parse({ field: 'value', operator: 'eq', value: document['value'] })
  if (!parsed.ok) {
    errors[key] = parsed.issues.map(issue => issue.message).join('\n')
    return
  }
  const tree = parsed.value.toJSON()
  if (!('field' in tree) || tree.value === undefined) {
    errors[key] = 'JSON 值不能是 undefined。'
    return
  }
  draft.value[key] = tree.value
  delete errors[key]
  message.value = ''
}
function validateVisibleJsonFields(): boolean {
  if (!draft.value) return false
  for (const field of visibleFields.value) {
    if (field.control !== 'json') continue
    const error = jsonError(field.key)
    if (error || field.required && !Object.hasOwn(draft.value, field.key)) {
      message.value = error || `请设置${field.label}的 JSON 值。`
      return false
    }
  }
  return true
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
  if (loadingFields.value || fieldError.value) return
  if (!definition.value || !draft.value) { message.value = '当前上下文没有可用的值函数定义'; return }
  if (!validateVisibleJsonFields()) return
  const filter = DataViewFilter.condition({ field: 'value', operator: 'eq', value: draft.value })
  const issues = filter.validate({ fields: [{ name: 'value', type: 'text' }], valueFunctions: fieldContext.value })
  if (issues.length > 0) { message.value = issues.map(issue => issue.message).join('\n'); return }
  const tree = filter.toJSON()
  if ('field' in tree && tree.value !== undefined && !Array.isArray(tree.value) && tree.value !== null && typeof tree.value === 'object' && 'Type' in tree.value && typeof tree.value['Type'] === 'string') {
    emit('confirm', Object.freeze({ ...tree.value, Type: tree.value['Type'] }))
    close()
  }
}
</script>

<style scoped>
.filter-value-function-fields {min-height:240px; padding:8px 0 16px}
.filter-value-function-field { display: grid; grid-template-columns: minmax(96px,.35fr) minmax(220px,1fr); gap: 12px; align-items: center; margin: 12px 0; }
.filter-value-function-field > label {color:var(--el-text-color-regular); font-weight:600; line-height:32px}
.filter-value-function-field--json {grid-template-columns:minmax(0,1fr)}
[role="alert"] { color: var(--el-color-danger); white-space: pre-wrap; }
@media (max-width:900px) {.filter-value-function-field {grid-template-columns:minmax(0,1fr); gap:8px}}
</style>
