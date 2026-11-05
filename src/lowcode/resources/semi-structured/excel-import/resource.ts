/**
 * @module app:lowcode/resources/semi-structured/excel-import/resource
 */
import type {DataSet} from '@spark-appworks/spark-data'
import {lowcodeApi} from '../../../lowcode-runtime'
import {loadLowcodeRuntimeScenario} from '../../../data-space/lowcode-data-space-runtime'
import {validateExcelTransformRule} from './transform/validation'
import {createExcelTransformReferences} from './transform/references'
import {createExcelSortReferences,validateExcelSort} from './transform/sort-fields'
import type {PageRuntime} from '@spark-appworks/spark-project-model'

export class LowcodeExcelImport {
  static readonly navigationScenarioId = '36B01771C627B9BF5CD493DC75B996A1'
  static readonly catalogMetaName = 'Base_Import_solution'
  static readonly designScenarioId = '0F93B82141CF40852021D704B0E30BF4'
  /** 原PageRuntime按需装配的正式表来源空间，不创建独立选择器数据链。 */
  static readonly referenceScenarioId = '34BDBE645F461A3D83282A941D6037F4'

  /** 按本次执行应用装配正式方案目录，身份不匹配时拒绝，不使用备用目录。 */
  static async loadCatalog(scenarioId: string): Promise<DataSet> {
    if (scenarioId !== this.navigationScenarioId) throw new Error('Excel目录场景身份不匹配')
    const projectId = lowcodeApi.readRequestScope().headers['X-AppId']
    if (!projectId) throw new Error('请先选择执行应用')
    return loadLowcodeRuntimeScenario({projectId, scenarioId})
  }

  /** 装配正式Excel配置场景；目标方案由本次PageRuntime输入统一限制。 */
  static async loadEditor(scenarioId: string, getPage?:()=>PageRuntime): Promise<DataSet> {
    if (scenarioId !== this.designScenarioId) throw new Error('Excel设计场景身份不匹配')
    const projectId = lowcodeApi.readRequestScope().headers['X-AppId']
    if (!projectId) throw new Error('请先选择执行应用')
    return this.bindEditorModelRules(await loadLowcodeRuntimeScenario({projectId, scenarioId}),getPage)
  }

  /** 在正式规则模型注册结构及异步引用约束，所有命名视图与直接DataSet保存复用；物理来源仅按原宿主需要加载。 */
  static bindEditorModelRules(dataSet: DataSet, getPage?:()=>PageRuntime): DataSet {
    const table = dataSet.getView('Base_Import_Transform_Rule')?.dataTable
    if (dataSet.scenarioId !== this.designScenarioId || table?.modelBinding?.modelName !== 'Base_Import_Transform_Rule'
      || table.modelBinding.modelId !== 'b3ca28c2-432c-4374-ac20-bb98a85c2098') throw new Error('Excel转换规则缺少正式模型身份')
    table.setQuerySaveRule({groups:[{fields: ['rule_type', 'source_field', 'target_field', 'sort_order', 'enabled', 'on_error', 'condition_json', 'config_json'], validate: validateExcelTransformRule,
      references:createExcelTransformReferences({dataSet,...(getPage===undefined?{}:{getPage})})}]})
    const nodes=dataSet.getView('Base_ImportData_Config')?.dataTable
    if(!nodes)throw Error('Excel排序缺少原节点模型')
    nodes.setQuerySaveRule({groups:[{fields:['sorted'],validate:validateExcelSort,
      references:createExcelSortReferences({dataSet,...(getPage===undefined?{}:{getPage})})}]})
    return dataSet
  }

  /** 目标表弹窗首次打开时复用正式来源配置及级联，不读取来源业务数据。 */
  static async loadReferenceSources(): Promise<DataSet> {
    const projectId = lowcodeApi.readRequestScope().headers['X-AppId']
    if (!projectId) throw new Error('请先选择执行应用')
    return loadLowcodeRuntimeScenario({projectId, scenarioId: this.referenceScenarioId})
  }
}
