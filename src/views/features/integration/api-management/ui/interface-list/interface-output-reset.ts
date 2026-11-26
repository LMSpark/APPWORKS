/**
 * @module app:views/features/integration/api-management/ui/interface-list/interface-output-reset
 * 职责：基于当前接口的输出查询和调用回执重建输出草稿。
 * 边界：沿现有接口命令和原输出 DataView 暂存，保存与跨空间引用仍由原模型负责。
 * AI用途：处理重新设置输出时，先核当前接口的完整结果，再检查公共参数引用和本次可写范围。
 */
import type {DataView} from '@spark-appworks/spark-data'
import {apiAnd, apiEqual, readApiDefinitionRows} from '@/platform-adapters/resources/integration/api-management/queries'
import {invokeApi, outputFieldsOf, type InterfaceCallViews} from './interface-list-workspace'

/** 当前接口命令、输出视图及原页面实例校验。 */
type InterfaceOutputResetInput = InterfaceCallViews & Readonly<{
  /** 当前已读完整的原输出定义视图，与命令及接口视图属于同一运行空间。 */
  outputs: DataView
  /** 原宿主切换或释放时拒绝迟到的样本和引用。 */
  assertCurrent(): void
}>

const outputFields = ['tblid', 'enname', 'DataType'] as const
const addedFields = {tblname: 'api_output_info', IsPKey: 0, Memo: ''} as const

/** 只在已证明的原接口上按命令回执暂存输出差异。 */
export async function resetInterfaceOutputs(input: InterfaceOutputResetInput): Promise<void> {
  const {interfaces, outputs, calls} = input
  const source = interfaces.currentRow, dataSet = interfaces.dataSet
  const interfaceId = source && interfaces.getPkKey(source)
  if (!source || typeof interfaceId !== 'string' || !interfaceId || !dataSet || outputs.dataSet !== dataSet
    || calls.dataSet !== dataSet || outputs.commitMode !== 'staged') throw Error('缺少当前接口的输出定义')
  const assertInterface = interfaces.captureReadRow(source, ['ProviderID'])
  const providerId = source['ProviderID']
  if (typeof providerId !== 'string' || !providerId.trim()) throw Error('接口缺少正式提供商')

  const assertClean = () => {
    if (outputs.mutating || outputs.hasUnconfirmedSave || outputs.hasEditingChanges() || outputs.dirtyTracking.hasPendingChanges()) {
      throw Error('请先保存或取消输出内容的修改')
    }
  }
  assertClean()
  let assertOutputRead: () => void
  try {assertOutputRead = outputs.captureReadResult()}
  catch (cause) {throw Error('请先完整读取当前接口的输出定义', {cause})}
  const assertTarget = () => {
    input.assertCurrent()
    if (interfaces.currentRow !== source) throw Error('当前接口已切换，未重新设置输出')
    assertInterface()
    assertOutputRead()
    const cascades = dataSet.getParentCascades(outputs.tableName, outputs.viewId)
    const [cascade] = cascades
    const filter = cascades.length === 1 && cascade?.parentTable === interfaces.tableName
      && cascade.parentViewId === interfaces.viewId ? dataSet.resolveCascadeFilter(cascade) : null
    if (!filter || 'logic' in filter || filter.field !== 'tblid' || filter.operator !== 'in'
      || !Array.isArray(filter.value) || filter.value.length !== 1 || filter.value[0] !== interfaceId) {
      throw Error('输出定义查询不属于当前接口')
    }
  }
  assertTarget()
  if (outputs.queryConfig.allPages !== true || outputs.resultKind !== 'entity' || outputs.countReported !== true
    || outputs.rows.length !== outputs.total || outputs.scopeFilter || outputs.filterExpression || outputs.refreshPending) {
    throw Error('请先完整读取当前接口的输出定义')
  }

  const originals = new Map<string, {row: typeof outputs.rows[number]; id: string | number; assertRead: () => void}>()
  for (const row of outputs.rows) {
    if (outputFields.some(field => outputs.fieldAccess(row, field).read !== 'visible' || !Object.hasOwn(row, field))) {
      throw Error('输出定义字段不可读')
    }
    const name = row['enname'], type = row['DataType'], id = outputs.getPkKey(row)
    if (row['tblid'] !== interfaceId || typeof name !== 'string' || !name.trim() || typeof type !== 'string'
      || !type.trim() || id === undefined || originals.has(name)) {
      throw Error('输出定义归属或身份不明确')
    }
    originals.set(name, {row, id, assertRead: outputs.captureReadRow(row, outputFields)})
  }
  const check = () => {
    assertTarget()
    assertClean()
    if (outputs.refreshPending) throw Error('输出定义等待刷新，请重新读取')
    for (const item of originals.values()) item.assertRead()
  }
  const fields = outputFieldsOf(await invokeApi({calls, interfaces}))
  check()
  const types = new Map(fields.map(field => [field.enname, field.DataType]))
  const changed = [...originals].flatMap(([name, item]) => {
    const type = types.get(name)
    return type !== undefined && item.row['DataType'] !== type ? [{...item, type}] : []
  })
  const removed = [...originals].filter(([name]) => !types.has(name))
  const added = fields.filter(field => !originals.has(field.enname))
  if (added.length && (outputs.addActionState() !== 'enabled'
    || [...Object.keys(addedFields), 'enname', 'DataType'].some(field => outputs.newRowFieldAccess(field).write !== 'allowed'))) {
    throw Error('当前查询不允许新增输出字段')
  }
  if (removed.some(([, item]) => outputs.deleteActionState(item.row) !== 'enabled')) throw Error('当前查询不允许删除部分输出字段')
  if (changed.some(item => outputs.fieldAccess(item.row, 'DataType').write !== 'allowed')) throw Error('当前查询不允许修改部分输出类型')

  const affected = [...originals].filter(([name, item]) => types.get(name) !== item.row['DataType']).map(([name]) => name)
  if (affected.length) {
    const references = await readApiDefinitionRows({dataSet, modelName: 'Base_Interface_PublicParam',
      fields: ['providerId', 'interfaceId', 'outputfield'],
      filter: apiAnd(apiEqual('providerId', providerId), apiEqual('interfaceId', interfaceId)), check,
    })
    if (references.some(row => row['providerId'] !== providerId || row['interfaceId'] !== interfaceId)) {
      throw Error('公共参数查询超出当前接口')
    }
    if (references.some(row => typeof row['outputfield'] !== 'string' || !row['outputfield'].trim())) {
      throw Error('公共参数缺少正式输出字段')
    }
    const bound = affected.filter(name => references.some(row => row['outputfield'] === name))
    if (bound.length) throw Error(`输出字段 ${bound.join('、')} 已设置公共参数，请先解除绑定再重新设置输出`)
  }
  check()
  for (const item of changed) outputs.updateEditingValue(item.id, 'DataType', item.type)
  for (const [, item] of removed) {
    assertTarget()
    await outputs.removeRow(item.id)
  }
  for (const field of added) {
    assertTarget()
    await outputs.addRow({...addedFields, ...field})
  }
  assertTarget()
}
