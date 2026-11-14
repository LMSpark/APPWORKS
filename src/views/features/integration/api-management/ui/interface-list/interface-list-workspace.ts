/**
 * @module app:views/features/integration/api-management/ui/interface-list/interface-list-workspace
 * 职责：接口列表工作区的场景视图键、子面板共享上下文，以及原页“路径参数随地址同步”“按调用结果生成输出字段”的业务推导。
 * 边界：只做值推导，写入仍由页面经DataView编辑覆盖和staged保存提交；不发送请求、不持有第二份草稿。
 */
import {buildDataViewKey, type DataView} from '@spark-appworks/spark-data'

export const INTERFACE_SCENARIO_ID = 'EC84BD89BDBDF46B1FE5132DD53836E5'
export const interfaceViewKey = (table: string, view = 'default') => buildDataViewKey(table, view, INTERFACE_SCENARIO_ID)
export const INTERFACE_KEYS = {
  interfaces: interfaceViewKey('Base_DataServiceInterface'),
  parameters: interfaceViewKey('_Base_ParamList'),
  references: interfaceViewKey('_Base_ParamList', 'references'),
  headers: interfaceViewKey('Base_InterfaceApi_Headers'),
  outputs: interfaceViewKey('Base_TblField'),
  publicParameters: interfaceViewKey('Base_Interface_PublicParam'),
  bindings: interfaceViewKey('Base_Interface_PublicParam', 'outputBinding'),
  calls: interfaceViewKey('InterfaceCallRequest'),
  paramTypes: interfaceViewKey('ParamType'),
} as const

/** 子面板共享的页面状态：locked为忙碌或待核验，revision驱动按DataView事件重算，run串行执行并展示失败。 */
export type InterfaceWorkspace = Readonly<{
  locked: boolean
  revision: number
  run: (task: () => unknown) => Promise<void>
}>

const PATH_PARAMETER = /\{([^{}]+)\}/g

/** 按地址中的 {参数名} 顺序重建路径参数对象，同名参数保留原值函数；地址无参数时为空文本。 */
export function syncPathParameters(linkUrl: string, pathStr: string): string {
  let existing: Record<string, unknown> = {}
  if (pathStr.trim()) {
    const parsed: unknown = JSON.parse(pathStr)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('原路径参数不是JSON对象，未按请求地址同步')
    existing = Object.fromEntries(Object.entries(parsed))
  }
  const names = [...new Set([...linkUrl.matchAll(PATH_PARAMETER)].map(match => (match[1] ?? '').trim()).filter(Boolean))]
  return names.length ? JSON.stringify(Object.fromEntries(names.map(name => [name, existing[name] ?? '']))) : ''
}

/** 结果字段类型须落在“参数类型”字典内：整数int、非整数double、空值按string。 */
function outputType(value: unknown): string {
  if (typeof value === 'boolean') return 'bool'
  if (typeof value === 'number') return Number.isInteger(value) ? 'int' : 'double'
  if (Array.isArray(value)) return 'array'
  if (value !== null && typeof value === 'object') return 'object'
  return 'string'
}

export type InterfaceCallViews = Readonly<{calls: DataView; interfaces: DataView}>
const unconfirmed = (view: DataView) => view.hasUnconfirmedSave

/** 经调用命令资源对当前接口发起一次真实调用；明确失败时移除本次命令行，结果未知时保留待放弃，从不重新发送。 */
export async function invokeApi(input: InterfaceCallViews): Promise<string> {
  const {calls, interfaces} = input
  if (calls.hasUnconfirmedSave) throw new Error('上次调用结果未知，请先放弃该结果再重新调用')
  const row = interfaces.currentRow, interfaceId = row ? interfaces.getPkKey(row) : undefined
  if (!row || interfaceId === undefined) throw new Error('请先选择接口')
  const resultFilter = String(interfaces.getEditingRow(interfaceId)?.['resultPath'] ?? '').trim() || '$'
  const added = await calls.addRow({interfaceId, resultFilter}), id = calls.getPkKey(added)
  if (id === undefined) throw new Error('调用命令缺少原生身份')
  calls.setCurrentRow(added)
  const saved = await calls.dataSet?.saveChanges({views: [{tableName: calls.tableName, viewId: calls.viewId, ids: [id]}]})
  if (!saved) throw new Error('调用命令缺少所属数据空间')
  if (!saved.success) {
    if (!unconfirmed(calls) && calls.dirtyTracking.isPendingCreate(id)) await calls.removeRow(id)
    throw new Error(saved.error?.message ?? saved.message ?? '接口调用失败')
  }
  return String(calls.rows.find(item => calls.getPkKey(item) === id)?.['result'] ?? '')
}

/** 明确放弃结果未知的调用；不撤销服务端可能已执行的调用。 */
export function abandonInterfaceCall(calls: DataView): void {
  if (!calls.abandonUnconfirmedSave()) throw new Error('调用结果仍待核验，无法放弃')
  calls.discardPendingChanges()
}

export type InterfaceOutputField = Readonly<{enname: string; DataType: string}>

/** 调用结果须为JSON对象；每个成员生成一个输出字段。 */
export function outputFieldsOf(result: string): readonly InterfaceOutputField[] {
  let parsed: unknown = result
  try {parsed = JSON.parse(result)} catch {parsed = result}
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('调用结果不是对象，无法生成输出字段')
  return Object.entries(parsed).map(([enname, value]) => ({enname, DataType: outputType(value)}))
}
