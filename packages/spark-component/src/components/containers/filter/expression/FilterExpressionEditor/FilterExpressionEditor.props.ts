/**
 * @module @spark-appworks/spark-component:components/containers/filter/expression/FilterExpressionEditor/FilterExpressionEditor.props
 * 职责：完整过滤编辑器的输入和可保留不完整状态的草稿。边界：正式树解析与校验归 DataViewFilter；AI用途：可用此入口理解编辑与应用的区别。
 */
import { reactive } from 'vue'
import {
  DataViewFilter, getDataViewFilterFunctionDefinitions, isUnaryDataViewFilterOperator,
} from '@spark-appworks/spark-data'
import type * as Data from '@spark-appworks/spark-data'

/** 完整过滤编辑输入；字段与函数上下文用于校验，应用错误由父级查询 owner 回传。 */
export type FilterExpressionEditorProps = {
  modelValue?: Data.DataViewFilterTree | undefined
  columns: readonly Data.DataColumn[]
  functionContext?: Data.DataViewFilterFunctionContext
  maxDepth?: number
  maxRules?: number
  disabled?: boolean
  applyError?: string | null | undefined
}

/** 条件编辑草稿；内部 id 定位节点，valueText 原样保留尚未合法的 JSON。 */
export type FilterExpressionEditorCondition = {
  id: number
  kind: 'condition'
  field: string
  operator: Data.DataViewFilterOperator
  /** 未输入与显式空字符串不同；文本保留无效 JSON 草稿。 */
  valueText: string
}
/** AND/OR 分组草稿；区分原有空组与尚未补全的新组。 */
export type FilterExpressionEditorGroup = {
  id: number
  kind: 'group'
  logic: 'and' | 'or'
  children: FilterExpressionEditorNode[]
  /** 只允许已存在的空分组原样保存，新空分组须补全或显式删除。 */
  existing: boolean
}
/** 递归编辑节点，由条件或分组组成，不能直接提交为正式过滤树。 */
export type FilterExpressionEditorNode = FilterExpressionEditorCondition | FilterExpressionEditorGroup
/** 草稿检查结果；仅成功分支提供可应用的正式树，失败分支保留路径诊断。 */
type FilterExpressionEditorCheck = { ok: true; tree: Data.DataViewFilterTree }
  | { ok: false; issues: readonly Data.DataViewFilterIssue[] }

/** 编辑草稿只负责交互及不完整状态；公开树校验始终由 DataViewFilter 执行。 */
export class FilterExpressionEditorDraft {
  readonly root: FilterExpressionEditorGroup
  private sequence = 0
  private readonly syntheticRoot: boolean
  private readonly originalFunctions = new Set<string>()

  static fields(columns: readonly Data.DataColumn[]): readonly Data.DataViewFilterField[] {
    return columns.map((column): Data.DataViewFilterField => {
      const type = column.type
      if (['number', 'int', 'integer', 'decimal', 'float', 'double'].includes(type)) return { name: column.name, type: 'number' }
      if (type === 'boolean' || type === 'bool') return { name: column.name, type: 'boolean' }
      if (type === 'date') return { name: column.name, type: 'date' }
      if (type === 'datetime') return { name: column.name, type: 'datetime' }
      return { name: column.name, type: type === 'enum' ? 'select' : 'text' }
    })
  }

  /** 从已有正式树创建独立草稿；缺失树或单条件用临时根组承接编辑。 */
  constructor(tree?: Data.DataViewFilterTree) {
    this.syntheticRoot = tree === undefined || 'field' in tree
    const node = tree === undefined ? undefined : this.read(tree)
    const root: FilterExpressionEditorGroup = node?.kind === 'group' ? node : {
      id: ++this.sequence, kind: 'group', logic: 'and', children: node ? [node] : [], existing: false,
    }
    this.root = reactive(root)
  }

  addCondition(group: FilterExpressionEditorGroup): void {
    group.children.push({ id: ++this.sequence, kind: 'condition', field: '', operator: 'eq', valueText: '' })
  }

  addGroup(group: FilterExpressionEditorGroup): void {
    group.children.push({ id: ++this.sequence, kind: 'group', logic: 'and', children: [], existing: false })
  }

  countRules(node: FilterExpressionEditorNode = this.root): number {
    return node.kind === 'condition' ? 1 : node.children.reduce((sum, child) => sum + this.countRules(child), 0)
  }

  check(context: Data.DataViewFilterValidationContext): FilterExpressionEditorCheck {
    const issues: Data.DataViewFilterIssue[] = []
    const source = this.write(this.root, '$', issues)
    if (issues.length > 0) return { ok: false, issues }
    const checked = this.checkInput(source, context)
    if (!checked.ok) return checked
    const tree = checked.tree
    return this.syntheticRoot && 'logic' in tree && tree.logic === 'and' && tree.filters.length === 1 && tree.filters[0]
      ? { ok: true, tree: tree.filters[0] } : { ok: true, tree }
  }

  checkInput(source: unknown, context: Data.DataViewFilterValidationContext): FilterExpressionEditorCheck {
    const parsed = DataViewFilter.parse(source)
    if (!parsed.ok) return parsed
    const { valueFunctions, ...treeContext } = context
    const issues = [...parsed.value.validate(treeContext)]
    const available = valueFunctions ? getDataViewFilterFunctionDefinitions(valueFunctions) : []
    const visit = (node: Data.DataViewFilterTree, path: string): void => {
      if ('logic' in node) { node.filters.forEach((child, index) => visit(child, `${path}.filters[${index}]`)); return }
      const value = node.value
      if (valueFunctions === undefined || value === null || typeof value !== 'object' || Array.isArray(value) || !('Type' in value)) return
      if (!available.some(item => item.type === value['Type']) && this.originalFunctions.has(JSON.stringify(value))) return
      issues.push(...DataViewFilter.condition(node).validate({ fields: context.fields, valueFunctions })
        .filter(issue => issue.path.startsWith('$.value'))
        .map(issue => ({ ...issue, path: path + issue.path.slice(1) })))
    }
    const tree = parsed.value.toJSON()
    visit(tree, '$')
    return issues.length > 0 ? { ok: false, issues } : { ok: true, tree }
  }

  private read(tree: Data.DataViewFilterTree): FilterExpressionEditorNode {
    const id = ++this.sequence
    if ('field' in tree && tree.value !== null && typeof tree.value === 'object' && !Array.isArray(tree.value) && 'Type' in tree.value) this.originalFunctions.add(JSON.stringify(tree.value))
    return 'field' in tree ? {
      id, kind: 'condition', field: tree.field, operator: tree.operator,
      valueText: tree.value === undefined ? '' : JSON.stringify(tree.value),
    } : {
      id, kind: 'group', logic: tree.logic, children: tree.filters.map(child => this.read(child)), existing: true,
    }
  }

  private write(node: FilterExpressionEditorNode, path: string, issues: Data.DataViewFilterIssue[]): unknown {
    if (node.kind === 'group') {
      if (!node.existing && node.children.length === 0) issues.push({ code: 'invalid-node', path, message: '新分组尚未添加条件；清空过滤请使用“清空”' })
      return { logic: node.logic, filters: node.children.map((child, index) => this.write(child, `${path}.filters[${index}]`, issues)) }
    }
    if (isUnaryDataViewFilterOperator(node.operator)) return { field: node.field, operator: node.operator }
    if (node.valueText === '') return { field: node.field, operator: node.operator }
    try {
      const value: unknown = JSON.parse(node.valueText)
      return { field: node.field, operator: node.operator, value }
    } catch {
      issues.push({ code: 'invalid-json', path: `${path}.value`, message: '条件值不是有效 JSON' })
      return { field: node.field, operator: node.operator }
    }
  }
}
