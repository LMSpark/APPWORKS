import type {DataRow, DataView} from '@spark-appworks/spark-data'

export type NavHostProjectBinding = Readonly<{
  scenarioId: string
  modelName: string
  valueField: string
  labelField: string
}>

const HOST_FIELDS = ['prowid', 'dataSetId', 'DataName', 'ValParamName', 'TextParamName', 'selectValParam', 'selectTextParam', 'selectPid'] as const

export function resolveNavHostProjectBinding(view: DataView, navigationId: string): NavHostProjectBinding {
  const rows = view.rows.filter(row => row['prowid'] === navigationId)
  if (!navigationId || rows.length !== 1) throw new Error('导航宿主关系缺失或歧义')
  const row = rows[0]
  if (!row) throw new Error('导航宿主关系缺失或歧义')
  if (HOST_FIELDS.some(field => view.fieldAccess(row, field).read !== 'visible')) throw new Error('导航宿主关系字段不可读')
  const key = view.getPkKey(row)
  if (view.fieldAccess(row, view.primaryKey).read !== 'visible') throw new Error('导航宿主关系行身份不可读')
  if (key === undefined || view.rows.filter(item => view.getPkKey(item) === key).length !== 1) throw new Error('导航宿主关系行身份缺失或重复')
  const scenarioId = String(row['dataSetId'] ?? '').trim()
  const modelName = String(row['DataName'] ?? '').trim()
  const outputParameter = String(row['ValParamName'] ?? '').trim()
  const valueField = String(row['selectValParam'] ?? '').trim()
  const labelField = String(row['selectTextParam'] ?? '').trim()
  const parentField = String(row['selectPid'] ?? '').trim()
  if (parentField) throw new Error('当前 DevSystem 项目切换仅支持平面 NavHost 候选；selectPid 层级配置暂不支持')
  if (!scenarioId || !modelName || outputParameter !== 'projectId' || !valueField || !labelField
    || /[@\s]/.test(scenarioId + modelName + valueField + labelField)) throw new Error('导航宿主项目绑定合同不完整')
  return {scenarioId, modelName, valueField, labelField}
}

export function resolveProjectCandidate(view: DataView, clickedRow: DataRow, fields: Readonly<{valueField: string; labelField: string}>): string {
  const id = view.getPkKey(clickedRow)
  if (id === undefined) throw new Error('导航项目候选已失效')
  const matches = view.rows.filter(row => view.getPkKey(row) === id)
  if (matches.length !== 1) throw new Error('导航项目候选已失效')
  const canonical = matches[0]
  if (!canonical) throw new Error('导航项目候选已失效')
  if (view.fieldAccess(canonical, view.primaryKey).read !== 'visible') throw new Error('导航项目候选身份字段不可读')
  if (view.fieldAccess(canonical, fields.valueField).read !== 'visible' || view.fieldAccess(canonical, fields.labelField).read !== 'visible') {
    throw new Error('导航项目候选值或文案字段不可读')
  }
  const value = canonical[fields.valueField]
  if (typeof value !== 'string' || !value.trim()) throw new Error('导航项目候选值无效')
  if (view.rows.filter(row => row[fields.valueField] === value).length !== 1) throw new Error('导航项目候选值重复')
  return value.trim()
}
