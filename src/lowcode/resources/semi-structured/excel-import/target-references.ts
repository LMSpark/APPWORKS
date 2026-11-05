/**
 * @module app:lowcode/resources/semi-structured/excel-import/target-references
 * 职责：按Excel过滤、排序、布局和转换表达式的各自合同检查换表引用。
 * 边界：只校验明确字段位置，保留原文，不扫描常量字符串、不改写布局或执行业务表达式。
 * AI用途：目标替换前验证新字段仍能承接本配置及直接子配置的已有引用。
 */
import {DataViewFilterCodec, type DataRow} from '@spark-appworks/spark-data'
import {parseJsonDocument} from '@spark-appworks/spark-json-document'
import type {ExcelTarget} from './target-selection'
import {validateExcelLayoutTarget} from './layout-target-references'
function record(value: unknown): value is Record<string, unknown> {return value !== null && typeof value === 'object' && !Array.isArray(value)}
function json(value: unknown, path: string): unknown {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string') throw new Error(`${path}必须是正式JSON文本`)
  try {return parseJsonDocument(value)} catch {throw new Error(`${path}不是有效JSON，原文已保留`)}
}
function list(value: unknown, path: string): unknown[] {if (!Array.isArray(value)) throw new Error(`${path}必须是数组`); return value}
/**
 * @param input 原配置可读投影、原映射名称、直接子节点及该节点规则；不得混入其他方案。
 * @returns 无失效引用时返回；不支持的作用域明确拒绝，原文不变。
 */
export function validateExcelTargetReferences(input: Readonly<{node: Readonly<DataRow>; oldFields: readonly string[]; children: ReadonlyArray<Readonly<DataRow>>; rules: ReadonlyArray<Readonly<DataRow>>; selection: ExcelTarget}>): void {
  const {node, selection} = input, available = new Set(selection.fields.map(field => field.name)), removed = new Set(input.oldFields.filter(name => !available.has(name)))
  const exists = (value: unknown, path: string): void => {if (value === undefined || value === null || value === '') return; if (typeof value !== 'string' || !available.has(value)) throw new Error(`${path}引用新目标中不存在的字段: ${String(value)}`)}
  exists(node['foreignKeyField'], 'foreignKeyField')
  input.children.forEach(child => exists(child['parentField'], `子配置[${String(child['rowid'])}].parentField`))
  const filter = json(node['filters'], 'filters')
  if (filter !== undefined && filter !== null) {
    const decoded = DataViewFilterCodec.decode(filter), issues = decoded.validate({fields: selection.fields.map(field => ({name: field.name, type: field.type === 1 ? 'number' : field.type === 2 ? 'datetime' : 'text'}))})
    const firstIssue = issues[0]
    if (firstIssue !== undefined) throw new Error(`filters${firstIssue.path}: ${firstIssue.message}`)
  }
  const sorted = json(node['sorted'], 'sorted')
  if (sorted !== undefined && sorted !== null) list(sorted, 'sorted').forEach((item, index) => {
    if (!record(item) || typeof item['Field'] !== 'string' || !item['Field'] || !['ascending', 'descending'].includes(String(item['Type']))) throw new Error(`sorted[${index}]排序合同无效`)
    exists(item['Field'], `sorted[${index}].Field`)
  })
  const layout = json(node['sheet_layout_json'], 'sheet_layout_json')
  if (layout !== undefined && layout !== null) validateExcelLayoutTarget({layout, oldTable: String(node['table'] ?? ''), newTable: selection.table, nodeId: node['rowid'], fields: available})
  const reference = (value: unknown, path: string): void => {if (typeof value === 'string' && removed.has(value)) throw new Error(`${path}引用已移除字段: ${value}`)}
  const expression = (value: unknown, path: string): void => {
    if (value === null || value === undefined) return
    if (!record(value)) {if (Array.isArray(value)) throw new Error(`${path}表达式合同无效`); return}
    if (Object.hasOwn(value, 'field')) {reference(value['field'], `${path}.field`); return}
    if (Object.hasOwn(value, 'const')) return
    if (typeof value['op'] !== 'string') throw new Error(`${path}表达式作用域无法核定`)
    list(value['args'] ?? [], `${path}.args`).forEach((arg, index) => expression(arg, `${path}.args[${index}]`))
  }
  input.rules.forEach(rule => {
    const path = `规则[${String(rule['id'])}]`
    const kind = rule['rule_type']
    if (!['TRIM', 'REPLACE', 'CONVERT', 'EXPLODE', 'LOOKUP', 'COMPUTE', 'DEFAULT', 'OVERRIDE', 'VALIDATE', 'FILTER', 'DEDUPLICATE', 'UNPIVOT', 'PIVOT'].includes(String(kind))) throw new Error(`${path}.rule_type的引用合同尚未核定`)
    reference(rule['source_field'], `${path}.source_field`); reference(rule['target_field'], `${path}.target_field`)
    expression(json(rule['condition_json'], `${path}.condition_json`), `${path}.condition_json`)
    const config = json(rule['config_json'], `${path}.config_json`)
    if (config === undefined || config === null) return
    if (!record(config)) throw new Error(`${path}.config_json必须是对象`)
    expression(config['expression'], `${path}.config_json.expression`)
    if (kind === 'VALIDATE') list(config['requiredFields'] ?? [], `${path}.requiredFields`).forEach(field => reference(field, `${path}.requiredFields`))
    if (kind === 'DEDUPLICATE') list(config['fields'] ?? [], `${path}.fields`).forEach(field => reference(field, `${path}.fields`))
    if (['PIVOT', 'UNPIVOT'].includes(String(kind)) && removed.size) throw new Error(`${path}涉及行结构转换，须先核定新目标的生成依赖`)
  })
}
