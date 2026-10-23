/**
 * @module @spark-appworks/spark-data:validation/save-rule-validator
 * 职责：执行 DataColumn 与视图声明的保存规则：唯一、创建后不可改、字段范围、删除许可、选项引用、值函数及保存前写回。
 * 边界：只读取调用方给出的提交行与选项查询结果，不修改视图状态、不发起保存；写回由 DataView 经编辑通道应用。
 * AI用途：外部接口等配置页把业务规则声明在 pagedata 列/视图上，由同一 SPARK data 保存链执行。
 */
import { DataViewFilter } from '../query/filter/data-view-filter'
import type { DataViewFilterFunctionContext } from '../query/filter/data-view-filter-contract'
import type { DataColumn, DataColumnOptionSource, DataRow } from '../types'

/** 一条待提交行；fields 为相对原查询行的修改字段，新增行为全部输入字段。 */
type SaveRuleRow = Readonly<{
  id: string | number
  row: DataRow
  created: boolean
  fields: ReadonlySet<string>
}>

/** 规则作用的视图范围；label 形如 `表@视图`，用于统一错误格式。 */
type SaveRuleScope = Readonly<{
  label: string
  columns: readonly DataColumn[]
  rows: readonly SaveRuleRow[]
}>

/** 同步规则输入；retained 是保存后本视图保留的全部已知行。 */
type SaveRuleCheck = SaveRuleScope & Readonly<{
  retained: readonly DataRow[]
  allowedFields?: ReadonlySet<string>
  /** 新增行由视图范围填充的归属字段，不受 allowedFields 限制。 */
  createdExemptFields: ReadonlySet<string>
  deletes: number
  allowDelete: boolean
}>

/** 在同一 DataSet 中查询选项来源视图的读取器。 */
type SaveRuleOptionQuery = {
  (source: DataColumnOptionSource, fields: readonly string[], context?: Record<string, unknown>): Promise<DataRow[]>}

/** 异步规则输入，选项读取复用来源视图的正式查询。 */
type SaveRuleReferenceCheck = SaveRuleScope & Readonly<{ query: SaveRuleOptionQuery }>

/** 保存前需写回本行的字段值。 */
type SaveRuleWrite = Readonly<{ id: string | number; field: string; value: unknown }>

const empty = (value: unknown): boolean => value === null || value === undefined || value === ''

export class SaveRuleValidator {
  /** 同步规则；违反时抛出 DATA_VIEW_SAVE_VALIDATION，不改变任何状态。 */
  static check(input: SaveRuleCheck): void {
    const fail = (field: string, message: string): never => {
      throw new Error(`DATA_VIEW_SAVE_VALIDATION: ${input.label}.${field}: ${message}`)
    }
    if (!input.allowDelete && input.deletes > 0) fail('*', '当前视图不允许删除记录')
    const columns = new Map(input.columns.map(column => [column.name, column]))
    for (const item of input.rows) {
      for (const field of item.fields) {
        const column = columns.get(field)
        if (input.allowedFields !== undefined && !input.allowedFields.has(field)
          && !(item.created && input.createdExemptFields.has(field))) {
          fail(field, '字段不在当前视图的保存范围内')
        }
        if (!item.created && column?.immutable === true) fail(field, `${column.label ?? field} 创建后不能修改`)
      }
    }
    for (const column of input.columns) {
      if (column.unique !== true) continue
      const counts = new Map<unknown, number>()
      for (const row of input.retained) {
        const value = row[column.name]
        if (!empty(value)) counts.set(value, (counts.get(value) ?? 0) + 1)
      }
      for (const item of input.rows) {
        if (!item.created && !item.fields.has(column.name)) continue
        const value = item.row[column.name]
        if (!empty(value) && (counts.get(value) ?? 0) > 1) fail(column.name, `${column.label ?? column.name} 重复：${String(value)}`)
      }
    }
  }

  /** 选项引用与值函数规则；只核新增行及本次修改的字段。 */
  static async checkReferences(input: SaveRuleReferenceCheck): Promise<void> {
    const fail = (field: string, message: string): never => {
      throw new Error(`DATA_VIEW_SAVE_VALIDATION: ${input.label}.${field}: ${message}`)
    }
    const sources = new Map<string, Promise<DataRow[]>>()
    const read = (source: DataColumnOptionSource): Promise<DataRow[]> => {
      const fields = [...new Set([source.valueField, source.labelField ?? source.valueField])]
      const key = JSON.stringify([source.tableName, source.viewId ?? 'default', fields])
      const cached = sources.get(key) ?? input.query(source, fields)
      sources.set(key, cached)
      return cached
    }
    for (const item of input.rows) {
      for (const column of input.columns) {
        if (!item.created && !item.fields.has(column.name)) continue
        const value = item.row[column.name]
        if (column.optionsView !== undefined && !empty(value)) {
          const matches = await SaveRuleValidator.matches(input.query, column, item.row)
          if (matches.length !== 1) fail(column.name, `${column.label ?? column.name} 不在当前可选范围内或不唯一`)
        }
        const definition = column.valueFunction
        if (definition === undefined || value === null || value === undefined) continue
        const options = async (source: DataColumnOptionSource | undefined) => source === undefined ? undefined
          : (await read(source)).map(row => ({ value: String(row[source.valueField]),
            label: String(row[source.labelField ?? source.valueField] ?? row[source.valueField]) }))
        const inputParams = await options(definition.sources?.inputParams)
        const apiPublicParams = await options(definition.sources?.apiPublicParams)
        const context: DataViewFilterFunctionContext = {
          ...(definition.capabilities === undefined ? {} : { capabilities: definition.capabilities }),
          ...(inputParams === undefined ? {} : { inputParams }),
          ...(apiPublicParams === undefined ? {} : { apiPublicParams }),
        }
        const message = SaveRuleValidator.valueFunctionError(value, definition.format, context)
        if (message !== null) fail(column.name, message)
      }
    }
  }

  /** 保存前写回：normalize 去除首尾空白；选项 fill 在本字段新增或变更时同步匹配选项字段。 */
  static async writes(input: SaveRuleReferenceCheck): Promise<SaveRuleWrite[]> {
    const writes: SaveRuleWrite[] = []
    for (const item of input.rows) {
      const row = { ...item.row }
      for (const column of input.columns) {
        const value = row[column.name]
        if (column.trim === 'normalize' && typeof value === 'string' && value !== value.trim()
          && (item.created || item.fields.has(column.name))) {
          row[column.name] = value.trim()
          writes.push({ id: item.id, field: column.name, value: value.trim() })
        }
      }
      for (const column of input.columns) {
        const fill = column.optionsView?.fill
        if (fill === undefined || empty(row[column.name]) || (!item.created && !item.fields.has(column.name))) continue
        const matches = await SaveRuleValidator.matches(input.query, column, row)
        const match = matches[0]
        if (matches.length !== 1 || match === undefined) continue
        for (const [target, source] of Object.entries(fill)) {
          if (row[target] !== match[source]) writes.push({ id: item.id, field: target, value: match[source] })
        }
      }
    }
    return writes
  }

  private static async matches(query: SaveRuleOptionQuery, column: DataColumn, row: DataRow): Promise<DataRow[]> {
    const source = column.optionsView
    if (source === undefined) return []
    const fields = [...new Set([source.valueField, ...Object.values(source.fill ?? {})])]
    const context = source.context === undefined ? undefined
      : Object.fromEntries(Object.entries(source.context).map(([parameter, field]) => [parameter, row[field]]))
    const value = row[column.name]
    return (await query(source, fields, context)).filter(option => option[source.valueField] === value)
  }

  private static valueFunctionError(raw: unknown, format: 'text' | 'json' | 'json-object', context: DataViewFilterFunctionContext): string | null {
    const functionError = (text: unknown): string | null => {
      if (typeof text !== 'string') return '值函数必须保存为文本'
      let value: unknown
      try { value = JSON.parse(text) } catch { return null }
      if (value === null || typeof value !== 'object' || !('Type' in value)) return null
      const parsed = DataViewFilter.parse({ field: 'value', operator: 'eq', value })
      if (!parsed.ok) return parsed.issues.map(issue => issue.message).join('\n')
      const issues = parsed.value.validate({ fields: [{ name: 'value', type: 'text' }], valueFunctions: context })
      return issues.length > 0 ? issues.map(issue => issue.message).join('\n') : null
    }
    if (format === 'text') return functionError(raw)
    if (raw === '') return null
    if (typeof raw !== 'string') return '必须保存为JSON文本'
    let value: unknown
    try { value = JSON.parse(raw) } catch { return '不是有效JSON' }
    if (value === null || typeof value !== 'object' || (format === 'json-object' && Array.isArray(value))) {
      return format === 'json-object' ? '须为JSON对象' : '须为JSON对象或数组'
    }
    const errors: string[] = []
    const visit = (node: unknown): void => {
      if (typeof node === 'string') {
        const error = functionError(node)
        if (error !== null) errors.push(error)
      } else if (node !== null && typeof node === 'object') Object.values(node).forEach(visit)
    }
    visit(value)
    return errors[0] ?? null
  }
}
