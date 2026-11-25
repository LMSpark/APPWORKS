/**
 * @module @/platform-adapters/api:platform/resources/semi-structured/pdf-inspect/task-api
 * 职责：PDF核验v2正式任务请求及回执身份校验。
 * 边界：存储适配使用；不上传、不自动重试、不生成requestId、不把恢复未命中解释为未提交。
 */
import {isRecord,type HttpClientBase} from '@spark-appworks/spark-utils'
import {LowcodeClient} from '../../../../core/lowcode-client'
import type {DataSpaceRequestScope} from '@spark-appworks/spark-data'

/** 路径须来自已核验上传ACK，不由文件展示名称拼接。 */
export type PdfInspectionFileInput=Readonly<{fileId:string;appType:string;filePath:string}>
/** 同一请求编号的输入固定，不在异常后换号重发。 */
export type PdfInspectionInitInput=Readonly<{requestId:string;configId:string;files:readonly PdfInspectionFileInput[]}>
/** init不回显requestId，调用者须保留原命令捕获。 */
export type PdfInspectionInitReceipt=Readonly<{inspectJobId:string;status:string;fileCount:number;protocolVersion:'2.0'}>
/** 读取服务当前限制，不固化默认大小。 */
export type PdfInspectionLimits=Readonly<{protocolVersion:'2.0';maxFiles:number;maxFileBytes:number;maxTotalFileBytes:number;maxTotalSourceBytes:number;maxZipBytes:number;maxZipEntries:number;maxPages:number;maxTextCharsPerPage:number;maxRenderedPixels:number}>
/** 服务已分页的历史；不能再在当前页上执行一次本地分页。 */
export type PdfInspectionHistory=Readonly<{page:number;pageSize:number;total:number;items:ReadonlyArray<Readonly<Record<string,unknown>>>}>
/** 完整文件/规则证据保留服务原JSON字段，不把状态等同结论。 */
export type PdfInspectionJob=Readonly<{inspectJobId:string;requestId:string;status:string;protocolVersion:'2.0';progress:Readonly<{total:number;finished:number}>;files:ReadonlyArray<Readonly<Record<string,unknown>>>}>
function id(value:unknown):string{if(typeof value!=='string'||!/^[-A-Za-z0-9_]{1,128}$/u.test(value))throw Error('PDF_INSPECTION_ID: 缺少有效任务身份');return value}
function count(value:unknown):number{if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0)throw Error('PDF_INSPECTION_RECEIPT: 数量无效');return value}
function text(value:unknown):string{if(typeof value!=='string'||!value.trim())throw Error('PDF_INSPECTION_RECEIPT: 文本缺失');return value}
function version(value:unknown):Record<string,unknown>{if(!isRecord(value)||value['protocolVersion']!=='2.0')throw Error('PDF_INSPECTION_PROTOCOL: 回执版本不匹配');return value}
function job(value:unknown,expected:Readonly<{requestId?:string;inspectJobId?:string}>):PdfInspectionJob{
 const result=version(value),requestId=id(result['requestId']),inspectJobId=id(result['inspectJobId'])
 if(expected.requestId!==undefined&&expected.requestId!==requestId||expected.inspectJobId!==undefined&&expected.inspectJobId!==inspectJobId)throw Error('PDF_INSPECTION_ID: 原任务回执不匹配')
 const progress=result['progress'],files=result['files']
 if(!isRecord(progress)||!Array.isArray(files)||!files.every(isRecord))throw Error('PDF_INSPECTION_RECEIPT: 结果结构无效')
 const total=count(progress['total']),finished=count(progress['finished']),status=text(result['status'])
 if(finished>total||files.length!==finished||status==='COMPLETED'&&finished!==total)throw Error('PDF_INSPECTION_RECEIPT: 文件明细与任务进度不一致')
 if(new Set(files.map(file=>text(file['fileId']))).size!==files.length)throw Error('PDF_INSPECTION_RECEIPT: 文件明细身份重复')
 return{protocolVersion:'2.0',requestId,inspectJobId,status,progress:{total,finished},files:structuredClone(files)}
}

/** 一个适配实例绑定原执行域；刷新认证或切应用后须由宿主重新装配。 */
export class PdfInspectionApi{
 private readonly client:LowcodeClient
 private readonly scope:DataSpaceRequestScope
 constructor(private readonly input:Readonly<{http:HttpClientBase;readScope:()=>DataSpaceRequestScope}>){
  this.client=new LowcodeClient(input.http);this.scope=structuredClone(input.readScope())
  if(!this.scope.token.trim()||!Object.entries(this.scope.headers).some(([k,v])=>k.toLowerCase()==='x-appid'&&typeof v==='string'&&v.trim().length>0))throw Error('PDF_INSPECTION_SCOPE: 缺少执行应用')
 }
 /** 原配置与ACK前置证明由命令资源完成；本层只执行一次固定请求。 */
 async init(input:PdfInspectionInitInput):Promise<PdfInspectionInitReceipt>{
  id(input.requestId);id(input.configId)
  if(!input.files.length||new Set(input.files.map(f=>id(f.fileId))).size!==input.files.length)throw Error('PDF_INSPECTION_INPUT: 文件为空或身份重复')
  for(const file of input.files){text(file.appType);text(file.filePath)}
  const result=version(await this.request('init',structuredClone(input)))
  return{protocolVersion:'2.0',inspectJobId:id(result['inspectJobId']),status:text(result['status']),fileCount:count(result['fileCount'])}
 }
 /** 恢复只查原请求；任何错误仍交原命令核验，绝不调用init。 */
 async recover(requestId:string):Promise<PdfInspectionJob>{return job(await this.request('recover',{requestId:id(requestId)}),{requestId})}
 /** 按已接纳任务刷新，不能替换成同页面其他任务。 */
 async result(inspectJobId:string):Promise<PdfInspectionJob>{return job(await this.request('result',{inspectJobId:id(inspectJobId)}),{inspectJobId})}
 /** 只读获取协议及限制；不会创建任务或读取文件。 */
 async limits():Promise<PdfInspectionLimits>{
  this.assertCurrent();const raw=version(await this.client.requestResult({path:'/api/File/inspect/limits',method:'GET',headers:this.scope.headers}));this.assertCurrent()
  const positive=(name:string)=>{const value=count(raw[name]);if(!value)throw Error('PDF_INSPECTION_LIMITS: 限制必须为正数');return value}
  return{protocolVersion:'2.0',maxFiles:positive('maxFiles'),maxFileBytes:positive('maxFileBytes'),maxTotalFileBytes:positive('maxTotalFileBytes'),maxTotalSourceBytes:positive('maxTotalSourceBytes'),maxZipBytes:positive('maxZipBytes'),maxZipEntries:positive('maxZipEntries'),maxPages:positive('maxPages'),maxTextCharsPerPage:positive('maxTextCharsPerPage'),maxRenderedPixels:positive('maxRenderedPixels')}
 }
 /** 请求原服务页，保留正式total及来源信息，不伪造协议版本。 */
 async history(input:Readonly<{page:number;pageSize:number}>):Promise<PdfInspectionHistory>{
  if(!Number.isSafeInteger(input.page)||input.page<1||input.page>100000||!Number.isSafeInteger(input.pageSize)||input.pageSize<1||input.pageSize>50)throw Error('PDF_INSPECTION_PAGE: 页码或大小无效')
  const raw=await this.request('history',{page:input.page,pageSize:input.pageSize})
  if(!isRecord(raw)||raw['page']!==input.page||raw['pageSize']!==input.pageSize||!Array.isArray(raw['items'])||!raw['items'].every(isRecord))throw Error('PDF_INSPECTION_PAGE: 回执页不匹配')
  const total=count(raw['total']),items=raw['items']
  const expectedCount=Math.min(input.pageSize,Math.max(0,total-(input.page-1)*input.pageSize))
  if(items.length!==expectedCount)throw Error('PDF_INSPECTION_PAGE: 历史总数与本页记录不一致，请重新核验')
  const jobIds=new Set(items.map(item=>id(item['inspectJobId']))),requestIds=new Set(items.map(item=>id(item['requestId'])))
  if(jobIds.size!==items.length||requestIds.size!==items.length)throw Error('PDF_INSPECTION_PAGE: 历史任务或请求身份重复')
  for(const item of items)id(item['configId'])
  return{page:input.page,pageSize:input.pageSize,total,items:structuredClone(items)}
 }
 private assertCurrent():void{
  const current=this.input.readScope()
  if(current.token!==this.scope.token||JSON.stringify(Object.entries(current.headers).sort())!==JSON.stringify(Object.entries(this.scope.headers).sort()))throw Error('PDF_INSPECTION_SCOPE: 原执行域已变化')
 }
 private async request(action:'init'|'recover'|'result'|'history',data:unknown):Promise<unknown>{
  this.assertCurrent();const result=await this.client.requestResult({path:`/api/File/inspect/${action}`,method:'POST',headers:this.scope.headers,data});this.assertCurrent();return result
 }
}
