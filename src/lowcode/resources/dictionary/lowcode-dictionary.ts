/**
 * @module app:lowcode/resources/dictionary/lowcode-dictionary
 * 职责：字典专题系统页的正式DataSet装配入口。
 * 边界：保留数据库模型真源，视图来自应用内场景配置；读写由原runtime owner执行。
 * AI用途：原路径列表绑定导航场景，设置/条目共用已有字典数据编辑场景。
 */
import {buildDataViewKey, DataViewFilter, type DataSet} from '@spark-appworks/spark-data'
import {DATA_SPACE_DESIGN_FORM_KEY} from '@spark-appworks/spark-lowcode-api'
import {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {lowcodeApi, lowcodeHttp} from '../../lowcode-runtime'
import {LowcodeDataSpaceAssembler} from '../../data-space/lowcode-data-space-assembler'
import {loadScenarioDataSet} from '../../data-space/lowcode-data-space-runtime'
import editorConfig from '../../../../config/pages/data-platform/data-dictionary/pagedata.json'

/** 组合根负责scope，页面和专题对象不接触请求凭据。 */
export class LowcodeDictionary {
  /** 设置与条目已有正式空间的身份，来自已核对的场景配置。 */
  static readonly editorScenarioId = editorConfig.scenarioId

  /** 按导航正式场景装配目录视图；不以另一导航或首个同名模型替代。 */
  static async loadCatalog(scenarioId: string): Promise<DataSet> {
    const {applicationId, assertCurrent} = this.scope()
    const input = {designScenarioId: DATA_SPACE_DESIGN_FORM_KEY, dataSpaceId: scenarioId, assertCurrent}
    const [space, ...models] = await Promise.all([
      lowcodeApi.dataSpace.design.readSpaceDefinition(input),
      ...['_Base_DictType', 'Base_StructureType', 'Base_UserInfo'].map(metaName => lowcodeApi.dataSpace.design.readModel({...input, metaName})),
    ])
    assertCurrent()
    const config = new ScenarioViewConfig(scenarioId, JSON.stringify({scenarioId, tables: Object.fromEntries(models.map(model => [
      model.metaName, {modelBinding: {modelId: model.id, modelName: model.metaName}, views: {default: {
        autoLoad: false, autoCurrentFirst: false, autoSelectFirst: false,
        ...(model.metaName === '_Base_DictType' ? {
          queryConfig: {filterLookups: [{field: 'createuser', sourceViewKey: buildDataViewKey('Base_UserInfo', 'default', scenarioId),
            matchField: 'UserName', valueField: 'ROWID'}]},
          sortExpression: [{field: 'crttime', direction: 'desc'}, {field: 'rowid', direction: 'asc'}],
        } : {
          queryConfig: {allPages: true}, sortExpression: [{field: model.primaryKey, direction: 'asc'}],
          ...(model.metaName === 'Base_UserInfo' ? {valueField: 'ROWID', labelField: 'UserName'} : {
            valueField: 'rowid', labelField: 'Name', treeConfig: {idField: 'rowid', parentIdField: 'Mrowid', rootParentValue: '000000', textField: 'Name', lazy: false},
          }),
        }),
      }}},
    ])), resourceRelations: [], viewCascades: []}))
    const {dataSet} = new LowcodeDataSpaceAssembler(lowcodeApi.dataSpace.runtime, lowcodeHttp).assemble({config, space, models, relations: []})
    try {
      // 本次调用的本地输入，不冒充后端模型；常驻范围与用户可清除的筛选独立。
      const scopeTable = dataSet.addTable('DictionaryCatalogInput', [{name: 'AppId', type: 'string', isPrimaryKey: true}])
      scopeTable.resourceType = 'static-data'
      scopeTable.addRows([{AppId: applicationId}])
      const scopeView = scopeTable.getView('default')
      if (!scopeView) throw new Error('字典目录输入视图缺失')
      scopeView.setCurrentRowById(applicationId)
      dataSet.addCascade({parentTable: 'DictionaryCatalogInput', parentViewId: 'default', childTable: '_Base_DictType', childViewId: 'default',
        filterBindings: [{sourceField: 'AppId', targetField: 'AppId'}], autoLoad: false})
      const view = dataSet.getView('_Base_DictType', 'default')
      if (!view) throw new Error('字典目录视图缺失')
      const results = await Promise.allSettled(models.map(async model => {
        const target = dataSet.getView(model.metaName, 'default')
        if (!target) throw new Error(`字典目录视图缺失: ${model.metaName}`)
        await target.refresh()
        if (target.loadingError) throw target.loadingError
      }))
      assertCurrent()
      for (const result of results) if (result.status === 'rejected') throw result.reason
      return dataSet
    } catch (error) {dataSet.destroy(); throw error}
  }

  /** 装配两个已注册元模型的定义/条目视图；目标字典由专题输入及过滤约束。 */
  static async loadEditor(): Promise<Readonly<{dataSet: DataSet; applicationId: string}>> {
    const {applicationId, assertCurrent} = this.scope()
    const {dataSet} = await loadScenarioDataSet({scenarioId: this.editorScenarioId,
      config: new ScenarioViewConfig(this.editorScenarioId, JSON.stringify(editorConfig)), assertCurrent})
    try {assertCurrent(); return {dataSet, applicationId}}
    catch (error) {dataSet.destroy(); throw error}
  }

  /** 读取完整字段标题定义；来源可跨应用共享，范围和权限由正式查询判定。调用方负责销毁返回的DataSet。 */
  static async loadDefinition(dictionaryId: string): Promise<DataSet> {
    if (!dictionaryId.trim()) throw new Error('字典来源身份不能为空')
    const {assertCurrent} = this.scope()
    const {dataSet} = await this.loadEditor()
    try {
      const view = dataSet.getView('_Base_DictType', 'default')
      if (!view) throw new Error('字典定义视图缺失')
      view.queryContext = {rowid: dictionaryId}
      view.filterExpression = DataViewFilter.condition({field: 'rowid', operator: 'eq', value: dictionaryId}).toJSON()
      const result = await view.loadFromServer()
      assertCurrent()
      if (!result.success) throw new Error(result.message ?? '字典定义读取失败')
      if (view.rows.length !== 1 || view.total !== 1) throw new Error('字典来源身份不存在或不唯一')
      return dataSet
    } catch (error) {dataSet.destroy(); throw error}
  }

  private static scope(): Readonly<{applicationId: string; assertCurrent: () => void}> {
    const scope = lowcodeApi.readRequestScope()
    const applicationId = scope.headers['X-AppId']
    if (!applicationId) throw new Error('请先选择应用')
    return {applicationId, assertCurrent: () => {
      if (lowcodeApi.readRequestScope().token !== scope.token) throw new Error('字典请求所属应用或登录身份已变化')
    }}
  }
}
