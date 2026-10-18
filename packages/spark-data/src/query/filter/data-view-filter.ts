/**
 * @module @spark-appworks/spark-data:query/filter/data-view-filter
 * 职责：校验并持有不可变公开过滤树。
 * 边界：任何非法节点都拒绝整树，不暴露部分解析结果。
 * AI用途：构造、序列化和校验完整字段过滤树。
 */
import { DATA_VIEW_FILTER_OPERATORS, getDataViewFilterFieldOperators, getDataViewFilterFunctionDefinitions, isUnaryDataViewFilterOperator } from './data-view-filter-catalog'
import type {
  DataViewFilterCondition,
  DataViewFilterGroup,
  DataViewFilterFunctionContext,
  DataViewFilterFunctionTableField,
  DataViewFilterIssue,
  DataViewFilterJsonObject,
  DataViewFilterJsonValue,
  DataViewFilterOperator,
  DataViewFilterTree,
  DataViewFilterValidationContext,
  DataViewFilterValueFunction,
} from './data-view-filter-contract'

/** 解析成功返回完整冻结过滤树；失败只返回问题列表，没有部分树。 */
export type DataViewFilterParseResult = Readonly<{ ok: true; value: DataViewFilter }>
  | Readonly<{ ok: false; issues: readonly DataViewFilterIssue[] }>

type FilterReadContext = {
  path: string
  ancestors: Set<object>
  issues: DataViewFilterIssue[]
}

type FilterJsonEntry = readonly [string, DataViewFilterJsonValue]
type FilterFunctionValidationCommand = Readonly<{
  value: DataViewFilterValueFunction
  context: DataViewFilterFunctionContext
  path: string
  issues: DataViewFilterIssue[]
}>

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isOperator(value: unknown): value is DataViewFilterOperator {
  return DATA_VIEW_FILTER_OPERATORS.some(operator => operator === value)
}

function issue(context: FilterReadContext, item: Omit<DataViewFilterIssue, 'path'>): null {
  context.issues.push(Object.freeze({ ...item, path: context.path }))
  return null
}

function childContext(context: FilterReadContext, suffix: string): FilterReadContext {
  return { ...context, path: context.path + suffix }
}

function snapshotValue(value: unknown, context: FilterReadContext): DataViewFilterJsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'object') throw new Error(`${context.path}: 值必须是 JSON 数据`)
  if (context.ancestors.has(value)) throw new Error(`${context.path}: 值包含循环引用`)
  context.ancestors.add(value)
  try {
    if (Array.isArray(value)) {
      const items: DataViewFilterJsonValue[] = []
      for (let index = 0; index < value.length; index += 1) {
        items.push(snapshotValue(value[index], childContext(context, `[${index}]`)))
      }
      return Object.freeze(items)
    }
    if (!isRecord(value) || (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
      throw new Error(`${context.path}: 值必须是 JSON 对象`)
    }
    const entries = Object.entries(value).map(([key, item]): FilterJsonEntry => [key, snapshotValue(item, childContext(context, `.${key}`))])
    const result: DataViewFilterJsonObject = Object.fromEntries<DataViewFilterJsonValue>(entries)
    return Object.freeze(result)
  } finally {
    context.ancestors.delete(value)
  }
}

function readNode(input: unknown, context: FilterReadContext): DataViewFilterTree | null {
  if (!isRecord(input)) return issue(context, { code: 'invalid-node', message: '过滤节点必须是公开条件或分组对象' })
  if (context.ancestors.has(input)) return issue(context, { code: 'cycle', message: '过滤树包含循环引用' })
  context.ancestors.add(input)
  try {
    if ('logic' in input) {
      if ((input['logic'] !== 'and' && input['logic'] !== 'or') || !Array.isArray(input['filters'])
        || Object.keys(input).some(key => key !== 'logic' && key !== 'filters')) {
        return issue(context, { code: 'invalid-node', message: '分组只接受 logic 与 filters' })
      }
      const filters: DataViewFilterTree[] = []
      for (let index = 0; index < input['filters'].length; index += 1) {
        const child = readNode(input['filters'][index], childContext(context, `.filters[${index}]`))
        if (child !== null) filters.push(child)
      }
      return Object.freeze({ logic: input['logic'], filters: Object.freeze(filters) })
    }
    if (Object.keys(input).some(key => !['field', 'operator', 'value'].includes(key))) {
      return issue(context, { code: 'invalid-node', message: '条件只接受 field、operator 与 value' })
    }
    if (typeof input['field'] !== 'string' || !input['field'].trim()) {
      return issue(childContext(context, '.field'), { code: 'field-required', message: '过滤条件缺少字段' })
    }
    if (!isOperator(input['operator'])) {
      return issue(childContext(context, '.operator'), { code: 'invalid-operator', message: '不支持的公开过滤运算符' })
    }
    if (isUnaryDataViewFilterOperator(input['operator'])) return Object.freeze({ field: input['field'], operator: input['operator'] })
    const valueContext = childContext(context, '.value')
    if (!Object.hasOwn(input, 'value') || input['value'] === undefined) {
      return issue(valueContext, { code: 'value-required', message: '过滤条件缺少显式值' })
    }
    if (isRecord(input['value']) && 'Type' in input['value']) {
      if (typeof input['value']['Type'] !== 'string' || !input['value']['Type'].trim()) {
        return issue(valueContext, { code: 'invalid-value-function', message: '值函数必须包含非空 Type' })
      }
      if (input['value']['Type'] === 'GetConstValue' && (!Object.hasOwn(input['value'], 'Value') || input['value']['Value'] === undefined)) {
        return issue(childContext(valueContext, '.Value'), { code: 'value-required', message: 'GetConstValue 缺少显式 Value' })
      }
    }
    try {
      return Object.freeze({ field: input['field'], operator: input['operator'], value: snapshotValue(input['value'], valueContext) })
    } catch (error) {
      return issue(valueContext, { code: 'invalid-value', message: error instanceof Error ? error.message : '值不是 JSON 数据' })
    }
  } finally {
    context.ancestors.delete(input)
  }
}

/** 不可变的 SPARK 公开过滤树；解析失败不代表清空，也不产生可查询的部分树。 */
export class DataViewFilter {
  /**
   * 为定义编辑器合并内置系统参数与调用方候选，复用同一值函数目录。
   * 同名内置参数保留标准定义；显式函数覆盖（包括禁用声明）保留给下游，重复装配不扩大候选范围。
   * @param context 调用方的模型、字段、参数及扩展函数上下文。
   * @returns 保留扩展能力和候选的编辑上下文，不执行值函数或授予数据权限。
   */
  static editorContext(context: DataViewFilterFunctionContext = {}): DataViewFilterFunctionContext {
    const system = getDataViewFilterFunctionDefinitions({}).find(item => item.type === 'SystemData')
    const source = system?.fields.find(field => field.key === 'ParamName')?.options
    const defaults = typeof source === 'function' ? source({Type: 'SystemData'}, {}) : source ?? []
    const systemParams = [...new Map([...(context.systemParams ?? []), ...defaults].map(option => [option.value, option])).values()]
    const result = {...context, systemParams}
    const definitions = new Map([...getDataViewFilterFunctionDefinitions(result), ...(context.definitions ?? [])]
      .map(definition => [definition.type, definition]))
    return {...result, definitions: [...definitions.values()]}
  }

  /** 只持有已校验冻结的树；外部通过解析或构造入口建立过滤器。 */
  private constructor(private readonly tree: DataViewFilterTree) { Object.freeze(this) }

  static parse(input: unknown): DataViewFilterParseResult {
    let source: unknown = input
    if (typeof input === 'string') {
      try {
        source = JSON.parse(input)
      } catch {
        return { ok: false, issues: Object.freeze([{ code: 'invalid-json', path: '$', message: '过滤表达式不是有效 JSON' }]) }
      }
    }
    const context: FilterReadContext = { path: '$', ancestors: new Set(), issues: [] }
    const tree = readNode(source, context)
    return tree === null || context.issues.length > 0
      ? Object.freeze({ ok: false, issues: Object.freeze(context.issues) })
      : Object.freeze({ ok: true, value: new DataViewFilter(tree) })
  }

  static condition(command: DataViewFilterCondition): DataViewFilter {
    return DataViewFilter.require(command)
  }

  static group(command: DataViewFilterGroup): DataViewFilter {
    return DataViewFilter.require(command)
  }

  toJSON(): DataViewFilterTree { return this.tree }

  serialize(): string { return JSON.stringify(this.tree) }

  /** 返回值函数显式引用的模型名称，去重保序；仅识别正式表参数，不递归猜测常量或未知扩展。 */
  referencedTableNames(): readonly string[] {
    const names = new Set<string>()
    const visit = (node: DataViewFilterTree): void => {
      if ('logic' in node) {node.filters.forEach(visit); return}
      if (!DataViewFilter.isValueFunction(node.value)) return
      const value = node.value
      const key = value.Type === 'GetRefData' ? 'RefTableName' : value.Type === 'GetGroupData' ? 'GroupTableName'
        : value.Type === 'GetExpData' ? 'refTableName' : undefined
      const name = key === undefined ? undefined : value[key]
      if (typeof name === 'string' && name.length > 0) names.add(name)
    }
    visit(this.tree)
    return Object.freeze([...names])
  }

  /**
   * 为当前过滤树读取显式引用模型的字段编辑目录，保留全部模型候选。
   * 未提供字段且声明 loadFields 的模型才读取；同次每个模型只读一次，不修改输入上下文。
   * @param context 正式数据 owner 提供的可读模型及字段目录。
   * @returns 补齐所需字段的编辑上下文；失败拒绝，不缓存空目录。调用方仍须核对编辑身份并执行 validate。
   */
  async loadEditorContext(context: DataViewFilterFunctionContext): Promise<DataViewFilterFunctionContext> {
    const names = this.referencedTableNames(), tables = context.tables ?? []
    const referenced = tables.filter(table => names.includes(table.name))
    if (new Set(referenced.map(table => table.name)).size !== referenced.length) throw new Error('值函数模型目录存在重复名称')
    const pending = referenced.filter(table => table.fields === undefined && table.loadFields !== undefined)
    if (!pending.length) return context
    const loaded = new Map(await Promise.all(pending.map(async table => {
      const fields: unknown = await table.loadFields?.()
      const error = `模型 ${table.name} 的字段目录无效`
      if (!Array.isArray(fields)) throw new Error(error)
      const snapshot: DataViewFilterFunctionTableField[] = []
      for (const field of fields as unknown[]) {
        if (!isRecord(field) || typeof field['name'] !== 'string' || field['name'].trim().length === 0
          || field['label'] !== undefined && typeof field['label'] !== 'string') throw new Error(error)
        snapshot.push(Object.freeze({name: field['name'], ...(typeof field['label'] === 'string' ? {label: field['label']} : {})}))
      }
      if (new Set(snapshot.map(field => field.name)).size !== snapshot.length) throw new Error(error)
      return [table.name, Object.freeze(snapshot)] as const
    })))
    return {...context, tables: tables.map(table => {
      const fields = loaded.get(table.name)
      return fields === undefined ? table : {...table, fields}
    })}
  }

  /** Bind only explicit input-parameter values; preserve constants and other function execution domains. */
  bindInputParams(context: Readonly<Record<string, unknown>>): DataViewFilter {
    const bind = (tree: DataViewFilterTree): DataViewFilterTree => {
      if ('logic' in tree) return {...tree, filters: tree.filters.map(bind)}
      const value = tree.value
      if (!isRecord(value) || value['Type'] !== 'GetInputParam') return tree
      const name = value['ParamName']
      if (typeof name !== 'string' || !name.trim() || !Object.hasOwn(context, name)) {
        throw new TypeError(`SPARK DataView GetInputParam 参数缺失或不是有效 JSON: ${String(name)}`)
      }
      try {
        const snapshot = snapshotValue(context[name], {path: name, ancestors: new Set(), issues: []})
        return {...tree, value: {Type: 'GetConstValue', Value: snapshot}}
      } catch {
        throw new TypeError(`SPARK DataView GetInputParam 参数缺失或不是有效 JSON: ${name}`)
      }
    }
    return DataViewFilter.require(bind(this.tree))
  }

  validate(context: DataViewFilterValidationContext): readonly DataViewFilterIssue[] {
    const issues: DataViewFilterIssue[] = []
    let rules = 0
    const visit = (node: DataViewFilterTree, path: string, depth: number): void => {
      if ('logic' in node) {
        if (context.maxDepth !== undefined && depth > context.maxDepth) {
          issues.push({ code: 'max-depth', path, message: `过滤分组嵌套不能超过 ${context.maxDepth} 层` })
        }
        node.filters.forEach((child, index) => visit(child, `${path}.filters[${index}]`, depth + 1))
        return
      }
      rules += 1
      if (context.maxRules !== undefined && rules > context.maxRules) {
        issues.push({ code: 'max-rules', path, message: `过滤条件不能超过 ${context.maxRules} 条` })
      }
      const field = context.fields.find(item => item.name === node.field)
      if (!field) {
        issues.push({ code: 'unknown-field', path: `${path}.field`, message: `未知过滤字段：${node.field}` })
      } else if (!getDataViewFilterFieldOperators(field).includes(node.operator)) {
        issues.push({ code: 'operator-not-allowed', path: `${path}.operator`, message: `字段 ${node.field} 不支持运算符 ${node.operator}` })
      }
      if (context.valueFunctions !== undefined && DataViewFilter.isValueFunction(node.value)) {
        this.validateValueFunction({ value: node.value, context: context.valueFunctions, path: `${path}.value`, issues })
      }
    }
    visit(this.tree, '$', 0)
    return Object.freeze(issues.map(item => Object.freeze(item)))
  }

  private static isValueFunction(value: DataViewFilterJsonValue | undefined): value is DataViewFilterValueFunction {
    return isRecord(value) && typeof value['Type'] === 'string'
  }

  private validateValueFunction(command: FilterFunctionValidationCommand): void {
    const { value, context, path, issues } = command
    if (value.Type === 'GetConstValue') return
    const definition = getDataViewFilterFunctionDefinitions(context).find(item => item.type === value.Type)
    if (!definition) {
      issues.push({ code: 'invalid-value-function', path, message: `当前编辑上下文没有可用的值函数定义：${value.Type}` })
      return
    }
    const customIssue = definition.validate?.(value, context)
    if (customIssue) issues.push({ code: 'invalid-value-function', path, message: customIssue })
    for (const field of definition.fields) {
      if (field.visible?.(value, context) === false) continue
      const current = value[field.key]
      const fieldPath = `${path}.${field.key}`
      const missing = current === null || current === undefined || (typeof current === 'string' && !current.trim())
      if (field.required && (missing || (field.multiple && (!Array.isArray(current) || current.length === 0)))) {
        issues.push({ code: 'value-required', path: fieldPath, message: `请填写${field.label}` })
        continue
      }
      if (field.options !== undefined && !missing) {
        const options = typeof field.options === 'function' ? field.options(value, context) : field.options
        const selected = field.multiple && Array.isArray(current) ? current : [current]
        if (selected.some(item => !options.some(option => option.value === item && option.disabled !== true))) {
          issues.push({ code: 'invalid-value-function', path: fieldPath, message: `${field.label}不在当前可用选项中` })
        }
      }
    }
  }

  private static require(input: unknown): DataViewFilter {
    const result = DataViewFilter.parse(input)
    if (!result.ok) throw new Error(result.issues.map(item => `${item.path}: ${item.message}`).join('\n'))
    return result.value
  }
}
