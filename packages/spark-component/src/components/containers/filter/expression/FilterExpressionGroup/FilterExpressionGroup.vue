<!--
@module @spark-appworks/spark-component:components/containers/filter/expression/FilterExpressionGroup/FilterExpressionGroup
职责：按参考FilterGroupEditor呈现分组、类型常量及值函数。边界：保留无效原文，不查询或持久化；校验归DataViewFilter。AI用途：通过字段元信息生成有类型的条件树编辑交互。
-->
<template>
  <section class="filter-expression-group" :class="{'filter-expression-group--nested': depth > 0}" :aria-label="depth === 0 ? '过滤条件组' : `第 ${depth + 1} 层过滤条件组`">
    <header class="filter-expression-group__toolbar">
      <el-radio-group :model-value="group.logic" size="small" aria-label="分组逻辑" :disabled="disabled" @update:model-value="updateLogic">
        <el-radio-button value="and">并且</el-radio-button><el-radio-button value="or">或者</el-radio-button>
      </el-radio-group>
      <div class="filter-expression-group__actions">
        <el-button size="small" :disabled="disabled || draft.countRules() >= maxRules" @click="addCondition">添加条件</el-button>
        <el-button size="small" :disabled="disabled || depth >= maxDepth || draft.countRules() >= maxRules" @click="addGroup">添加分组</el-button>
        <el-button v-if="removable" size="small" type="danger" plain aria-label="删除分组" :disabled="disabled" @click="removeGroup">删除分组</el-button>
      </div>
    </header>
    <div v-if="group.children.length" class="filter-expression-group__content">
      <div v-for="(node, index) in group.children" :key="node.id" class="filter-expression-group__node" :class="{'filter-expression-group__rule': node.kind === 'condition'}">
        <template v-if="node.kind === 'condition'">
          <el-select :model-value="node.field" aria-label="过滤字段" :disabled="disabled" filterable placeholder="请选择字段" @update:model-value="changeField(node, $event)">
            <el-option v-if="node.field && !field(node)" :label="node.field" :value="node.field" />
            <el-option v-for="item in fields" :key="item.name" :label="item.label || item.name" :value="item.name" />
          </el-select>
          <el-select :model-value="node.operator" aria-label="过滤运算符" :disabled="disabled" @update:model-value="changeOperator(node, $event)">
            <el-option v-for="operator in operators(node)" :key="operator" :label="operatorLabels[operator] || operator" :value="operator" />
          </el-select>
          <div class="filter-expression-group__value">
            <template v-if="!isUnaryDataViewFilterOperator(node.operator)">
              <div v-if="valueMode(node) === 'function'" class="filter-expression-group__value-controls">
                <el-input :model-value="functionText(node)" readonly aria-label="值函数摘要" />
                <el-button :disabled="disabled" @click="emit('valueFunction', node)">更换函数</el-button>
                <el-button :disabled="disabled" @click="updateValue(node, '')">改为常量</el-button>
              </div>
              <div v-else class="filter-expression-group__value-controls">
                <SparkJsonEditor v-if="valueMode(node) === 'json'" :key="`${node.id}:${jsonRevision}`" :model-value="node.valueText"
                  class="filter-expression-group__json" aria-label="条件值 JSON" data-condition-json mode="text" :height="160" :read-only="disabled"
                  :main-menu-bar="false" :navigation-bar="false" :status-bar="false" v-on="{'update:modelValue': jsonUpdates.get(node.id)}" />
                <el-select v-else-if="valueMode(node) === 'list'" :model-value="listValue(node)" multiple filterable allow-create default-first-option clearable
                  aria-label="列表常量" :disabled="disabled" placeholder="输入条件值后按回车" @update:model-value="updateList(node, $event)">
                  <el-option v-for="(value, itemIndex) in listValue(node)" :key="itemIndex" :label="String(value)" :value="value" />
                </el-select>
                <el-input-number v-else-if="valueMode(node) === 'number'" :model-value="numberValue(node)" aria-label="数字常量" controls-position="right" :disabled="disabled" @update:model-value="updateValue(node, $event)" />
                <el-select v-else-if="valueMode(node) === 'boolean'" :model-value="booleanValue(node)" aria-label="布尔常量" :disabled="disabled" clearable @update:model-value="updateValue(node, $event)">
                  <el-option label="是" :value="true" /><el-option label="否" :value="false" />
                </el-select>
                <el-date-picker v-else-if="valueMode(node) === 'date' || valueMode(node) === 'datetime'" :model-value="textValue(node)"
                  :type="valueMode(node) === 'datetime' ? 'datetime' : 'date'" :value-format="valueMode(node) === 'datetime' ? 'YYYY-MM-DD HH:mm:ss' : 'YYYY-MM-DD'"
                  :disabled="disabled" aria-label="日期常量" @update:model-value="updateValue(node, $event)" />
                <el-input v-else :model-value="textValue(node)" aria-label="文本常量" :disabled="disabled" clearable placeholder="请输入条件值" @update:model-value="updateValue(node, $event)" />
                <el-button :disabled="disabled" title="使用服务端值函数" aria-label="使用服务端值函数" @click="emit('valueFunction', node)">ƒ(x)</el-button>
                <el-button size="small" :disabled="disabled" aria-label="切换条件值 JSON" @click="setValueMode(node, valueModes[node.id] === 'json' ? 'auto' : 'json')">{{ valueModes[node.id] === 'json' ? '类型输入' : 'JSON' }}</el-button>
              </div>
            </template>
            <span v-else class="filter-expression-group__hint">此运算符不需要值</span>
          </div>
        </template>
        <FilterExpressionGroup v-else :group="node" :draft="draft" :fields="fields" :function-context="functionContext" :depth="depth + 1" :max-depth="maxDepth" :max-rules="maxRules" :disabled="disabled" removable
          @remove="remove(index)" @change="emit('change')" @value-function="emit('valueFunction', $event)" />
        <el-button v-if="node.kind === 'condition'" :disabled="disabled" type="danger" plain aria-label="删除条件" @click="remove(index)">×</el-button>
      </div>
    </div>
    <div v-else class="filter-expression-group__empty">暂无条件
      <el-button size="small" :disabled="disabled || draft.countRules() >= maxRules" @click="addCondition">添加条件</el-button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { getDataViewFilterFieldOperators, isUnaryDataViewFilterOperator, type DataViewFilterOperator, type DataViewFilterJsonValue } from '@spark-appworks/spark-data'
import type { FilterExpressionGroupProps } from './FilterExpressionGroup.props'
import { FilterExpressionEditorDraft, type FilterExpressionEditorCondition } from '../FilterExpressionEditor/FilterExpressionEditor.props'
import SparkJsonEditor from '../../../../editors/SparkJsonEditor.vue'
const props = withDefaults(defineProps<FilterExpressionGroupProps>(), {functionContext: () => ({})})
const emit = defineEmits<{ change: []; remove: []; valueFunction: [condition: FilterExpressionEditorCondition] }>()
const operatorLabels = FilterExpressionEditorDraft.operatorLabels
type ValueMode = 'json' | 'text' | 'number' | 'boolean' | 'date' | 'datetime' | 'list' | 'function'
const valueModes = reactive<Record<number, 'json' | 'auto'>>({})
const jsonRevision = ref(0)
let active = true
watch([() => props.group, () => props.disabled], () => {jsonRevision.value++}, {flush: 'sync'})
onBeforeUnmount(() => {active = false})
function canEdit(node?: FilterExpressionEditorCondition): boolean {return active && !props.disabled && (!node || props.group.children.includes(node))}
function removeGroup(): void {if (canEdit() && props.removable) emit('remove')}
const jsonUpdates = computed(() => {
  const group = props.group, revision = jsonRevision.value
  return new Map(group.children.flatMap(node => node.kind !== 'condition' ? [] : [[node.id, (value: string): void => {
    if (!canEdit(node) || revision !== jsonRevision.value || props.group !== group
      || valueMode(node) !== 'json' || isUnaryDataViewFilterOperator(node.operator)) return
    node.valueText = value
    emit('change')
  }] as const]))
})
function field(node: FilterExpressionEditorCondition) {return props.fields.find(item => item.name === node.field)}
function literalValue(node: FilterExpressionEditorCondition): DataViewFilterJsonValue | undefined {
  try { return JSON.parse(node.valueText) } catch { return undefined }
}
function valueMode(node: FilterExpressionEditorCondition): ValueMode {
  if (valueModes[node.id] === 'json') return 'json'
  const value = literalValue(node), type = field(node)?.type
  if (value && typeof value === 'object' && !Array.isArray(value) && 'Type' in value && typeof value['Type'] === 'string') return 'function'
  if (node.valueText && value === undefined || value === null) return 'json'
  if (node.operator === 'in' || node.operator === 'not-in') return value === undefined || Array.isArray(value) && value.every(isOption) ? 'list' : 'json'
  if (type === 'number') return value === undefined || typeof value === 'number' ? 'number' : 'json'
  if (type === 'boolean') return value === undefined || typeof value === 'boolean' ? 'boolean' : 'json'
  if (value !== undefined && typeof value !== 'string') return 'json'
  return type === 'date' || type === 'datetime' ? type : 'text'
}
function setValueMode(node: FilterExpressionEditorCondition, value: 'json' | 'auto'): void {
  if (!canEdit(node)) return
  jsonRevision.value++
  valueModes[node.id] = value
}
function isOption(value: unknown): value is string | number | boolean {return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'}
function listValue(node: FilterExpressionEditorCondition): (string | number | boolean)[] {const value = literalValue(node); return Array.isArray(value) ? value.filter(isOption) : []}
function updateList(node: FilterExpressionEditorCondition, value: unknown): void {
  if (!Array.isArray(value)) return
  const previous = listValue(node)
  updateValue(node, value.map(item => typeof item === 'string' && !previous.includes(item) && field(node)?.type === 'number'
    && item.trim() !== '' && Number.isFinite(Number(item)) ? Number(item) : item))
}
function textValue(node: FilterExpressionEditorCondition): string { const value = literalValue(node); return typeof value === 'string' ? value : '' }
function numberValue(node: FilterExpressionEditorCondition): number | undefined { const value = literalValue(node); return typeof value === 'number' ? value : undefined }
function booleanValue(node: FilterExpressionEditorCondition): boolean | undefined { const value = literalValue(node); return typeof value === 'boolean' ? value : undefined }
function functionText(node: FilterExpressionEditorCondition): string {
  const value = literalValue(node)
  if (!value || typeof value !== 'object' || !('Type' in value)) return node.valueText
  return FilterExpressionEditorDraft.summarizeValue(value, props.functionContext)
}
function updateValue(node: FilterExpressionEditorCondition, value: unknown): void {
  if (!canEdit(node) || isUnaryDataViewFilterOperator(node.operator)) return
  node.valueText = value === undefined ? '' : JSON.stringify(value); emit('change')
}
function operators(node: FilterExpressionEditorCondition) {
  const allowed = getDataViewFilterFieldOperators(field(node) ?? { name: node.field, type: 'text' })
  return allowed.includes(node.operator) ? allowed : [node.operator, ...allowed]
}
function changeField(node: FilterExpressionEditorCondition, value: unknown): void {
  if (!canEdit(node) || typeof value !== 'string') return
  jsonRevision.value++; delete valueModes[node.id]; node.field = value; emit('change')
}
function changeOperator(node: FilterExpressionEditorCondition, value: unknown): void {
  if (!canEdit(node) || !operators(node).includes(value as DataViewFilterOperator)) return
  jsonRevision.value++; delete valueModes[node.id]; node.operator = value as DataViewFilterOperator; emit('change')
}
function updateLogic(value: unknown): void {if (canEdit() && (value === 'and' || value === 'or')) {props.group.logic = value; emit('change')}}
function addCondition(): void {if (canEdit() && props.draft.countRules() < props.maxRules) {props.draft.addCondition(props.group); emit('change')}}
function addGroup(): void {if (canEdit() && props.depth < props.maxDepth && props.draft.countRules() < props.maxRules) {props.draft.addGroup(props.group); emit('change')}}
function remove(index: number): void {if (canEdit()) {props.group.children.splice(index, 1); emit('change')}}
</script>

<style scoped>
.filter-expression-group {min-width:0; border:1px solid var(--el-border-color); border-radius:6px; background:var(--el-bg-color)}
.filter-expression-group--nested {margin-left:16px; background:var(--el-fill-color-light)}
.filter-expression-group__toolbar, .filter-expression-group__actions, .filter-expression-group__value-controls {display:flex; align-items:center; gap:8px}
.filter-expression-group__toolbar {justify-content:space-between; min-height:44px; padding:8px 12px; border-bottom:1px solid var(--el-border-color); background:var(--el-fill-color-light)}
.filter-expression-group__content {display:flex; flex-direction:column; gap:12px; padding:12px}
.filter-expression-group__node {display:flex; align-items:flex-start; gap:8px}
.filter-expression-group__node > section {flex:1}
.filter-expression-group__rule {display:grid; grid-template-columns:minmax(140px,1.1fr) minmax(120px,.8fr) minmax(240px,1.8fr) 40px; align-items:center}
.filter-expression-group__value, .filter-expression-group__rule > .el-select, .filter-expression-group__value-controls > :first-child {width:100%; min-width:0}
.filter-expression-group__value-controls > :first-child {flex:1}
.filter-expression-group__value-controls > .el-button {flex:0 0 auto; margin-left:0}
.filter-expression-group__hint, .filter-expression-group__empty {color:var(--el-text-color-secondary); font-size:13px}
.filter-expression-group__empty {padding:18px 12px}
@media (max-width:900px) {
  .filter-expression-group__toolbar, .filter-expression-group__actions {flex-wrap:wrap}
  .filter-expression-group__rule {grid-template-columns:minmax(0,1fr) minmax(0,1fr) 40px}
  .filter-expression-group__value {grid-column:1 / -1; grid-row:2}
  .filter-expression-group__rule > .el-button {grid-column:3; grid-row:1}
  .filter-expression-group--nested {margin-left:8px}
}
@media (max-width:560px) {
  .filter-expression-group__rule {grid-template-columns:minmax(0,1fr) 40px}
  .filter-expression-group__rule > .el-select:nth-child(2) {grid-column:1 / -1; grid-row:2}
  .filter-expression-group__value {grid-row:3}
  .filter-expression-group__rule > .el-button {grid-column:2}
  .filter-expression-group__value-controls {flex-wrap:wrap}
}
</style>
