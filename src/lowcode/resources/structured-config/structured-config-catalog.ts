/**
 * @module app:lowcode/resources/structured-config/structured-config-catalog
 * 职责：structured-config 专题目录页共用的 DataSet 装配（AppId 级联 + 选项模型刷新）。
 */
import {buildDataViewKey, type DataSet} from '@spark-appworks/spark-data'
import {DATA_SPACE_DESIGN_FORM_KEY, type DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {lowcodeApi, lowcodeHttp} from '../../lowcode-runtime'
import {LowcodeDataSpaceAssembler} from '../../data-space/lowcode-data-space-assembler'

export type StructuredCatalogModelOptions = Readonly<{
  metaName: string
  sortExpression?: ReadonlyArray<{field: string; direction: 'asc' | 'desc'}>
  userLookup?: boolean
  treeSelect?: boolean
}>

export type LoadStructuredCatalogInput = Readonly<{
  scenarioId: string
  catalogMetaName: string
  models: readonly StructuredCatalogModelOptions[]
  assertCurrent: () => void
}>

export async function loadStructuredConfigCatalog(input: LoadStructuredCatalogInput): Promise<DataSet> {
  const designInput = {designScenarioId: DATA_SPACE_DESIGN_FORM_KEY, dataSpaceId: input.scenarioId, assertCurrent: input.assertCurrent}
  const metaNames = [...new Set(input.models.map(model => model.metaName))]
  const [space, ...formalModels] = await Promise.all([
    lowcodeApi.dataSpace.design.readSpaceDefinition(designInput),
    ...metaNames.map(metaName => lowcodeApi.dataSpace.design.readModel({...designInput, metaName})),
  ])
  input.assertCurrent()
  const catalogSpec = input.models.find(model => model.metaName === input.catalogMetaName)
  if (!catalogSpec) throw new Error('目录模型未在 models 中声明')
  const config = new ScenarioViewConfig(input.scenarioId, JSON.stringify({
    scenarioId: input.scenarioId,
    tables: Object.fromEntries(input.models.map(spec => {
      const model = formalModels.find(item => item.metaName === spec.metaName)
      if (!model) throw new Error(`正式模型缺失: ${spec.metaName}`)
      const isCatalog = spec.metaName === input.catalogMetaName
      return [spec.metaName, {modelBinding: {modelId: model.id, modelName: spec.metaName}, views: {default: {
        autoLoad: false, autoCurrentFirst: false, autoSelectFirst: false,
        ...(isCatalog && spec.userLookup ? {
          queryConfig: {filterLookups: [{field: 'createuser', sourceViewKey: buildDataViewKey('Base_UserInfo', 'default', input.scenarioId),
            matchField: 'UserName', valueField: 'ROWID'}]},
        } : {queryConfig: {allPages: true}}),
        sortExpression: spec.sortExpression ?? [{field: model.primaryKey, direction: 'asc'}],
        ...(spec.metaName === 'Base_UserInfo' ? {valueField: 'ROWID', labelField: 'UserName'} : {}),
        ...(spec.treeSelect ? {valueField: 'rowid', labelField: 'Name', treeConfig: {idField: 'rowid', parentIdField: 'Mrowid',
          rootParentValue: '000000', textField: 'Name', lazy: false}} : {}),
      }}}]
    })),
    resourceRelations: [],
    viewCascades: [],
  }))
  const {dataSet} = new LowcodeDataSpaceAssembler(lowcodeApi.dataSpace.runtime, lowcodeHttp).assemble({config, space, models: formalModels, relations: []})
  try {
    const results = await Promise.allSettled(formalModels.map(async model => {
      const target = dataSet.getView(model.metaName, 'default')
      if (!target) throw new Error(`目录视图缺失: ${model.metaName}`)
      await target.refresh()
      if (target.loadingError) throw target.loadingError
    }))
    input.assertCurrent()
    for (const result of results) if (result.status === 'rejected') throw result.reason
    return dataSet
  } catch (error) {dataSet.destroy(); throw error}
}

export function readStructuredConfigScope(errorLabel: string): Readonly<{assertCurrent: () => void}> {
  const scope = lowcodeApi.readRequestScope()
  const applicationId = scope.headers['X-AppId']
  if (!applicationId) throw new Error('请先选择应用')
  return {assertCurrent: () => {
    if (lowcodeApi.readRequestScope().token !== scope.token) throw new Error(`${errorLabel}请求所属应用或登录身份已变化`)
  }}
}

export type FormalModel = Awaited<ReturnType<DataSpaceDesignApi['readModel']>>
