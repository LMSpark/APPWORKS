import type {DataRow, DataView} from '@spark-appworks/spark-data'

export type NavHostProjectBinding = Readonly<{
  scenarioId: string
  modelName: string
  valueField: string
  labelField: string
  parentField?: string
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
  if (!scenarioId || !modelName || outputParameter !== 'projectId' || !valueField || !labelField
    || /[@\s]/.test(scenarioId + modelName + valueField + labelField + parentField)) throw new Error('导航宿主项目绑定合同不完整')
  return {scenarioId, modelName, valueField, labelField, ...(parentField ? {parentField} : {})}
}

export type NavHostProjectCandidateFields = Readonly<{valueField: string; labelField: string; parentField?: string}>

function assertProjectHierarchy(view: DataView, fields: NavHostProjectCandidateFields): void {
  const {valueField, labelField, parentField} = fields
  if (!parentField) return
  const values = new Map<string, DataRow>()
  for (const row of view.rows) {
    if (view.fieldAccess(row, valueField).read !== 'visible' || view.fieldAccess(row, labelField).read !== 'visible') {
      throw new Error('导航项目候选值或文案字段不可读')
    }
    if (view.fieldAccess(row, parentField).read !== 'visible') throw new Error('导航项目候选父级字段不可读')
    const value = row[valueField]
    if (typeof value !== 'string' || !value.trim() || value !== value.trim() || values.has(value)) throw new Error('导航项目候选值无效或重复')
    values.set(value, row)
  }
  const parents = new Map<string, string>()
  for (const [value, row] of values) {
    const rawParent = row[parentField]
    if (rawParent !== null && rawParent !== undefined && (typeof rawParent !== 'string' || rawParent !== rawParent.trim())) {
      throw new Error('导航项目层级父值格式无效')
    }
    const parent = rawParent ?? ''
    if (!parent) continue
    if (parent === value) throw new Error('导航项目层级存在自引用')
    if (!values.has(parent)) throw new Error('导航项目层级父项不存在')
    parents.set(value, parent)
  }
  for (const value of values.keys()) {
    const visited = new Set<string>()
    let current: string | undefined = value
    while (current !== undefined) {
      if (visited.has(current)) throw new Error('导航项目层级存在循环引用')
      visited.add(current)
      current = parents.get(current)
    }
  }
}

/** Apply the host's selectPid mapping to the candidate DataView's native tree projection. */
export function configureProjectHierarchy(view: DataView, fields: NavHostProjectCandidateFields): void {
  if (!fields.parentField) return
  // Keep server query mode flat; RendererTree builds the nested presentation locally from these fields.
  view.setTreeConfig({idField: fields.valueField, parentIdField: fields.parentField, textField: fields.labelField, treeMode: 'flat'})
}

export function validateProjectHierarchy(view: DataView, fields: NavHostProjectCandidateFields): void {
  assertProjectHierarchy(view, fields)
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
