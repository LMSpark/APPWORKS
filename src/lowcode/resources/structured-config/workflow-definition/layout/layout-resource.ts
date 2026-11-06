/**
 * @module app:lowcode/resources/structured-config/workflow-definition/layout/layout-resource
 * 职责：将独立工作流布局文件接入公共SPARK data文件资源链。
 * 边界：固定SysForm及本次workflowId，不保存数据库节点、连线或模型；不吞权限/协议错误。
 * AI用途：配置WorkflowLayout命名视图，输入workflowId，经DataSet提交布局文本。
 */
import {createFileResourceAdapterExecutor,type DataColumn,type DataView} from '@spark-appworks/spark-data'
import {LowcodeApiError,type LowcodeDesignApi,type LowcodeDesignFileUpload} from '@spark-appworks/spark-lowcode-api'
import {WorkflowLayoutDocument} from './layout-document'
export const WORKFLOW_LAYOUT_TABLE='WorkflowLayout'
export const WORKFLOW_LAYOUT_RESOURCE_ID='workflow-definition:layout'
export const WORKFLOW_LAYOUT_COLUMNS:readonly DataColumn[]=Object.freeze([
 {name:'workflowId',type:'string',isPrimaryKey:true},
 {name:'fileName',type:'string'},
 {name:'content',type:'string'},
])
export const WORKFLOW_LAYOUT_VIEWS=Object.freeze({default:Object.freeze({autoLoad:false,autoCurrentFirst:true,commitMode:'staged',queryContext:Object.freeze({workflowId:''})})})
export const WORKFLOW_LAYOUT_QUERY_PARAMETERS=Object.freeze({default:Object.freeze([{name:'workflowId',type:'string',label:'工作流ID',required:true}])})
type LayoutResourceOptions=Readonly<{api:Pick<LowcodeDesignApi,'readTextFile'|'removeFile'>;fileUpload:Pick<LowcodeDesignFileUpload,'uploadWorkingText'>;assertCurrent():void}>
/** 严格区分真实文件缺失与读取失败；文件内容仍原文保留，JSON语义在编辑/保存时确认。 */
export function createWorkflowLayoutExecutor(options:LayoutResourceOptions):Parameters<DataView['bindQueryExecutor']>[0]{
 const identity=(value:unknown):string=>{
  if(typeof value!=='string')throw new Error('WORKFLOW_LAYOUT_TARGET: 工作流布局身份无效')
  if(value.length===0||value.trim()!==value||value==='.'||value==='..'||/[\\/%\u0000-\u001f\u007f]/.test(value))throw new Error('WORKFLOW_LAYOUT_TARGET: 工作流布局身份无效')
  return value
 }
 return createFileResourceAdapterExecutor({resourceId:WORKFLOW_LAYOUT_RESOURCE_ID,contentField:'content',
  assertCurrent:()=>options.assertCurrent(),
  target:view=>{const id=identity(view.queryContext['workflowId']);return {key:id,fields:{workflowId:id,fileName:`${id}.json`}}},
  transport:{
   read:async target=>{
    options.assertCurrent()
    try{const text=await options.api.readTextFile({appType:'designfile',customPath:'SysForm',fileName:`${identity(target.key)}.json`});options.assertCurrent();return {text,revision:null}}
    catch(error){options.assertCurrent();if(error instanceof LowcodeApiError&&error.code===404)return null;throw error}
   },
   write:async({target,text})=>{
    options.assertCurrent()
    WorkflowLayoutDocument.read(text)
    await options.fileUpload.uploadWorkingText({customPath:'SysForm',fileName:`${identity(target.key)}.json`,text});options.assertCurrent()
   },
   remove:async({target})=>{
    options.assertCurrent()
    await options.api.removeFile({appType:'designfile',customPath:'SysForm',fileName:`${identity(target.key)}.json`});options.assertCurrent()
   },
   isUnknown:error=>!(error instanceof SyntaxError)&&!(error instanceof LowcodeApiError&&error.code>=400&&error.code<500&&error.code!==408),
  },
 })
}
