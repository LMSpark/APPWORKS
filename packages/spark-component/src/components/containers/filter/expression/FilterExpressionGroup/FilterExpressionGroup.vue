<!--
@module @spark-appworks/spark-component:components/containers/filter/expression/FilterExpressionGroup/FilterExpressionGroup
职责：递归编辑分组、条件和显式常量。边界：原样保留未知运算符和无效草稿，最终校验归编辑器；AI用途：可用此组件理解条件树交互。
-->
<template>
  <section class="filter-expression-group">
    <div class="filter-expression-group__actions">
      <el-select v-model="group.logic" aria-label="分组逻辑" :disabled="disabled" @change="emit('change')">
        <el-option label="并且 AND" value="and" /><el-option label="或者 OR" value="or" />
      </el-select>
      <el-button :disabled="disabled || draft.countRules() >= maxRules" @click="addCondition">添加条件</el-button>
      <el-button :disabled="disabled || depth >= maxDepth" @click="addGroup">添加分组</el-button>
    </div>
    <div v-for="(node, index) in group.children" :key="node.id" class="filter-expression-group__node">
      <template v-if="node.kind === 'condition'">
        <el-select v-model="node.field" aria-label="过滤字段" :disabled="disabled" filterable @change="emit('change')">
          <el-option v-for="field in fields" :key="field.name" :label="field.name" :value="field.name" />
        </el-select>
        <el-select v-model="node.operator" aria-label="过滤运算符" :disabled="disabled" @change="emit('change')">
          <el-option v-for="operator in operators(node)" :key="operator" :label="operator" :value="operator" />
        </el-select>
        <template v-if="!isUnaryDataViewFilterOperator(node.operator)">
          <el-select :model-value="valueMode(node)" aria-label="常量编辑方式" :disabled="disabled" @update:model-value="setValueMode(node, $event)">
            <el-option label="JSON / 数组 / 函数" value="json" /><el-option label="文本" value="text" />
            <el-option label="数字" value="number" /><el-option label="布尔" value="boolean" /><el-option label="日期" value="date" />
          </el-select>
          <el-input v-if="valueMode(node) === 'json'" v-model="node.valueText" aria-label="条件值 JSON" placeholder='显式 JSON 值，例如 ""、0、false、null、[]' :disabled="disabled" @input="emit('change')" />
          <el-input v-else-if="valueMode(node) === 'text'" :model-value="textValue(node)" aria-label="文本常量" :disabled="disabled" @update:model-value="updateValue(node, $event)" />
          <el-input-number v-else-if="valueMode(node) === 'number'" :model-value="numberValue(node)" aria-label="数字常量" :disabled="disabled" @update:model-value="updateValue(node, $event)" />
          <el-select v-else-if="valueMode(node) === 'boolean'" :model-value="booleanValue(node)" aria-label="布尔常量" :disabled="disabled" @update:model-value="updateValue(node, $event)">
            <el-option label="true" :value="true" /><el-option label="false" :value="false" />
          </el-select>
          <el-date-picker v-else :model-value="textValue(node)" value-format="YYYY-MM-DD" type="date" :disabled="disabled" @update:model-value="updateValue(node, $event)" />
          <el-button :disabled="disabled" @click="updateValue(node, null)">null</el-button>
          <el-button :disabled="disabled" @click="emit('valueFunction', node)">值函数</el-button>
        </template>
        <span v-else>无需值</span>
      </template>
      <FilterExpressionGroup v-else :group="node" :draft="draft" :fields="fields" :depth="depth + 1" :max-depth="maxDepth" :max-rules="maxRules" :disabled="disabled"
        @change="emit('change')" @value-function="emit('valueFunction', $event)" />
      <el-button :disabled="disabled" @click="remove(index)">删除</el-button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { reactive } from 'vue'
import { getDataViewFilterFieldOperators, isUnaryDataViewFilterOperator } from '@spark-appworks/spark-data'
import type { FilterExpressionGroupProps } from './FilterExpressionGroup.props'
import type { FilterExpressionEditorCondition } from '../FilterExpressionEditor/FilterExpressionEditor.props'
const props = defineProps<FilterExpressionGroupProps>()
const emit = defineEmits<{ change: []; valueFunction: [condition: FilterExpressionEditorCondition] }>()
type ValueMode = 'json' | 'text' | 'number' | 'boolean' | 'date'
const valueModes = reactive<Record<number, ValueMode>>({})
function valueMode(node: FilterExpressionEditorCondition): ValueMode { return valueModes[node.id] ?? 'json' }
function setValueMode(node: FilterExpressionEditorCondition, value: unknown): void {
  if (value === 'json' || value === 'text' || value === 'number' || value === 'boolean' || value === 'date') valueModes[node.id] = value
}
function literalValue(node: FilterExpressionEditorCondition): unknown {
  try { return JSON.parse(node.valueText) } catch { return undefined }
}
function textValue(node: FilterExpressionEditorCondition): string { const value = literalValue(node); return typeof value === 'string' ? value : '' }
function numberValue(node: FilterExpressionEditorCondition): number | undefined { const value = literalValue(node); return typeof value === 'number' ? value : undefined }
function booleanValue(node: FilterExpressionEditorCondition): boolean | undefined { const value = literalValue(node); return typeof value === 'boolean' ? value : undefined }
function updateValue(node: FilterExpressionEditorCondition, value: unknown): void { node.valueText = value === undefined ? '' : JSON.stringify(value); emit('change') }
function operators(node: FilterExpressionEditorCondition) {
  const field = props.fields.find(item => item.name === node.field)
  const allowed = getDataViewFilterFieldOperators(field ?? { name: node.field, type: 'text' })
  return allowed.includes(node.operator) ? allowed : [node.operator, ...allowed]
}
function addCondition(): void { props.draft.addCondition(props.group); emit('change') }
function addGroup(): void { props.draft.addGroup(props.group); emit('change') }
function remove(index: number): void { props.group.children.splice(index, 1); emit('change') }
</script>

<style scoped>
.filter-expression-group { border: 1px solid var(--el-border-color); padding: 12px; border-radius: 4px; }
.filter-expression-group__actions, .filter-expression-group__node { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; flex-wrap: wrap; }
.filter-expression-group__node > section { flex: 1; }
.filter-expression-group__node > .el-input { min-width: 180px; flex: 1; }
.filter-expression-group__node > .el-select { width: 160px; }
</style>
