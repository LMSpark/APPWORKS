/**
 * @module @spark-appworks/spark-data:query/filter/data-view-filter-catalog
 * 职责：提供过滤运算符与值函数编辑目录。
 * 边界：字段默认运算符和能力选项只服务编辑，不作为后端执行白名单。
 * AI用途：选择运算符并渲染值函数字段。
 */
import type {
  DataViewFilterField,
  DataViewFilterFunctionContext,
  DataViewFilterFunctionDefinition,
  DataViewFilterOperator,
  DataViewFilterValueFunction,
  DataViewFilterValueOption,
} from './data-view-filter-contract'

/** SPARK 公开过滤运算符的唯一目录；wire 名称由 API 边界负责。 */
export const DATA_VIEW_FILTER_OPERATORS = [
  'eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'is-null', 'is-not-null',
  'contains', 'not-contains', 'starts-with', 'not-starts-with',
  'ends-with', 'not-ends-with', 'in', 'not-in', 'is-empty', 'is-not-empty',
] as const

const textOperators = ['eq', 'ne', 'contains', 'not-contains', 'starts-with', 'not-starts-with', 'ends-with', 'not-ends-with', 'in', 'not-in', 'is-null', 'is-not-null', 'is-empty', 'is-not-empty'] as const
const comparableOperators = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'not-in', 'is-null', 'is-not-null'] as const
const booleanOperators = ['eq', 'ne', 'is-null', 'is-not-null'] as const

export function getDataViewFilterFieldOperators(field: DataViewFilterField): readonly DataViewFilterOperator[] {
  if (field.operators !== undefined) return field.operators
  if (field.type === 'text' || field.type === 'select') return textOperators
  return field.type === 'boolean' ? booleanOperators : comparableOperators
}

export function isUnaryDataViewFilterOperator(operator: string): boolean {
  return operator === 'is-null' || operator === 'is-not-null'
    || operator === 'is-empty' || operator === 'is-not-empty'
}

const systemParams: readonly DataViewFilterValueOption[] = [
  { label: '用户 ID', value: 'UserID' },
  { label: '用户名', value: 'UserName' },
  { label: '登录名', value: 'LoginName' },
  { label: '主职部门 ID', value: 'CurDepId' },
  { label: '主职部门名称', value: 'CurDepName' },
  { label: '顶级部门 ID', value: 'TopDepId' },
  { label: '用户所有部门 ID', value: 'AllDepId' },
  { label: '所有顶级部门编码', value: 'AllTopDepCode' },
  { label: '企业 ID', value: 'EntId' },
  { label: '企业简称', value: 'EntName' },
  { label: '当前时间', value: 'CurDateTime' },
  { label: '当前日期', value: 'CurDate' },
  { label: '当前年', value: 'CurYear' },
  { label: '当前月', value: 'CurMonth' },
  { label: '上一流程步骤办理人', value: 'GetLastFlowStepSendUserId' },
]
const groupValueTypes: readonly DataViewFilterValueOption[] = [
  { label: '最大值', value: 'MAX' },
  { label: '最小值', value: 'MIN' },
  { label: '平均数', value: 'AVERAGE' },
  { label: '总量', value: 'SUM' },
  { label: '总数据条数', value: 'COUNT' },
  { label: '字符串拼接', value: 'JOINSTR' },
]

function tableOptions(context: DataViewFilterFunctionContext): readonly DataViewFilterValueOption[] {
  return (context.tables ?? []).map(table => ({ label: table.label ?? table.name, value: table.name }))
}

function tableFieldOptions(value: DataViewFilterValueFunction, context: DataViewFilterFunctionContext, key: string): readonly DataViewFilterValueOption[] {
  const table = context.tables?.find(item => item.name === value[key])
  return (table?.fields ?? []).map(field => ({ label: field.label ?? field.name, value: field.name }))
}

const functionDefinitions: readonly DataViewFilterFunctionDefinition[] = [
  {
    type: 'GetRefData', label: '引用数据', fields: [
      { key: 'RefTableName', label: '引用表', control: 'select', required: true, options: (_value, context) => tableOptions(context) },
      { key: 'RefFieldName', label: '引用字段', control: 'select', required: true, options: (value, context) => tableFieldOptions(value, context, 'RefTableName') },
      { key: 'FkFieldName', label: '外键字段', control: 'select', required: true, options: (value, context) => tableFieldOptions(value, context, 'RefTableName') },
    ],
  },
  {
    type: 'GetGroupData', label: '引用分组', fields: [
      { key: 'GroupTableName', label: '引用表', control: 'select', required: true, options: (_value, context) => tableOptions(context) },
      { key: 'GroupField', label: '分组字段', control: 'select', required: true, options: (value, context) => tableFieldOptions(value, context, 'GroupTableName') },
      { key: 'Field', label: '函数字段', control: 'select', required: true, options: (value, context) => tableFieldOptions(value, context, 'GroupTableName') },
      { key: 'ValType', label: '聚合方式', control: 'select', required: true, options: (_value, context) => context.groupValueTypes ?? groupValueTypes },
    ],
  },
  {
    type: 'SystemData', label: '系统数据', fields: [
      { key: 'ParamName', label: '系统参数', control: 'select', required: true, options: (_value, context) => context.systemParams ?? systemParams },
    ],
  },
  {
    type: 'GetExpData', label: '表达式', fields: [
      { key: 'refTableName', label: '引用表', control: 'select', required: true, options: (_value, context) => tableOptions(context) },
      { key: 'Exp', label: '表达式', required: true },
    ],
  },
  {
    type: 'GetTableField', label: '关联表字段', enabled: context => Boolean(context.relatedFields?.length), fields: [
      { key: 'Field', label: '关联字段', control: 'select', required: true, options: (_value, context) => context.relatedFields ?? [] },
    ],
  },
  {
    type: 'GetHuoShanData', label: '火山接口', enabled: context => context.capabilities?.includes('huoshan') === true, fields: [
      { key: 'accessKey', label: '访问钥匙', required: true },
      { key: 'secretKey', label: '秘密密钥', control: 'password', required: true },
    ],
  },
  {
    type: 'GetApiPublicParam', label: '公共参数', enabled: context => Boolean(context.apiPublicParams?.length), fields: [
      { key: 'ParamName', label: '参数名称', control: 'select', required: true, options: (_value, context) => context.apiPublicParams ?? [] },
    ],
  },
  {
    type: 'GetInputParam', label: '接口参数', enabled: context => Boolean(context.inputParams?.length), fields: [
      { key: 'ParamName', label: '参数名称', control: 'select', required: true, options: (_value, context) => context.inputParams ?? [] },
    ],
  },
  {
    type: 'GetObjectArray', label: '对象数组', enabled: context => Boolean(context.inputParams?.length), fields: [
      { key: 'arrParamName', label: '数组参数', control: 'select', required: true, options: (_value, context) => context.inputParams ?? [] },
      { key: 'objectConstruct', label: '对象结构', control: 'textarea', required: true },
    ],
  },
  {
    type: 'GetApiAccount', label: 'API 账号', enabled: context => context.capabilities?.includes('api-account') === true && Boolean(context.apiAccounts?.length), fields: [
      { key: 'ParamName', label: 'API 账号', control: 'select', required: true, options: (_value, context) => context.apiAccounts ?? [] },
    ],
  },
  {
    type: 'CozeAuth', label: '扣子认证', enabled: context => context.capabilities?.includes('coze-auth') === true, fields: [
      { key: 'publicKey', label: '公钥', required: true },
      { key: 'privateKey', label: '私钥', control: 'password', required: true },
      { key: 'appId', label: 'App ID', required: true },
    ],
  },
  {
    type: 'GetUserMasterId', label: '获取用户宿主', fields: [
      { key: 'refType', label: '类型', control: 'select', required: true, options: [{ label: '角色分类', value: 'role' }, { label: '部门级别', value: 'dep' }] },
      { key: 'roleClassId', label: '角色分类', control: 'select', required: true, options: (_value, context) => context.roleClassItems ?? [], visible: value => value['refType'] === 'role' },
      { key: 'depLevel', label: '部门级别', control: 'select', required: true, visible: value => value['refType'] === 'dep', options: [
        { label: '顶级部门', value: '0' }, { label: '一级部门', value: '1' }, { label: '二级部门', value: '2' }, { label: '三级部门', value: '3' },
        { label: '四级部门', value: '4' }, { label: '五级部门', value: '5' }, { label: '六级部门', value: '6' }, { label: '七级部门', value: '7' },
      ] },
      { key: 'getChildDep', label: '包含子部门', control: 'checkbox', visible: value => value['refType'] === 'dep' },
    ],
  },
  {
    type: 'GetFlowNodeStepUserId', label: '指定流程节点人员（当前步骤相关）', fields: [
      { key: 'ModelId', label: '流程模型', control: 'select', required: true, options: (_value, context) => context.flowModelOptions ?? [] },
      { key: 'NodeId', label: '流程节点', control: 'select', required: true, options: (value, context) => typeof value['ModelId'] === 'string' ? context.flowNodeOptionsByModelId?.[value['ModelId']] ?? [] : [] },
      { key: 'Role', label: '人员身份', control: 'select', required: true, options: [{ label: '发送人（提交人）', value: 'send' }, { label: '接收人', value: 'receive' }] },
    ],
  },
]

export function getDataViewFilterFunctionDefinitions(context: DataViewFilterFunctionContext): readonly DataViewFilterFunctionDefinition[] {
  const definitions = new Map([...functionDefinitions, ...(context.definitions ?? [])].map(definition => [definition.type, definition]))
  return [...definitions.values()].filter(definition => definition.enabled?.(context) !== false)
}
