/**
 * @module @spark-appworks/spark-component:components/containers/filter/expression/FilterExpressionEditor/FilterExpressionEditor.props
 * 职责：完整过滤编辑器的输入和可保留不完整状态的草稿。边界：正式树解析与校验归 DataViewFilter；AI用途：可用此入口理解编辑与应用的区别。
 */
import { reactive } from 'vue'
import { isRecord } from '@spark-appworks/spark-utils'
import {
  DataViewFilter, getDataViewFilterFunctionDefinitions, isUnaryDataViewFilterOperator,
} from '@spark-appworks/spark-data'
import type * as Data from '@spark-appworks/spark-data'

/** 完整过滤编辑输入；默认递归条件树，辅助JSON树/文本复用仓内编辑器并编辑同一表达式。字段与函数上下文用于校验，应用错误由父级查询 owner 回传。 */
export type FilterExpressionEditorProps = {
  /** 默认dialog；inline直接显示条件树，取消恢复已应用条件，不创建第二套过滤逻辑。 */
  display?: 'dialog' | 'inline'
  /** 弹窗入口的摘要样式；box为输入框，inline为参考页的行内文本链接。与display编辑模式不同。 */
  displayMode?: 'box' | 'inline'
  /** 空条件入口提示；省略或undefined为“空”，显式空字符串保留。 */
  placeholder?: string | undefined
  /** 条件编辑窗口标题；省略或undefined为“过滤设置”，不改变过滤定义。 */
  title?: string | undefined
  /** 是否显示快捷清空入口；默认true，false不禁止通过条件树编辑得到空条件，也不改变数据权限。 */
  clearable?: boolean | undefined
  /** 常规窗口宽度；默认980px，数值按像素处理，字符串接受CSS宽度；全屏时忽略。 */
  dialogWidth?: string | number | undefined
  /** 视口宽度小于等于该像素值时自动全屏；默认900，0或负数禁用；仅作用于过滤窗口。 */
  autoFullscreenBelow?: number | undefined
  /** 未应用草稿或编辑弹窗存在时为true；接受应用、取消及释放后为false，不表示已保存。 */
  onEditingChange?: (editing: boolean) => void
  modelValue?: Data.DataViewFilterTree | undefined
  /** 字段名称是条件身份，label用于显示；排除isComputed框架列及computeExpression本地计算列，树和JSON应用共用此查询字段目录。type选择常量输入类型。 */
  columns: readonly Data.DataColumn[]
  functionContext?: Data.DataViewFilterFunctionContext
  maxDepth?: number
  maxRules?: number
  disabled?: boolean
  /** 可浏览完整条件树和JSON，但不得修改、清空或应用；不会通知存在待提交编辑。disabled仍禁止打开。 */
  readonly?: boolean
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
  /** 条件摘要与条件行共用同一运算符文案。 */
  static readonly operatorLabels: Readonly<Record<Data.DataViewFilterOperator, string>> = {
    eq: '等于', ne: '不等于', gt: '大于', gte: '大于等于', lt: '小于', lte: '小于等于',
    'is-null': '为空', 'is-not-null': '不为空', contains: '包含', 'not-contains': '不包含',
    'starts-with': '以…开始', 'not-starts-with': '不以…开始', 'ends-with': '以…结束', 'not-ends-with': '不以…结束',
    in: '在列表中', 'not-in': '不在列表中', 'is-empty': '为空字符串', 'is-not-empty': '不为空字符串',
  }

  /** 参考组件的递归摘要；括号保留组关系，字段标题不替换字段身份，不执行表达式。 */
  static summarize(input: Readonly<{
    tree: Data.DataViewFilterTree | undefined
    columns: readonly Data.DataColumn[]
    context?: Data.DataViewFilterFunctionContext
    root?: boolean
  }>): string {
    const {tree, columns, context = {}, root = true} = input
    if (!tree) return ''
    if ('logic' in tree) {
      const parts = tree.filters.map(child => this.summarize({tree: child, columns, context, root: false}))
      const content = parts.join(tree.logic === 'and' ? ' 并且 ' : ' 或者 ')
      return root || parts.length <= 1 ? content : `（${content}）`
    }
    const label = columns.find(column => column.name === tree.field)?.label
    const field = label === '' ? tree.field : label ?? tree.field
    const condition = `${field} ${this.operatorLabels[tree.operator]}`
    return isUnaryDataViewFilterOperator(tree.operator) ? condition : `${condition} ${this.summarizeValue(tree.value, context)}`
  }

  /** 条件行与摘要共用函数说明，密码成员始终不进入显示文本。 */
  static summarizeValue(value: Data.DataViewFilterJsonValue | undefined, context: Data.DataViewFilterFunctionContext = {}): string {
    if (value === undefined) return ''
    if (!isRecord(value) || typeof value['Type'] !== 'string') return JSON.stringify(value)
    const definition = getDataViewFilterFunctionDefinitions(context).find(item => item.type === value['Type'])
    const detail = definition?.fields.filter(item => item.control !== 'password' && item.key in value)
      .map(item => `${item.label}：${JSON.stringify(value[item.key])}`).join('，')
    return `${definition?.label ?? value['Type']}${detail ? `（${detail}）` : ''}`
  }

  readonly root: FilterExpressionEditorGroup
  private sequence = 0
  private readonly syntheticRoot: boolean
  private readonly originalFunctions = new Set<string>()

  /** 查询条件只选择来源字段；框架标识与读取后计算的值不作为查询输入，旧条件保留原文并由校验诊断。 */
  static fields(columns: readonly Data.DataColumn[]): ReadonlyArray<Data.DataViewFilterField & Pick<Data.DataColumn, 'label'>> {
    return columns.filter(column => !column.isComputed && !column.computeExpression).map(column => {
      const type = column.type
      const fieldType: Data.DataViewFilterField['type'] = ['number', 'int', 'integer', 'decimal', 'float', 'double'].includes(type) ? 'number'
        : type === 'boolean' || type === 'bool' ? 'boolean' : type === 'date' ? 'date' : type === 'datetime' ? 'datetime' : type === 'enum' ? 'select' : 'text'
      return { name: column.name, type: fieldType, ...(column.label === undefined ? {} : {label: column.label}) }
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
