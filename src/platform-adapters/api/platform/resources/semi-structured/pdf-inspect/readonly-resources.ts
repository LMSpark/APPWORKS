/**
 * @module @/platform-adapters/api:platform/resources/semi-structured/pdf-inspect/readonly-resources
 * 职责：PDF限制、原任务结果/恢复及服务端分页历史接入公共只读DataView绑定。
 * 边界：不创建任务，不对服务历史重复分页，不忽略不支持的查询语义。
 */
import type {BindReadonlyCommandQueryOptions,DataView,QueryParams} from '@spark-appworks/spark-data'
import type {PdfInspectionApi,PdfInspectionJob} from './task-api'
export type PdfInspectionReadonlyKind='limits'|'history'|'result'|'recover'
function basic(params:Readonly<QueryParams>,paged:boolean):void{
 const allowed=new Set(['page','pageSize','fields','allPages','pagination','treeMode','viewId','viewConfig','context'])
 if(Object.entries(params).some(([key,value])=>value!==undefined&&value!==null&&value!==false&&value!==''&&!(Array.isArray(value)&&value.length===0)&&!allowed.has(key))||params.treeMode==='nested'
  ||paged&&(params.allPages===true||params.pagination==='none'))throw Error(`PDF_INSPECTION_QUERY: 不支持所请求参数 ${Object.keys(params).join(',')}`)
}
function identity(params:Readonly<QueryParams>,field:string):string{
 const value=params.context?.[field]
 if(typeof value!=='string'||!/^[-A-Za-z0-9_]{1,128}$/u.test(value))throw Error('PDF_INSPECTION_QUERY: 缺少精确任务身份')
 return value
}
function jobRow(job:PdfInspectionJob){return{inspectJobId:job.inspectJobId,requestId:job.requestId,status:job.status,total:job.progress.total,finished:job.progress.finished,files:job.files}}
/** 只返回给原DataSet装配责任方，页面不直接调用HTTP。 */
export function pdfInspectionReadonlyBinding(input:Readonly<{api:PdfInspectionApi;kind:PdfInspectionReadonlyKind;assertCurrent:()=>void}>):BindReadonlyCommandQueryOptions{
 const common={resource:{resourceType:'logical-view',resourceId:`pdf-inspect:${input.kind}`},guard:input.assertCurrent,
  captureQueryInputs:(view:DataView,params:Readonly<QueryParams>)=>{
   const context=JSON.stringify(params.context??{})
   return()=>{if(JSON.stringify(view.queryContext)!==context)throw Error('PDF_INSPECTION_QUERY: 原查询参数已变化')}
  }}
 if(input.kind==='history')return{...common,loadPage:async(_view,params)=>{
  basic(params,true)
  if(Object.keys(params.context??{}).length)throw Error('PDF_INSPECTION_QUERY: 历史不接受附加筛选参数')
  const page=await input.api.history({page:params.page??1,pageSize:params.pageSize??20})
  return{rows:page.items,total:page.total}
 }}
 return{...common,loadRows:async(_view,params)=>{
  basic(params,false)
  if(input.kind==='limits'){
   if(Object.keys(params.context??{}).length)throw Error('PDF_INSPECTION_QUERY: 限制查询不接受业务参数')
   return[{id:'limits',...await input.api.limits()}]
  }
  const job=input.kind==='recover'?await input.api.recover(identity(params,'requestId')):await input.api.result(identity(params,'inspectJobId'))
  return[jobRow(job)]
 }}
}
