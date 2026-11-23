/**
 * @module app:lowcode/resources/structured-config/dimension-source/source-contracts
 * 职责：平台注册事件来源合同注册表；维度来源绑定选择 platform-event 时只能引用这里登记的合同。
 * 边界：合同由平台代码登记、只读冻结，不经页面维护；字段 name 是映射保存的 source_field_name，dimension 角色字段才可映射到维度定义。
 * AI用途：新增平台事件来源时在注册表追加冻结合同，并保证 id 唯一、事件编码不与数据模型事件冲突。
 */

/** 平台事件载荷字段的语义角色；只有 dimension 字段可映射到维度定义。 */
type DimensionSourceContractFieldRole = 'identity' | 'attribute' | 'dimension' | 'relation' | 'time'

/** 平台事件载荷字段。 */
export type DimensionSourceContractField = Readonly<{
  id: string
  name: string
  valueType: 'string' | 'number' | 'boolean' | 'datetime'
  semanticRole: DimensionSourceContractFieldRole
  /** dimension 角色字段对应的维度定义编码。 */
  dimensionCode?: string
  required: boolean
}>

/** 平台注册事件来源合同。 */
export type DimensionSourceContract = Readonly<{
  id: string
  name: string
  businessCategory: string
  dimensionCategory: string
  eventCode: string
  payloadVersion: number
  projectionVersion: number
  fields: readonly DimensionSourceContractField[]
}>

function field(input: DimensionSourceContractField): DimensionSourceContractField {
  return Object.freeze({...input})
}

const ENTERPRISE_TASK: DimensionSourceContract = Object.freeze({
  id: 'platform.enterprise-task.v2',
  name: '企业任务变化',
  businessCategory: 'enterprise.task',
  dimensionCategory: 'ENTERPRISE_TASK',
  eventCode: 'enterprise.task.changed',
  payloadVersion: 2,
  projectionVersion: 1,
  fields: Object.freeze([
    field({id: 'taskId', name: '任务 ID', valueType: 'string', semanticRole: 'identity', required: true}),
    field({id: 'title', name: '任务标题', valueType: 'string', semanticRole: 'attribute', required: true}),
    field({id: 'status', name: '任务状态', valueType: 'string', semanticRole: 'dimension', dimensionCode: 'task.status', required: true}),
    field({id: 'kind', name: '任务类型', valueType: 'string', semanticRole: 'dimension', dimensionCode: 'task.kind', required: true}),
    field({id: 'priority', name: '任务优先级', valueType: 'string', semanticRole: 'dimension', dimensionCode: 'task.priority', required: true}),
    field({id: 'assigneeId', name: '负责人 ID', valueType: 'string', semanticRole: 'relation', required: true}),
    field({id: 'assigneeName', name: '负责人名称', valueType: 'string', semanticRole: 'attribute', required: true}),
    field({id: 'sourceApplicationId', name: '来源应用 ID', valueType: 'string', semanticRole: 'relation', required: true}),
    field({id: 'sourceLabel', name: '来源名称', valueType: 'string', semanticRole: 'attribute', required: true}),
    field({id: 'sourceHref', name: '办理地址', valueType: 'string', semanticRole: 'attribute', required: true}),
    field({id: 'occurredAt', name: '状态发生时间', valueType: 'datetime', semanticRole: 'time', required: true}),
    field({id: 'dueAt', name: '截止时间', valueType: 'datetime', semanticRole: 'time', required: false}),
    field({id: 'summary', name: '任务摘要', valueType: 'string', semanticRole: 'attribute', required: false}),
  ]),
})

/** 已登记的平台事件来源合同（冻结）。 */
export const DIMENSION_SOURCE_CONTRACTS: readonly DimensionSourceContract[] = Object.freeze([ENTERPRISE_TASK])

/** 按合同 ID 解析唯一登记合同；重复登记或未登记时抛错。 */
export function dimensionSourceContract(id: string): DimensionSourceContract {
  const found = DIMENSION_SOURCE_CONTRACTS.filter(contract => contract.id === id)
  if (found.length > 1) throw new Error(`平台事件合同 ${id} 存在重复登记`)
  const contract = found[0]
  if (!contract) throw new Error(`平台事件合同 ${id} 未登记或已退役`)
  return contract
}

/** 事件编码是否属于平台注册事件；数据模型事件不能占用这些编码。 */
export function isPlatformEventCode(eventCode: string): boolean {
  return DIMENSION_SOURCE_CONTRACTS.some(contract => contract.eventCode === eventCode)
}
