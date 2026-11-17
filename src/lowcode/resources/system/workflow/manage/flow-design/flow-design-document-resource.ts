/**
 * @module app:lowcode/resources/system/workflow/manage/flow-design/flow-design-document-resource
 * 职责：将正式流程模型定位的EJ2文件绑定到同一DataSet的文件资源视图。
 * 边界：保存、冲突、取消和unknown由公共文件适配器承接；不保存数据库或建立图草稿。
 */
import {createFileResourceAdapterExecutor,type DataColumn,type DataSet,type DataView,type FileResourceTarget} from '@spark-appworks/spark-data'
import {isRecord} from '@spark-appworks/spark-utils'
import {LowcodeApiError,type LowcodeDesignApi,type LowcodeDesignFileUpload} from '@spark-appworks/spark-lowcode-api'
import {captureFlowDesignFileContext,captureFlowDesignModel} from '../flow-design-file-context'

export const FLOW_DESIGN_DOCUMENT_TABLE='FlowDesignDocument'
export const FLOW_DESIGN_DOCUMENT_RESOURCE='workflow-flow:design-document'
export const FLOW_DESIGN_DOCUMENT_COLUMNS:readonly DataColumn[]=Object.freeze([{name:'fileKey',type:'string',isPrimaryKey:true},{name:'flowModelId',type:'string'},{name:'content',type:'string'}])
export const FLOW_DESIGN_DOCUMENT_VIEWS=Object.freeze({default:Object.freeze({autoLoad:false,autoCurrentFirst:true,commitMode:'staged',queryContext:Object.freeze({flowModelId:''})})})
export const FLOW_DESIGN_DOCUMENT_PARAMETERS=Object.freeze({default:Object.freeze([{name:'flowModelId',type:'string',label:'流程模型ID',required:true}])})
type Options=Readonly<{applicationId:string;api:Pick<LowcodeDesignApi,'readTextFile'>;fileUpload:Pick<LowcodeDesignFileUpload,'uploadWorkingText'>;assertCurrent():void}>
/** 独立目标用原文件模板派生，禁止将已打开视图重新指向另一模型。 */
export function openFlowDesignDocumentView(dataSet:DataSet,flowModelId:string):DataView{
 captureFlowDesignModel(dataSet,flowModelId)
 const table=dataSet.getTable(FLOW_DESIGN_DOCUMENT_TABLE),source=table?.getView('default')
 if(!source||table?.resourceType!=='file'||table.resourceId!==FLOW_DESIGN_DOCUMENT_RESOURCE)throw Error('FLOW_DESIGN_DOCUMENT: 正式场景未声明文件资源')
 const viewId=`document-${flowModelId}`,existing=table.getView(viewId)
 if(existing){if(existing.queryContext['flowModelId']!==flowModelId)throw Error('FLOW_DESIGN_DOCUMENT: 文件目标不可改绑');return existing}
 const view=source.createQueryView(viewId);view.queryContext={flowModelId};return view
}
/** 应用scope由宿主持有；原模型/导航证明在每次实际IO前后重核。 */
export function createFlowDesignDocumentExecutor(options:Options):Parameters<DataView['bindQueryExecutor']>[0]{
 let originalDataSet:DataSet|undefined
 const locate=(dataSet:DataSet|undefined,id:unknown)=>{
  options.assertCurrent()
  if(!dataSet||typeof id!=='string'||id.length===0||id.trim()!==id||/[\\/@%\u0000-\u001f\u007f]/.test(id)||id==='.'||id==='..')throw Error('FLOW_DESIGN_DOCUMENT: 文件目标无效')
  if(originalDataSet&&originalDataSet!==dataSet)throw Error('FLOW_DESIGN_DOCUMENT: 文件执行器不能跨实例复用')
  originalDataSet=dataSet
  const context=captureFlowDesignFileContext(dataSet,id)
  if(context.applicationId&&context.applicationId!==options.applicationId)throw Error('FLOW_DESIGN_DOCUMENT: 跨应用文件读写合同尚未确认，不能写入当前应用目录')
  const fileName=`${id}EJ2.json`,key=JSON.stringify([options.applicationId,context.customPath,fileName])
  return {...context,fileName,key,flowModelId:id,dataSet}
 }
 const capture=(target:FileResourceTarget)=>{
  const context=locate(originalDataSet,target.fields['flowModelId'])
  if(context.key!==target.key)throw Error('FLOW_DESIGN_DOCUMENT: 原文件定位已变化')
  return context
 }
 return createFileResourceAdapterExecutor({resourceId:FLOW_DESIGN_DOCUMENT_RESOURCE,contentField:'content',
  target:view=>{const context=locate(view.dataSet,view.queryContext['flowModelId']);return {key:context.key,fields:{flowModelId:context.flowModelId}}},
  canWrite:target=>{const context=capture(target),model=captureFlowDesignModel(context.dataSet,context.flowModelId,'fileTarget');return model.view.editActionState(model.row)==='enabled'},canDelete:()=>false,
  assertCurrent:target=>{if(target)capture(target);else options.assertCurrent()},
  transport:{
   read:async target=>{const context=capture(target);try{const text=await options.api.readTextFile({appType:'designfile',customPath:context.customPath,fileName:context.fileName});options.assertCurrent();context.assertCurrent();return {text,revision:null}}catch(error){options.assertCurrent();context.assertCurrent();if(error instanceof LowcodeApiError&&error.code===404)return null;throw error}},
   write:async({target,text})=>{const context=capture(target);let parsed:unknown
    try{parsed=JSON.parse(text)}catch{throw new SyntaxError('流程设计文件不是JSON')}
    if(!isRecord(parsed)||!Array.isArray(parsed['nodes'])||!Array.isArray(parsed['edges']))throw new SyntaxError('流程设计文件必须包含节点和连线')
    await options.fileUpload.uploadWorkingText({appType:'designfile',customPath:context.customPath,fileName:context.fileName,text});options.assertCurrent();context.assertCurrent()},
   isUnknown:error=>!(error instanceof SyntaxError)&&!(error instanceof LowcodeApiError&&error.code>=400&&error.code<500&&error.code!==408),
  },
 })
}
