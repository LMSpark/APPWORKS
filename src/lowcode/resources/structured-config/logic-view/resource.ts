/**
 * @module app:lowcode/resources/structured-config/logic-view/resource
 */
import type {DataSet} from '@spark-appworks/spark-data'
import {DATA_SPACE_DESIGN_FORM_KEY} from '@spark-appworks/spark-lowcode-api'
import {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {LowcodeDataSpaceAssembler} from '../../../data-space/lowcode-data-space-assembler'
import {lowcodeApi, lowcodeHttp} from '../../../lowcode-runtime'
import {loadStructuredConfigCatalog, readStructuredConfigScope} from '../catalog'
import {attachLogicViewDesignEdit} from './design-ops'

export class LowcodeLogicView {
  static readonly navigationScenarioId = 'EB720370EF06A5A656838F87E0716D6B'
  static readonly catalogMetaName = 'Base_DataViewList'
  static readonly parameterScenarioId = DATA_SPACE_DESIGN_FORM_KEY
  static readonly parameterModelName = '_Base_ParamList'

  /** 一次调用的目录/设计与参数复用一个PageRuntime；失败时释放已装配的另一来源。 */
  static async loadEditorWorkspace(input: Readonly<{scenarioId: string; viewId: string}>): Promise<readonly DataSet[]> {
    if (!input.scenarioId.trim() || !input.viewId.trim()) throw new Error('逻辑视图工作区缺少目标身份')
    const results = await Promise.allSettled([this.loadEditor(input.scenarioId, input.viewId), this.loadParameters(input.viewId)])
    const failure = results.find(result => result.status === 'rejected')
    if (failure?.status === 'rejected') {
      for (const result of results) if (result.status === 'fulfilled') result.value.destroy()
      throw failure.reason
    }
    return results.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])
  }

  /** 当前逻辑视图的正式参数；元数据空间身份由宿主封装，调用方只提供业务目标。 */
  static async loadParameters(viewId: string): Promise<DataSet> {
    const target = viewId.trim()
    if (!target) throw new Error('逻辑视图参数缺少目标ID')
    const {assertCurrent} = readStructuredConfigScope('逻辑视图参数'), scenarioId = this.parameterScenarioId, metaName = this.parameterModelName
    const request = {designScenarioId: DATA_SPACE_DESIGN_FORM_KEY, dataSpaceId: scenarioId, assertCurrent}
    const [space, model] = await Promise.all([lowcodeApi.dataSpace.design.readSpaceDefinition(request),
      lowcodeApi.dataSpace.design.readModel({...request, metaName})])
    assertCurrent()
    const config = new ScenarioViewConfig(scenarioId, JSON.stringify({scenarioId, tables: {[metaName]: {
      modelBinding: {modelId: model.id, modelName: model.metaName}, columns: [{name: 'pid', immutable: true},
        {name: 'parname', required: true, trim: 'normalize', unique: true}], views: {default: {
        autoLoad: false, autoCurrentFirst: false, autoSelectFirst: false, selectionDelimiter: '', commitMode: 'staged', lockCurrentWhilePending: true,
        valueField:'parname',labelField:'parname',
        queryContext: {viewId: target}, filterExpression: {field: 'pid', operator: 'eq', value: {Type: 'GetInputParam', ParamName: 'viewId'}},
        queryConfig: {allPages: true, fields: ['parid', 'pid', 'parname', 'pardesc', 'testvalue']},
      }},
    }}}))
    const dataSet = new LowcodeDataSpaceAssembler(lowcodeApi.dataSpace.runtime, lowcodeHttp).assemble({config, space, models: [model], relations: []}).dataSet
    try {
      const view = dataSet.getView(metaName)
      if (view?.primaryKey !== 'parid') throw new Error('逻辑视图参数正式主键不一致')
      view.validateQueryResult = result => {
        assertCurrent()
        if (view.queryContext['viewId'] !== target || result.rows.some(row => row['pid'] !== target
          || result.fieldAccess(result.rowKey(row), 'pid').read !== 'visible')) throw new Error('逻辑视图参数返回目标之外的记录')
      }
      await view.refresh(); assertCurrent()
      if (view.loadingError) throw view.loadingError
      return dataSet
    } catch (cause) {dataSet.destroy(); throw cause}
  }

  static async loadCatalog(scenarioId: string, targetId?: string): Promise<DataSet> {
    const {assertCurrent} = readStructuredConfigScope('逻辑视图')
    const dataSet = await loadStructuredConfigCatalog({
      scenarioId, assertCurrent,
      catalogMetaName: this.catalogMetaName,
      models: [
        {metaName: this.catalogMetaName, userLookup: true, sortExpression: [{field: 'rowid', direction: 'asc'}],
          ...(targetId ? {filterExpression: {field: 'rowid', operator: 'eq' as const, value: targetId}} : {})},
        {metaName: 'Base_UserInfo', fields: ['ID', 'ROWID', 'UserName']},
        {metaName: 'Base_AppSystemList', fields: ['rowid', 'AppDesc', 'AppName']},
      ],
    })
    try {
    const catalog = dataSet.getView(this.catalogMetaName, 'default'), apps = dataSet.getView('Base_AppSystemList', 'default')
    const table = dataSet.getTable(this.catalogMetaName)
    if (!catalog || !apps || !table) throw new Error('逻辑视图目录缺少正式视图')
    catalog.commitMode = 'staged'; catalog.lockCurrentWhilePending = true
    table.updateColumn('name', {required: true, immutable: true, trim: 'normalize'})
    table.updateColumn('sysid', {required: true, immutable: true})
    apps.valueField = 'rowid'; apps.labelField = 'AppDesc'
    if (targetId) {
      const row = catalog.rows[0]
      if (catalog.rows.length !== 1 || !row || catalog.getPkKey(row) !== targetId) throw new Error('逻辑视图目录目标不存在或不唯一')
      catalog.setCurrentRow(row)
    }
    return dataSet
    } catch (error) {dataSet.destroy(); throw error}
  }

  static async loadEditor(scenarioId: string, viewId?: string): Promise<DataSet> {
    const {assertCurrent} = readStructuredConfigScope('逻辑视图')
    const dataSet = await this.loadCatalog(scenarioId, viewId)
    try {
      attachLogicViewDesignEdit({dataSet, http: lowcodeHttp, guard: assertCurrent, readScope: () => lowcodeApi.readRequestScope()})
      return dataSet
    } catch (cause) {dataSet.destroy(); throw cause}
  }
}
