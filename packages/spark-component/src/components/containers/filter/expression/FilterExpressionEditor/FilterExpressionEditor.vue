<!--
@module @spark-appworks/spark-component:components/containers/filter/expression/FilterExpressionEditor/FilterExpressionEditor
职责：提供完整过滤树与 JSON 编辑交互。边界：只提交校验后的树或显式清空，父级接受后关闭；AI用途：可用此组件接入完整过滤编辑。
-->
<template>
  <el-button data-action="open" :disabled="disabled" @click="open">编辑完整过滤</el-button>
  <el-dialog v-model="visible" title="完整过滤表达式" width="960px" append-to-body :close-on-click-modal="false">
    <div class="filter-expression-editor__actions">
      <el-button data-action="json" @click="toggleJson">{{ jsonMode ? '条件树' : 'JSON' }}</el-button>
      <span>当前 {{ draft.countRules() }} 条条件</span>
    </div>
    <textarea v-if="jsonMode" v-model="rawJson" data-filter-json aria-label="完整过滤 JSON" rows="12" :disabled="disabled" @input="issues = []" />
    <FilterExpressionGroup v-else :group="draft.root" :draft="draft" :fields="fields" :depth="0" :max-depth="maxDepth" :max-rules="maxRules" :disabled="disabled" @change="issues = []" @value-function="openFunction" />
    <p v-if="issues.length" role="alert">{{ issues.map(issue => `${issue.path}: ${issue.message}`).join('\n') }}</p>
    <p v-if="applyError" role="alert">{{ applyError }}</p>
    <template #footer>
      <el-button data-action="clear" :disabled="disabled" @click="clear">清空</el-button>
      <el-button data-action="cancel" @click="visible = false">取消</el-button>
      <el-button data-action="apply" type="primary" :disabled="disabled" @click="apply">应用</el-button>
    </template>
  </el-dialog>
  <FilterValueFunctionDialog v-model="functionVisible" :value="functionValue" :context="functionContext" @confirm="applyFunction" />
</template>

<script setup lang="ts">
import { computed, ref, shallowRef, watch } from 'vue'
import { DataViewFilter, type DataViewFilterIssue, type DataViewFilterTree, type DataViewFilterValueFunction } from '@spark-appworks/spark-data'
import { FilterExpressionEditorDraft, type FilterExpressionEditorCondition, type FilterExpressionEditorProps } from './FilterExpressionEditor.props'
import FilterExpressionGroup from '../FilterExpressionGroup/FilterExpressionGroup.vue'
import FilterValueFunctionDialog from '../../value/FilterValueFunctionDialog/FilterValueFunctionDialog.vue'
const props = withDefaults(defineProps<FilterExpressionEditorProps>(), { functionContext: () => ({}), maxDepth: 3, maxRules: 50, disabled: false })
const emit = defineEmits<{ 'update:modelValue': [tree: DataViewFilterTree | undefined] }>()
const visible = ref(false)
const jsonMode = ref(false)
const rawJson = ref('')
const draft = shallowRef(new FilterExpressionEditorDraft())
const issues = ref<readonly DataViewFilterIssue[]>([])
const functionVisible = ref(false)
const functionValue = ref<DataViewFilterValueFunction>()
const fields = computed(() => FilterExpressionEditorDraft.fields(props.columns))
let functionTarget: FilterExpressionEditorCondition | undefined
let awaitingApplication = false
let pendingValue: DataViewFilterTree | undefined
watch(() => props.modelValue, () => {
  if (awaitingApplication && JSON.stringify(props.modelValue) === JSON.stringify(pendingValue)) visible.value = false
})
function context() { return { fields: fields.value, maxDepth: props.maxDepth, maxRules: props.maxRules, valueFunctions: props.functionContext } }
function open(): void {
  draft.value = new FilterExpressionEditorDraft(props.modelValue)
  rawJson.value = props.modelValue === undefined ? '' : JSON.stringify(props.modelValue, null, 2)
  jsonMode.value = false
  issues.value = []
  awaitingApplication = false
  visible.value = true
}
function toggleJson(): void {
  if (jsonMode.value) {
    const result = draft.value.checkInput(rawJson.value, context())
    if (!result.ok) { issues.value = result.issues; return }
    draft.value = new FilterExpressionEditorDraft(result.tree)
    jsonMode.value = false
    issues.value = []
  } else {
    const result = draft.value.check(context())
    if (result.ok) rawJson.value = JSON.stringify(result.tree, null, 2)
    else if (draft.value.root.children.length > 0) { issues.value = result.issues; return }
    jsonMode.value = true
  }
}
function apply(): void {
  if (props.disabled) return
  if (jsonMode.value) {
    const result = draft.value.checkInput(rawJson.value, context())
    if (!result.ok) { issues.value = result.issues; return }
    submit(result.tree)
  } else {
    const result = draft.value.check(context())
    if (!result.ok) { issues.value = result.issues; return }
    submit(result.tree)
  }
}
function clear(): void {
  if (props.disabled) return
  submit(undefined)
}
function submit(tree: DataViewFilterTree | undefined): void {
  pendingValue = tree
  awaitingApplication = true
  emit('update:modelValue', tree)
  if (JSON.stringify(props.modelValue) === JSON.stringify(tree)) visible.value = false
}
function openFunction(condition: FilterExpressionEditorCondition): void {
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
  functionVisible.value = true
}
function applyFunction(value: DataViewFilterValueFunction): void {
  if (functionTarget) functionTarget.valueText = JSON.stringify(value)
  issues.value = []
}
</script>

<style scoped>
.filter-expression-editor__actions { display: flex; gap: 12px; align-items: center; margin-bottom: 12px; }
textarea { box-sizing: border-box; width: 100%; font-family: monospace; }
[role="alert"] { color: var(--el-color-danger); white-space: pre-wrap; }
</style>
