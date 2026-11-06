/**
 * @module app:lowcode/resources/structured-config/logic-view/resource
 * 职责：从正式场景配置装配目录、设计及按需元数据；目标仅为本次viewId。
 * 边界：查询在PageRuntime注入输入后执行，保存与未知结果由原DataView承担。
 */
import {RequestState,type DataSet} from '@spark-appworks/spark-data'
import {DATA_SPACE_DESIGN_FORM_KEY} from '@spark-appworks/spark-lowcode-api'
import type {PageRuntime,PageRuntimeOptions} from '@spark-appworks/spark-project-model'
import {lowcodeApi,lowcodeHttp} from '../../../lowcode-runtime'
import {loadLowcodeRuntimeScenario} from '../../../data-space/lowcode-data-space-runtime'
import {readStructuredConfigScope} from '../catalog'
import {attachLogicViewDesignEdit} from './design-ops'

export class LowcodeLogicView {
 static readonly navigationScenarioId='EB720370EF06A5A656838F87E0716D6B'
 static readonly catalogMetaName='Base_DataViewList'
 static readonly parameterScenarioId=DATA_SPACE_DESIGN_FORM_KEY
 static readonly parameterModelName='_Base_ParamList'
 /** 视图自身参数与接口来源参数共用模型，使用独立命名视图保留各自查询和编辑身份。 */
 static readonly parameterViewId='logicViewParameters'

 /** Loader只装配正式结构；业务查询须等待PageRuntime注入viewId。 */
 static async loadCatalog(scenarioId:string):Promise<DataSet>{
  if(scenarioId!==this.navigationScenarioId)throw Error('逻辑视图目录场景身份不匹配')
  const projectId=lowcodeApi.readRequestScope().headers['X-AppId'];if(!projectId)throw Error('请先选择执行应用')
  return loadLowcodeRuntimeScenario({projectId,scenarioId})
 }
 /** 仅接入原设计文件DataView；目标查询由输入注入后的prepareEditor执行。 */
 static async loadEditor(scenarioId:string):Promise<DataSet>{
  const {assertCurrent}=readStructuredConfigScope('逻辑视图'),dataSet=await this.loadCatalog(scenarioId)
  try{assertCurrent();attachLogicViewDesignEdit({dataSet,http:lowcodeHttp,guard:assertCurrent,readScope:()=>lowcodeApi.readRequestScope()});return dataSet}
  catch(cause){dataSet.destroy();throw cause}
 }
 /** 声明同一次工具调用的两个正式空间；元数据空间延后到实际显示参数或来源时装配。 */
 static editorRuntimeOptions(input:Readonly<{scenarioId:string;viewId:string}>):PageRuntimeOptions{
  const {scenarioId,viewId}=input
  if(scenarioId!==this.navigationScenarioId||!viewId.trim())throw Error('逻辑视图工作区目标无效')
  const {assertCurrent}=readStructuredConfigScope('逻辑视图工作区'),projectId=lowcodeApi.readRequestScope().headers['X-AppId']
  if(!projectId)throw Error('请先选择执行应用')
  return{scenarioIds:[scenarioId,this.parameterScenarioId],deferredScenarioIds:[this.parameterScenarioId],
   scenarioInputs:{[scenarioId]:{viewId},[this.parameterScenarioId]:{viewId}},loadScenario:async id=>{
    assertCurrent()
    if(id!==scenarioId&&id!==this.parameterScenarioId)throw Error('逻辑视图工作区未声明该空间')
    const dataSet=await (id===scenarioId?this.loadEditor(id):loadLowcodeRuntimeScenario({projectId,scenarioId:id}))
    try{assertCurrent();return dataSet}catch(cause){dataSet.destroy();throw cause}
   }}
 }
 /** 只查询本次正式编辑目标，不查询目录全集，不自动加载其它工作区。 */
 static async prepareEditor(page:PageRuntime):Promise<void>{
  const dataSet=page.getDataSet(this.navigationScenarioId),view=dataSet?.getView(this.catalogMetaName,'editorTarget'),target=page.call.scenarioInputs?.[this.navigationScenarioId]?.['viewId']
  if(!dataSet||!view||typeof target!=='string'||!target.trim()||view.queryContext['viewId']!==target)throw Error('逻辑视图编辑目标尚未注入')
  const {assertCurrent}=readStructuredConfigScope('逻辑视图目标')
  view.validateQueryResult=result=>{assertCurrent();const row=result.rows[0];if(page.getDataSet(this.navigationScenarioId)!==dataSet||view.queryContext['viewId']!==target||result.rows.length!==1||!row||result.rowKey(row)!==target||result.fieldAccess(target,'rowid').read!=='visible')throw Error('逻辑视图目录目标不存在或不唯一')}
  await view.refresh();assertCurrent();if(view.loadingError)throw view.loadingError
  const row=view.rows[0];if(!row||view.getPkKey(row)!==target)throw Error('逻辑视图目录目标不存在或不唯一');view.setCurrentRow(row)
 }
 /** 参数与来源共享同一按需实例；只查询参数命名视图，保留其它视图和既有草稿。 */
 static async ensureParameters(page:PageRuntime):Promise<DataSet>{
  const {assertCurrent}=readStructuredConfigScope('逻辑视图参数'),dataSet=await page.ensureScenarioLoaded(this.parameterScenarioId)
  assertCurrent()
  const view=dataSet.getView(this.parameterModelName,this.parameterViewId),target=page.call.scenarioInputs?.[this.parameterScenarioId]?.['viewId']
  if(view?.primaryKey!=='parid'||typeof target!=='string'||!target.trim()||view.queryContext['viewId']!==target)throw Error('逻辑视图参数身份不匹配')
  view.validateQueryResult=result=>{assertCurrent();if(page.getDataSet(this.parameterScenarioId)!==dataSet||view.queryContext['viewId']!==target||result.rows.some(row=>row['pid']!==target||result.fieldAccess(result.rowKey(row),'pid').read!=='visible'))throw Error('逻辑视图参数返回目标之外的记录')}
  if(view.requestState!==RequestState.Loaded){await view.refresh();assertCurrent();if(view.loadingError)throw view.loadingError}
  return dataSet
 }
}
