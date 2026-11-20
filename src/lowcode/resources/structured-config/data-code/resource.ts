/**
 * @module app:lowcode/resources/structured-config/data-code/resource
 */
import type {DataSet} from '@spark-appworks/spark-data'
import {CodeInitializationClient,CodeExampleClient} from '@spark-appworks/spark-lowcode-api'
import {lowcodeApi,lowcodeHttp} from '../../../lowcode-runtime'
import {loadLowcodeRuntimeScenario} from '../../../data-space/lowcode-data-space-runtime'
import {CodeInitializationWorkspace} from './initialization-workspace'
import {CodeExampleWorkspace} from './example-workspace'

const initializationWorkspaces=new WeakMap<DataSet,CodeInitializationWorkspace>()
const exampleWorkspaces=new WeakMap<DataSet,CodeExampleWorkspace>()

export class LowcodeDataCode {
  static readonly navigationScenarioId = 'A133D679691178F192D7E9DA06829506'
  static readonly catalogMetaName = 'Base_CodeDesign'
  static readonly designScenarioId = '868E62F90DB8118C74CDC9F6BCA61157'
  static readonly referenceScenarioId = '34BDBE645F461A3D83282A941D6037F4'

  /** 同一实例复用只读示例资源；生成值回写原主视图草稿，不保存定义。 */
  static example(dataSet:DataSet):CodeExampleWorkspace {
    if(dataSet.destroyed||dataSet.scenarioId!==this.designScenarioId)throw new Error('编码示例运行空间不匹配')
    const existing=exampleWorkspaces.get(dataSet);if(existing)return existing
    const workspace=new CodeExampleWorkspace({dataSet,client:new CodeExampleClient(lowcodeHttp,
      {scenarioId:this.designScenarioId,readScope:()=>lowcodeApi.readRequestScope()})})
    exampleWorkspaces.set(dataSet,workspace);return workspace
  }

  /** 同一运行DataSet仅有一个初始化owner；弹窗重开不重复创建或改绑视图。 */
  static initialization(dataSet:DataSet):CodeInitializationWorkspace {
    if(dataSet.destroyed||dataSet.scenarioId!==this.designScenarioId)throw new Error('编码初始化运行空间不匹配')
    const existing=initializationWorkspaces.get(dataSet);if(existing)return existing
    const workspace=new CodeInitializationWorkspace({dataSet,runtime:lowcodeApi.dataSpace.runtime,
      client:new CodeInitializationClient(lowcodeHttp,{scenarioId:this.designScenarioId,readScope:()=>lowcodeApi.readRequestScope()})})
    initializationWorkspaces.set(dataSet,workspace);return workspace
  }

  /** 按本次执行应用装配原生引用表来源；由同一PageRuntime按需持有，不切换应用或保存数据。 */
  static async loadReferenceSources(): Promise<DataSet> {
    const projectId = lowcodeApi.readRequestScope().headers['X-AppId']
    if (!projectId) throw new Error('请先选择执行应用')
    return loadLowcodeRuntimeScenario({projectId, scenarioId: this.referenceScenarioId})
  }

  static async loadCatalog(scenarioId: string): Promise<DataSet> {
    if (scenarioId !== this.navigationScenarioId) throw new Error('编码目录场景身份不匹配')
    const projectId = lowcodeApi.readRequestScope().headers['X-AppId']
    if (!projectId) throw new Error('请先选择执行应用')
    return loadLowcodeRuntimeScenario({projectId, scenarioId})
  }

  static async loadEditor(scenarioId: string): Promise<DataSet> {
    if (scenarioId !== this.designScenarioId) throw new Error('编码设计场景身份不匹配')
    const projectId = lowcodeApi.readRequestScope().headers['X-AppId']
    if (!projectId) throw new Error('请先选择执行应用')
    return loadLowcodeRuntimeScenario({projectId, scenarioId})
  }
}
