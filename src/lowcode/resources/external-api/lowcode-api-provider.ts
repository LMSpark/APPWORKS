/**
 * @module app:lowcode/resources/external-api/lowcode-api-provider
 * 职责：按原导航场景装配服务商专题的正式DataSet。
 * 边界：正式模型从元数据空间读取，pagedata只声明视图；页面不接触HTTP或权限凭据。
 * AI用途：目录与基础定义视图共用模型，查询/保存仍由spark-data及正式runtime执行。
 */
import {DataViewFilter, type DataSet} from '@spark-appworks/spark-data'
import {DATA_SPACE_DESIGN_FORM_KEY} from '@spark-appworks/spark-lowcode-api'
import {ScenarioViewConfig} from '@spark-appworks/spark-project-model'
import {lowcodeApi, lowcodeHttp} from '../../lowcode-runtime'
import {LowcodeDataSpaceAssembler} from '../../data-space/lowcode-data-space-assembler'
import viewConfig from '../../../../config/pages/integration/api-management/pagedata.json'
import configViews from '../../../../config/pages/integration/api-config/pagedata.json'
import interfaceViews from '../../../../config/pages/integration/api-interface/pagedata.json'
import interfaceContext from '../../../../config/pages/integration/api-interface-context/pagedata.json'
import {LowcodeDictionary} from '../dictionary/lowcode-dictionary'

/** 服务商专题的组合根；调用方负责释放返回的运行空间。 */
export class LowcodeApiProvider {
  /** 参考原基础配置入口及已核正式模型共同确定的配置场景。 */
  static readonly configurationScenarioId = '446B5D94A71587E9BD4D325A4DF5F6F8'
  /** 参考接口管理入口的正式场景；与服务商配置空间分别定位。 */
  static readonly interfaceScenarioId = 'EC84BD89BDBDF46B1FE5132DD53836E5'
  /** 只装配接口方案、输入、头部、输出与字典，不包含调用测试值。 */
  static loadInterfaces(): Promise<DataSet> {return this.loadViews(this.interfaceScenarioId, interfaceViews)}
  /** 读取服务商及账号身份候选，投影不包含密码或令牌。 */
  static loadInterfaceContext(): Promise<DataSet> {return this.loadViews(this.configurationScenarioId, interfaceContext)}
  /** 装配方案设计空间，不查询账号或执行外部接口。 */
  static loadConfiguration(): Promise<DataSet> {return this.loadViews(this.configurationScenarioId, configViews)}
  /** 通过既有字典元空间读取原使用类型定义及条目，返回独立绑定空间，不复制候选数组。 */
  static async loadHeaderTypes(): Promise<DataSet> {
    const {dataSet} = await LowcodeDictionary.loadEditor()
    try {
      const definition = dataSet.getView('_Base_DictType'), entries = dataSet.getView('_Base_DictData')
      if (!definition || !entries) throw new Error('头部使用类型字典缺少定义或条目视图')
      definition.configure({filterExpression: DataViewFilter.condition({field: 'TypeName', operator: 'eq', value: '接口公共头部信息使用类型'}).toJSON()})
      await definition.refresh(); if (definition.loadingError) throw definition.loadingError
      const row = definition.rows[0]
      if (definition.rows.length !== 1 || !row || definition.fieldAccess(row, 'rowid').read !== 'visible'
        || definition.fieldAccess(row, 'TypeName').read !== 'visible' || row['TypeName'] !== '接口公共头部信息使用类型') throw new Error('头部使用类型字典不存在、不可读或名称不唯一')
      const id = row['rowid']
      if (typeof id !== 'string' || !id.trim()) throw new Error('头部使用类型字典缺少正式身份')
      entries.configure({queryContext: {rowid: id}, filterExpression: DataViewFilter.condition({field: 'typeid', operator: 'eq', value: id}).toJSON()})
      await entries.refresh(); if (entries.loadingError) throw entries.loadingError
      for (const item of entries.rows) if (item['typeid'] !== row['rowid'] || entries.fieldAccess(item, 'typeid').read !== 'visible') throw new Error('头部使用类型条目范围不一致')
      return dataSet
    } catch (error) {dataSet.destroy(); throw error}
  }
  /** 读取导航正式场景和模型后装配命名视图，不加载密码字段或替换正式模型身份。 */
  static async load(scenarioId: string): Promise<DataSet> {
    return this.loadViews(scenarioId, viewConfig)
  }

  private static async loadViews(scenarioId: string, profile: typeof viewConfig | typeof configViews | typeof interfaceViews | typeof interfaceContext): Promise<DataSet> {
    if (!scenarioId.trim() || scenarioId !== scenarioId.trim()) throw new Error('外部服务入口缺少有效数据空间ID')
    const scope = lowcodeApi.readRequestScope()
    const assertCurrent = (): void => {
      if (!scope.headers['X-AppId'] || lowcodeApi.readRequestScope().token !== scope.token) throw new Error('服务商请求所属应用或登录身份已变化')
    }
    assertCurrent()
    const input = {designScenarioId: DATA_SPACE_DESIGN_FORM_KEY, dataSpaceId: scenarioId, assertCurrent}
    const [space, models] = await Promise.all([
      lowcodeApi.dataSpace.design.readSpaceDefinition(input),
      lowcodeApi.dataSpace.design.readModelBatch({...input, metaNames: Object.keys(profile.tables)}),
    ])
    assertCurrent()
    const config = new ScenarioViewConfig(scenarioId, JSON.stringify({scenarioId,
      tables: Object.fromEntries(Object.entries(profile.tables).map(([name, definition]) => {
        const matches = models.filter(model => model.metaName === name)
        const model = matches[0]
        if (matches.length !== 1 || !model) throw new Error(`服务商正式模型缺失或不唯一: ${name}`)
        return [name, {...definition, modelBinding: {modelId: model.id, modelName: name}}]
      })), resourceRelations: [], viewCascades: 'viewCascades' in profile ? profile.viewCascades : []}))
    return new LowcodeDataSpaceAssembler(lowcodeApi.dataSpace.runtime, lowcodeHttp).assemble({config, space, models, relations: []}).dataSet
  }
}
