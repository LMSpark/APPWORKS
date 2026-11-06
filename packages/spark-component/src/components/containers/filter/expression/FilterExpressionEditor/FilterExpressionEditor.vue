<!--
@module @spark-appworks/spark-component:components/containers/filter/expression/FilterExpressionEditor/FilterExpressionEditor
职责：提供完整过滤树与 JSON 编辑交互。边界：只提交校验后的树或显式清空，父级接受后关闭；AI用途：可用此组件接入完整过滤编辑。
-->
<template>
  <div v-if="display !== 'inline'" class="filter-expression-editor__display-wrap">
    <button type="button" data-action="open" class="filter-expression-editor__display" :class="[`filter-expression-editor__display--${displayMode}`, {'is-empty': !summary}]"
      :title="summary || placeholder" :aria-label="summary ? `编辑过滤条件：${summary}` : placeholder" :disabled="disabled" @click="open">
      <span>{{ summary || placeholder }}</span><small v-if="readonly">只读</small>
    </button>
    <button v-if="clearable && summary && !writeLocked" type="button" data-action="clear-summary" class="filter-expression-editor__clear" aria-label="清空过滤条件" @click="clear">×</button>
  </div>
  <component :is="display === 'inline' ? 'div' : FullscreenDialog" class="filter-expression-editor"
    v-bind="display === 'inline' ? {} : {modelValue: visible, title, width: dialogWidth, appendToBody: true, closeOnClickModal: false, autoFullscreenBelow, resetFullscreenOnClose: true, destroyOnClose: true}"
    @update:model-value="visible = $event">
    <div class="filter-expression-editor__actions">
      <el-button data-action="json" :disabled="checking" @click="toggleJson">{{ jsonMode ? '条件树' : 'JSON' }}</el-button>
      <span v-if="!jsonMode">当前 {{ draft.countRules() }} 条条件</span>
      <el-button v-if="display === 'inline' && !jsonMode && !editing && clearable && !readonly" data-action="clear" :disabled="disabled" @click="clear">清空</el-button>
    </div>
    <JsonTreeEditor v-if="jsonMode" :key="jsonRevision" :model-value="rawJson" data-filter-json
      :height="320" :read-only="writeLocked" @update:model-value="updateJson" @editing-change="jsonEditingChange" />
    <FilterExpressionGroup v-else :group="draft.root" :draft="draft" :fields="fields" :function-context="functionContext" :depth="0" :max-depth="maxDepth" :max-rules="maxRules" :disabled="writeLocked" @change="inlineChange" @value-function="openFunction" />
    <p v-if="issues.length" role="alert">{{ issues.map(issue => `${issue.path}: ${issue.message}`).join('\n') }}</p>
    <p v-if="applyError" role="alert">{{ applyError }}</p>
    <p v-if="checking" role="status">正在读取过滤表达式引用的模型字段…</p>
    <div v-if="display !== 'inline' || jsonMode || editing" class="filter-expression-editor__footer">
      <el-button v-if="clearable && !readonly" data-action="clear" :disabled="disabled" @click="clear">清空</el-button>
      <el-button data-action="cancel" @click="cancel">{{ readonly ? '关闭' : '取消' }}</el-button>
      <el-button v-if="!readonly" data-action="apply" type="primary" :disabled="disabled || checking" @click="apply">{{ display === 'inline' ? '应用' : '应用过滤条件' }}</el-button>
    </div>
  </component>
  <FilterValueFunctionDialog v-model="functionVisible" :value="functionValue" :context="functionContext" @confirm="functionConfirmation" />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import FullscreenDialog from '../../../layout/overlay/RendererDialog/FullscreenDialog.vue'
import { DataViewFilter, type DataViewFilterIssue, type DataViewFilterTree, type DataViewFilterValueFunction } from '@spark-appworks/spark-data'
import { FilterExpressionEditorDraft, type FilterExpressionEditorCondition, type FilterExpressionEditorProps } from './FilterExpressionEditor.props'
import FilterExpressionGroup from '../FilterExpressionGroup/FilterExpressionGroup.vue'
import FilterValueFunctionDialog from '../../value/FilterValueFunctionDialog/FilterValueFunctionDialog.vue'
import JsonTreeEditor from '../../../../editors/JsonTreeEditor.vue'
const props = withDefaults(defineProps<FilterExpressionEditorProps>(), { display: 'dialog', displayMode: 'box', placeholder: '空', title: '过滤设置',
  clearable: true, dialogWidth: '980px', autoFullscreenBelow: 900, functionContext: () => ({}), maxDepth: 3, maxRules: 50, disabled: false, readonly: false })
const emit = defineEmits<{ 'update:modelValue': [tree: DataViewFilterTree | undefined] }>()
const visible = ref(false)
const jsonMode = ref(false)
const jsonPending = ref(false)
const rawJson = ref('')
const jsonRevision = ref(0)
const draft = shallowRef(new FilterExpressionEditorDraft())
const issues = ref<readonly DataViewFilterIssue[]>([])
const functionVisible = ref(false)
const functionValue = ref<DataViewFilterValueFunction>()
const baseline = ref('')
const originalJson = ref('')
const fields = computed(() => FilterExpressionEditorDraft.fields(props.columns,props.allowedOperators))
const summary = computed(() => FilterExpressionEditorDraft.summarize({tree: props.modelValue, columns: props.columns, context: props.functionContext}))
const writeLocked = computed(() => props.disabled || props.readonly)
const checking = ref(false)
let checkRevision = 0, alive = true
const invalidateCheck = (): void => {checkRevision++; checking.value = false}
watch([() => props.functionContext, () => props.columns, () => props.allowedOperators, () => props.modelValue, () => props.maxDepth, () => props.maxRules,
  writeLocked, visible, rawJson, jsonMode, jsonPending, () => draft.value.root], invalidateCheck, {deep: true, flush: 'sync'})
let functionTarget: FilterExpressionEditorCondition | undefined
let stopFunctionGuard:(()=>void)|undefined
const functionRevision=ref(0)
function invalidateFunction():void{functionRevision.value++;functionVisible.value=false;functionTarget=undefined;stopFunctionGuard?.();stopFunctionGuard=undefined}
const functionConfirmation=computed(()=>{const revision=functionRevision.value;return(value:DataViewFilterValueFunction):void=>{if(revision===functionRevision.value)applyFunction(value)}})
let awaitingApplication = false
let pendingValue: DataViewFilterTree | undefined
let pendingDraft = '', pendingReset = false
watch([() => props.modelValue, () => props.display], () => {
  if (props.display === 'inline') {
    if (awaitingApplication && JSON.stringify(props.modelValue) === JSON.stringify(pendingValue)) acknowledgeInline()
    else resetDraft()
  }
  else if (awaitingApplication && JSON.stringify(props.modelValue) === JSON.stringify(pendingValue)) visible.value = false
}, {immediate: true})
function context() { return { fields: fields.value, maxDepth: props.maxDepth, maxRules: props.maxRules, valueFunctions: props.functionContext } }
function resetDraft(): void {
  invalidateCheck()
  jsonRevision.value++
  draft.value = new FilterExpressionEditorDraft(props.modelValue)
  baseline.value = JSON.stringify(draft.value.root)
  rawJson.value = props.modelValue === undefined ? '' : JSON.stringify(props.modelValue, null, 2)
  originalJson.value = rawJson.value
  jsonMode.value = false
  jsonPending.value = false
  issues.value = []
  awaitingApplication = false
  invalidateFunction()
}
watch(() => props.readonly, () => {resetDraft(); visible.value = false})
const editing = computed(() => !props.readonly && (functionVisible.value || (props.display === 'inline'
  ? (jsonMode.value ? jsonPending.value || rawJson.value !== originalJson.value : JSON.stringify(draft.value.root) !== baseline.value)
  : visible.value)))
watch(editing, value => props.onEditingChange?.(value), {immediate: true})
onBeforeUnmount(() => {alive = false; invalidateCheck();invalidateFunction(); jsonRevision.value++; props.onEditingChange?.(false)})
const updateJson = computed(() => {
  const revision = jsonRevision.value
  return (value: string): void => {
    if (!isCurrentJsonInput(revision)) return
    rawJson.value = value
    // 保留上次校验提示至下一次验证，避免失焦通知在click前移动操作按钮。
  }
})
function isCurrentJsonInput(revision: number): boolean {
  return isCurrentJsonSession(revision) && !writeLocked.value
}
function isCurrentJsonSession(revision: number): boolean {
  return alive && revision === jsonRevision.value && jsonMode.value && (props.display === 'inline' || visible.value)
}
const jsonEditingChange = computed(() => {
  const revision = jsonRevision.value
  return (pending: boolean): void => {if (isCurrentJsonSession(revision) && (!writeLocked.value || !pending)) jsonPending.value = pending}
})
function open(): void {
  if (props.disabled) return
  resetDraft()
  visible.value = true
}
function cancel(): void {resetDraft(); visible.value = false}
function toggleJson(): void {
  if (!jsonMode.value && draft.value.root.children.length === 0) {
    const result = draft.value.check(context())
    if (result.ok) rawJson.value = JSON.stringify(result.tree, null, 2)
    jsonRevision.value++; jsonPending.value = false; jsonMode.value = true
    return
  }
  checkTree(tree => {
    if (jsonMode.value) draft.value = new FilterExpressionEditorDraft(tree)
    else rawJson.value = JSON.stringify(tree, null, 2)
    jsonRevision.value++
    jsonPending.value = false
    jsonMode.value = !jsonMode.value
    issues.value = []
  })
}
function apply(): void {
  if (writeLocked.value) return
  checkTree(submit)
}
function inlineChange(): void {
  if (props.display === 'inline' && !jsonMode.value && !writeLocked.value) checkTree(submit)
}
function acknowledgeInline(): void {
  if (pendingReset) {resetDraft(); return}
  baseline.value = pendingDraft
  originalJson.value = pendingValue === undefined ? '' : JSON.stringify(pendingValue, null, 2)
  awaitingApplication = false
  issues.value = []
}
function checkTree(accept: (tree: DataViewFilterTree) => void): void {
  if (checking.value || !alive || jsonPending.value) return
  const {valueFunctions, ...shape} = context()
  const result = jsonMode.value ? draft.value.checkInput(rawJson.value, shape) : draft.value.check(shape)
  if (!result.ok) {issues.value = result.issues; return}
  const revision = ++checkRevision, mode = jsonMode.value, source = JSON.stringify(draft.value.root), text = rawJson.value
  const current = () => alive && revision === checkRevision && mode === jsonMode.value
    && source === JSON.stringify(draft.value.root) && text === rawJson.value
  const validate = (functions: typeof valueFunctions): void => {
    if (!current()) return
    const checked = draft.value.checkInput(result.tree, {...shape, valueFunctions: functions})
    if (!checked.ok) {issues.value = checked.issues; return}
    accept(checked.tree)
  }
  if (!valueFunctions.tables?.some(table => table.fields === undefined && table.loadFields)) {validate(valueFunctions); return}
  if (props.display !== 'inline' && !visible.value) return
  const parsed = DataViewFilter.parse(result.tree)
  if (!parsed.ok) {issues.value = parsed.issues; return}
  checking.value = true
  void parsed.value.loadEditorContext(valueFunctions).then(validate).catch(cause => {
    if (current()) issues.value = [{code: 'invalid-value-function', path: '$', message: cause instanceof Error ? cause.message : String(cause)}]
  }).finally(() => {if (revision === checkRevision) checking.value = false})
}
function clear(): void {
  if (writeLocked.value || !props.clearable) return
  invalidateCheck()
  submit(undefined)
}
function submit(tree: DataViewFilterTree | undefined): void {
  pendingValue = tree
  pendingDraft = JSON.stringify(draft.value.root)
  pendingReset = tree === undefined || jsonMode.value
  awaitingApplication = true
  emit('update:modelValue', tree)
  if (JSON.stringify(props.modelValue) === JSON.stringify(tree)) {
    if (props.display === 'inline') acknowledgeInline()
    else visible.value = false
  }
}
function openFunction(condition: FilterExpressionEditorCondition): void {
  if (writeLocked.value) return
  invalidateFunction()
  functionTarget = condition
  functionValue.value = undefined
  // 草稿文本先作为 JSON 解读，不能把普通字符串推断为函数。
  if (condition.valueText) {
    try {
      const value: unknown = JSON.parse(condition.valueText)
      const parsed = DataViewFilter.parse({ field: 'value', operator: 'eq', value })
      if (parsed.ok) {
        const tree = parsed.value.toJSON()
        if ('field' in tree && tree.value !== null && typeof tree.value === 'object' && !Array.isArray(tree.value) && 'Type' in tree.value && typeof tree.value['Type'] === 'string') functionValue.value = { ...tree.value, Type: tree.value['Type'] }
      }
    } catch { /* 无效常量草稿仍保留，弹框确认后才替换。 */ }
  }
  stopFunctionGuard=watch([()=>draft.value.root,()=>condition.field,()=>condition.operator,()=>condition.valueText,writeLocked],invalidateFunction,{deep:true,flush:'sync'})
  functionVisible.value = true
}
function applyFunction(value: DataViewFilterValueFunction): void {
  if (!alive || writeLocked.value || !functionVisible.value) return
  if (functionTarget) functionTarget.valueText = JSON.stringify(value)
  issues.value = []
  inlineChange()
}
</script>

<style scoped>
.filter-expression-editor__display-wrap {position:relative; display:flex; min-width:0; width:100%}
.filter-expression-editor__display {display:flex; width:100%; min-width:0; min-height:36px; padding:7px 36px 7px 11px; color:var(--el-text-color-regular); font:inherit; text-align:left; cursor:pointer; background:var(--el-bg-color); border:1px solid var(--el-border-color); border-radius:4px}
.filter-expression-editor__display > span {min-width:0; flex:1; overflow:hidden; line-height:20px; text-overflow:ellipsis; white-space:nowrap}
.filter-expression-editor__display > small {margin-left:8px; color:var(--el-text-color-secondary); white-space:nowrap}
.filter-expression-editor__display:hover:not(:disabled), .filter-expression-editor__display:focus-visible {border-color:var(--el-color-primary); outline:none}
.filter-expression-editor__display:disabled, .filter-expression-editor__display.is-empty {color:var(--el-text-color-placeholder)}
.filter-expression-editor__display:disabled {cursor:not-allowed}
.filter-expression-editor__display--inline {min-height:auto; padding:0 28px 0 0; background:transparent; border:0}
.filter-expression-editor__display--inline > span {white-space:normal; text-decoration:underline; text-underline-offset:3px}
.filter-expression-editor__clear {position:absolute; top:50%; right:8px; width:24px; height:24px; padding:0; border:0; border-radius:50%; background:transparent; color:var(--el-text-color-secondary); cursor:pointer; transform:translateY(-50%)}
.filter-expression-editor__clear:hover {color:var(--el-color-danger); background:var(--el-fill-color-light)}
.filter-expression-editor__actions { display: flex; gap: 12px; align-items: center; margin-bottom: 12px; }
.filter-expression-editor__footer { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
:global(.filter-expression-editor.is-fullscreen > .el-dialog__body) {display:flex; flex-direction:column}
:global(.filter-expression-editor.is-fullscreen > .el-dialog__body > .filter-expression-group) {flex-shrink:0}
:global(.filter-expression-editor.is-fullscreen .filter-expression-editor__footer) {position:sticky; bottom:0; z-index:1; flex-shrink:0; margin-top:auto; padding-top:12px; background:var(--el-bg-color)}
[role="alert"] { color: var(--el-color-danger); white-space: pre-wrap; }
</style>
