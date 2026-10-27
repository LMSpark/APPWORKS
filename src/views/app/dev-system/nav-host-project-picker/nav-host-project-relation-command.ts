import {RequestState, type DataRow, type DataView} from '@spark-appworks/spark-data'

/** Reference-compatible fields for one Base_Navigation_DataRelation row, without its generated rowid. */
export type NavHostProjectRelationConfig = Readonly<{
  prowid: string
  pName: string
  ValParamName: string
  TextParamName: string
  childrowid: string
  title: string
  location: string
  dataSetId: string
  DataName: string
  DbName: string
  selectValParam: string
  selectTextParam: string
  dataType: string
  selectPid: string
  paramType: string
}>

const RELATION_FIELDS = [
  'prowid', 'pName', 'ValParamName', 'TextParamName', 'childrowid', 'title', 'location', 'dataSetId',
  'DataName', 'DbName', 'selectValParam', 'selectTextParam', 'dataType', 'selectPid', 'paramType',
] as const satisfies ReadonlyArray<keyof NavHostProjectRelationConfig>

const REQUIRED_FIELDS = ['prowid', 'pName', 'ValParamName', 'TextParamName', 'title', 'dataSetId', 'DataName',
  'selectValParam', 'selectTextParam'] as const satisfies ReadonlyArray<keyof NavHostProjectRelationConfig>

function validateConfig(config: NavHostProjectRelationConfig): void {
  for (const field of REQUIRED_FIELDS) {
    const value = config[field]
    if (typeof value !== 'string' || value.trim() === '') throw new Error(`导航宿主关系配置缺少 ${field}`)
  }
  if (config.ValParamName.trim() !== 'projectId') throw new Error('导航宿主项目切换参数必须为 projectId')
  for (const field of ['dataSetId', 'DataName', 'selectValParam', 'selectTextParam', 'selectPid'] as const) {
    if (/[@\s]/u.test(config[field].trim())) throw new Error(`导航宿主关系配置 ${field} 格式无效`)
  }
}

function assertTargetView(view: DataView, metadataScenarioId: string): void {
  if (!metadataScenarioId.trim() || view.dataSet?.scenarioId !== metadataScenarioId) {
    throw new Error('导航宿主关系 DataView 数据空间身份不匹配')
  }
  if (view.dataTable?.modelBinding?.modelName !== 'Base_Navigation_DataRelation' || view.viewId !== 'default') {
    throw new Error('导航宿主关系 DataView 身份不匹配')
  }
  if (view.commitMode !== 'staged') throw new Error('导航宿主关系必须暂存到 DataSet 统一保存')
  if (view.requestState !== RequestState.Loaded || view.loadingError) throw new Error('导航宿主关系 DataView 尚未完成有效查询')
  if (view.rows.length !== view.total) throw new Error('导航宿主关系 DataView 查询结果不完整')
}

/**
 * Stage a single project-switch relation on its existing, fully loaded DataView.
 * This command never creates an owner, sends a request, or saves the DataSet.
 */
export async function configureNavHostProjectRelation(
  view: DataView,
  metadataScenarioId: string,
  config: NavHostProjectRelationConfig,
): Promise<DataRow> {
  validateConfig(config)
  assertTargetView(view, metadataScenarioId)

  const matches = view.rows.filter(row => row['prowid'] === config.prowid)
  if (matches.length > 1) throw new Error('导航宿主关系已存在多条')
  if (matches.length === 1) throw new Error('导航宿主关系已存在，拒绝重复新增')
  const values = Object.fromEntries(RELATION_FIELDS
    .filter(field => config[field] !== '')
    .map(field => [field, config[field]])) as Partial<DataRow>

  for (const field of Object.keys(values)) {
    if (view.newRowFieldAccess(field).write !== 'allowed') throw new Error(`导航宿主关系字段不可新增：${field}`)
  }
  const created = await view.addRow(values)
  if (!Object.hasOwn(created, 'rowid')) {
    throw new Error('导航宿主关系新增未返回正式行身份')
  }
  return created
}
