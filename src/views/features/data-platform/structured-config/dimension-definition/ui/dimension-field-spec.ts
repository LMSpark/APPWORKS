/**
 * @module app:views/features/data-platform/structured-config/dimension-definition/ui/dimension-field-spec
 * 职责：声明维度中心各记录的编辑字段、候选值及单记录校验，供统一记录对话框消费。
 * 边界：只描述字段与纯校验；跨记录约束（唯一性、引用、启用前置）由页面基于正式DataView结果判断。
 */
import type {DataRow} from '@spark-appworks/spark-data'
import type {FeatureFieldOption, FeatureFieldSpec} from '@/views/features/shared/record/feature-field-spec'

const opts = (pairs: Record<string, string>): FeatureFieldOption[] => Object.entries(pairs).map(([value, label]) => ({value, label}))
export const STATUS_OPTIONS: readonly FeatureFieldOption[] = [{value: 1, label: '启用'}, {value: 0, label: '停用'}]
/** 只读列展示：各模型状态/标志列有0/1数值与布尔两种正式类型。 */
export const FLAG_DISPLAY: readonly FeatureFieldOption[] = [...STATUS_OPTIONS, {value: true, label: '启用'}, {value: false, label: '停用'}]
export const YES_NO_DISPLAY: readonly FeatureFieldOption[] = [{value: 1, label: '是'}, {value: 0, label: '否'}, {value: true, label: '是'}, {value: false, label: '否'}]
const OPERATORS = opts({equal: '等于', contains: '包含', notnull: '非空', notzero: '非零'})
const CONST_FIELD = opts({CONST: '常量', FIELD: '字段'})
const CONST_FIELD_FUNC = opts({CONST: '常量', FIELD: '字段', FUNC: '函数'})

export const text = (row: Readonly<DataRow> | undefined, field: string): string => {
  const raw = row?.[field]
  return typeof raw === 'string' || typeof raw === 'number' ? String(raw).trim() : ''
}
export const enabled = (row: Readonly<DataRow> | undefined, field: string): boolean => {
  const raw = row?.[field]
  return raw === true || raw === 1 || raw === '1' || raw === 'true'
}
const has = (field: string) => (row: Readonly<DataRow>) => text(row, field) !== ''
const typed = (type: string, field: string, label: string): FeatureFieldSpec[] => [
  {field: type, label: `${label}类型`, kind: 'select', options: CONST_FIELD_FUNC},
  {field, label: `${label}表达式`, required: true, when: has(type)},
]

export const DEFINITION_SPECS: readonly FeatureFieldSpec[] = [
  {field: 'category_code', label: '维度分类'},
  {field: 'definition_code', label: '维度编码', required: true},
  {field: 'definition_name', label: '维度名称', required: true},
  {field: 'value_type', label: '值类型', kind: 'select', required: true,
    options: opts({string: '字符串', integer: '整数', number: '数值', boolean: '布尔', date: '日期', datetime: '时间'})},
  {field: 'member_domain', label: '成员域'},
  {field: 'cardinality', label: '基数', kind: 'select', required: true, options: opts({single: '单值', multiple: '多值'})},
  {field: 'null_policy', label: '空值策略', kind: 'select', required: true, options: opts({allow: '允许', reject: '拒绝'})},
  {field: 'version_no', label: '版本', kind: 'number', required: true},
  {field: 'effective_from', label: '生效时间'},
  {field: 'effective_to', label: '失效时间'},
  {field: 'status', label: '启用', kind: 'select', options: STATUS_OPTIONS, required: true},
  {field: 'description', label: '说明', kind: 'textarea'},
]

export const CATEGORY_SPECS: readonly FeatureFieldSpec[] = [
  {field: 'biz_category_code', label: '分类编码', required: true},
  {field: 'biz_category_name', label: '分类名称', required: true},
  {field: 'sort_no', label: '排序', kind: 'number'},
  {field: 'status', label: '启用', kind: 'switch'},
  {field: 'description', label: '说明', kind: 'textarea'},
]

export function ruleSpecs(eventKey: string): FeatureFieldSpec[] {
  return [
    {field: 'rule_code', label: '规则编码', required: true},
    {field: 'rule_name', label: '规则名称', required: true},
    {field: 'event_code', label: '事件', kind: 'select', optionKey: eventKey, labelFields: ['template_name', 'event_code'], required: true},
    {field: 'biz_category', label: '业务分类', readonly: true},
    {field: 'account_set_id', label: '账套', required: true},
    {field: 'priority', label: '优先级', kind: 'number'},
    {field: 'voucher_required', label: '要求凭证', kind: 'switch'},
    {field: 'auto_voucher_write', label: '自动写凭证', kind: 'switch'},
    {field: 'stop_after_match', label: '命中后停止', kind: 'switch'},
    {field: 'status', label: '启用', kind: 'switch'},
    {field: 'description', label: '说明', kind: 'textarea'},
  ]
}

export function conditionSpecs(resultKey: string): FeatureFieldSpec[] {
  const compares = (row: Readonly<DataRow>) => !['notnull', 'notzero'].includes(text(row, 'operator'))
  return [
    {field: 'result_id', label: '作用结果', kind: 'select', optionKey: resultKey, labelFields: ['dim_code', 'collection_path']},
    {field: 'field_code', label: '字段', required: true},
    {field: 'operator', label: '运算符', kind: 'select', options: OPERATORS, required: true},
    {field: 'value_source', label: '比较来源', kind: 'select', options: CONST_FIELD, required: true, when: compares},
    {field: 'compare_value', label: '比较值', required: true, when: row => compares(row) && text(row, 'value_source') === 'CONST'},
    {field: 'compare_field', label: '比较字段', required: true, when: row => compares(row) && text(row, 'value_source') === 'FIELD'},
    {field: 'sort_no', label: '顺序', kind: 'number', required: true},
    {field: 'description', label: '说明', kind: 'textarea'},
  ]
}

export const RESULT_SPECS: readonly FeatureFieldSpec[] = [
  {field: 'dim_category', label: '维度分类', required: true},
  {field: 'collection_path', label: '集合路径'},
  {field: 'dim_code_type', label: '维度编码来源', kind: 'select', options: CONST_FIELD, required: true},
  {field: 'dim_code', label: '维度编码', required: true},
  {field: 'value_type', label: '取值类型', kind: 'select', options: [...CONST_FIELD_FUNC, {value: 'DICT', label: '字典'}], required: true},
  {field: 'value_expr', label: '取值表达式', required: true},
  {field: 'value_name_type', label: '名称类型', kind: 'select', options: [...CONST_FIELD_FUNC, {value: 'DICT', label: '字典'}]},
  {field: 'value_name_expr', label: '名称表达式', required: true, when: has('value_name_type')},
  {field: 'amount_type', label: '金额类型', kind: 'select', options: [{value: 'NONE', label: '无'}, ...CONST_FIELD_FUNC], required: true},
  {field: 'amount_expr', label: '金额表达式', required: true, when: row => text(row, 'amount_type') !== '' && text(row, 'amount_type') !== 'NONE'},
  ...typed('direction_type', 'direction_expr', '方向'),
  ...typed('currency_type', 'currency_expr', '币种'),
  ...typed('period_type', 'period_expr', '期间'),
  {field: 'source_id_type', label: '来源标识类型', kind: 'select', options: opts({FIELD: '字段', FUNC: '函数'}),
    when: has('collection_path'), required: true},
  {field: 'source_id_expr', label: '来源标识表达式', when: has('collection_path'), required: true},
  {field: 'required_flag', label: '必填', kind: 'switch'},
  {field: 'sort_no', label: '顺序', kind: 'number', required: true},
  {field: 'description', label: '说明', kind: 'textarea'},
]

const COLLECTION_PATH = /^[A-Za-z_][\w]*\[\](\.[A-Za-z_][\w]*\[\])*$/u
export function validateResult(row: Readonly<DataRow>): string | undefined {
  const path = text(row, 'collection_path')
  if (path && !COLLECTION_PATH.test(path)) return '集合路径须使用 x[].y[] 形式'
  return undefined
}
