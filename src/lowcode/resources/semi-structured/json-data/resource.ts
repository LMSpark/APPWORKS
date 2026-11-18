/**
 * @module app:lowcode/resources/semi-structured/json-data/resource
 * 职责：装配正式JSON目录并从其真实记录打开文档资源视图。
 * 边界：页面只消费同一DataSet，文件传输及定位留在数据层。
 */
import type {DataSet,DataView} from '@spark-appworks/spark-data'
import {APPLICATION_CATALOG_PROJECT_ID} from '@/services/application-scope'
import {lowcodeApi} from '../../../lowcode-runtime'
import {loadLowcodeRuntimeScenario} from '../../../data-space/lowcode-data-space-runtime'
import {openJsonDocumentView} from './document-resource'
export class LowcodeJsonData{
 static readonly navigationScenarioId='FFDEF2AED3E19A38C0FCDDC748CF939B'
 static readonly catalogMetaName='Base_JsonData'
 static async loadCatalog(scenarioId:string,expectedProjectId?:string):Promise<DataSet>{
  if(scenarioId!==this.navigationScenarioId)throw new Error('JSON目录场景身份不匹配')
  const projectId=expectedProjectId===APPLICATION_CATALOG_PROJECT_ID
   ? APPLICATION_CATALOG_PROJECT_ID : lowcodeApi.readRequestScope().headers['X-AppId']
  if(!projectId)throw new Error('请先选择执行应用')
  if(expectedProjectId!==undefined&&expectedProjectId!==projectId)throw new Error('JSON目录导航与当前执行应用不一致')
  return loadLowcodeRuntimeScenario({projectId,scenarioId})
 }
 static openDocument(dataSet:DataSet,jsonId:string,options:Readonly<{create?:boolean}>={}):DataView{
  const catalog=dataSet.getView(this.catalogMetaName);if(!catalog)throw new Error('JSON正式目录视图缺失')
  return openJsonDocumentView({dataSet,catalog,jsonId,...options})
 }
}
