/**
 * @module app:services/smart-bid/content/content-text-span
 * 职责：从固定版对象核V2原文片段坐标和原始UTF-8摘要，不重新搜索同文。
 * 边界：不改文字/绑定，不核权限或最终句意；仅供正式预演继续组合差异。
 */
import {canonicalContentNode} from '../content-node-hash'
import {validateContentPlaceholders} from '../content-placeholders'

/** 内容坐标与原件fragmentRef分开，响应不能冒充正文节点。 */
export type ContentTextOwner=Readonly<{kind:'NODE';nodeId:string}>
 |Readonly<{kind:'RESPONSE';assignmentId:string;responseId:string}>
/** 同一固定版本内的原串坐标；摘要不进行NFC、去空白或换行转换。 */
export type ContentTextSpan=Readonly<{
 schemaVersion:2;projectId:string;revisionId:string;owner:ContentTextOwner;path:string
 start:number;end:number;unit:'utf16';textDigest:string
}>
/** 对象须由宿主从指定修订回读；模式由source/target的实际操作语义决定。 */
export type ContentTextSpanInput=Readonly<{
 projectId:string;revisionId:string;owner:ContentTextOwner;object:unknown;reference:unknown;mode:'TEXT'|'INSERTION'
}>
/** 由固定版原字段和用户选区生成 V2 引用。 */
export type ContentTextSelection=Omit<ContentTextSpanInput,'reference'>&Readonly<{path:string;start:number;end:number}>
/** 只证明此版本此位置的原文，完整占位仍须核当前字段引用及事实键。 */
export type VerifiedContentTextSpan=Readonly<{
 reference:ContentTextSpan;text:string;containerText:string;containsPlaceholders:boolean;requiresFieldBindingChecks:boolean
 requiresCurrentAuthorityChecks:true
}>

function own(value:object,key:string):unknown {
 const descriptor=Object.getOwnPropertyDescriptor(value,key)
 if(descriptor?.enumerable!==true||!Object.hasOwn(descriptor,'value'))throw Error('CONTENT_SPAN_OBJECT')
 return descriptor.value
}
function object(value:unknown):Record<string,unknown> {
 if(value===null||typeof value!=='object'||Array.isArray(value)
  ||Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null)throw Error('CONTENT_SPAN_OBJECT')
 return Object.fromEntries(Reflect.ownKeys(value).map(key=>{
  if(typeof key!=='string')throw Error('CONTENT_SPAN_OBJECT')
  return [key,own(value,key)]
 }))
}
function unicode(value:unknown):string {
 if(typeof value!=='string')throw Error('CONTENT_SPAN_STRING')
 for(const character of value){const point=character.codePointAt(0)
  if(point!==undefined&&point>=0xD800&&point<=0xDFFF)throw Error('CONTENT_SPAN_UNICODE')}
 return value
}
function identity(value:unknown):string {
 const result=unicode(value)
 if(!result.trim())throw Error('CONTENT_SPAN_ID')
 return result
}
/** 捕获节点或响应的精确内容身份；不会从一种owner退回另一种。 */
export function readContentTextOwner(value:unknown):ContentTextOwner {
 const row=object(value)
 if(row['kind']==='NODE'&&Object.keys(row).length===2)return {kind:'NODE',nodeId:identity(row['nodeId'])}
 if(row['kind']==='RESPONSE'&&Object.keys(row).length===3)return {kind:'RESPONSE',assignmentId:identity(row['assignmentId']),responseId:identity(row['responseId'])}
 throw Error('CONTENT_SPAN_OWNER')
}
function sameOwner(left:ContentTextOwner,right:ContentTextOwner):boolean {
 return left.kind==='NODE'?right.kind==='NODE'&&left.nodeId===right.nodeId
  :right.kind==='RESPONSE'&&left.assignmentId===right.assignmentId&&left.responseId===right.responseId
}
/** 支持直接用 /value 定位正文的节点类型；表格选区另走单元格路径。 */
export function supportsContentTextValue(type:unknown):boolean{
 return typeof type==='string'&&['heading','paragraph','caption','image','raw'].includes(type)
}
function stringAt(input:Readonly<{source:unknown;owner:ContentTextOwner;path:string}>):Readonly<{text:string;data:Record<string,unknown>}> {
 const row=object(input.source)
 if(input.owner.kind==='RESPONSE'){
  if(row['assignmentId']!==input.owner.assignmentId||row['responseId']!==input.owner.responseId)throw Error('CONTENT_SPAN_OWNER')
  if(input.path!=='/statement')throw Error('CONTENT_SPAN_PATH')
  return {text:unicode(row['statement']),data:object(row['data'])}
 }
 canonicalContentNode(input.source)
 if(row['nodeId']!==input.owner.nodeId)throw Error('CONTENT_SPAN_OWNER')
 if(input.path==='/value'){
  if(!supportsContentTextValue(row['type']))throw Error('CONTENT_SPAN_PATH')
  return {text:unicode(row['value']),data:object(row['data'])}
 }
 const match=/^\/data\/rows\/(0|[1-9]\d*)\/(0|[1-9]\d*)\/value$/u.exec(input.path)
 if(!match||row['type']!=='table')throw Error('CONTENT_SPAN_PATH')
 const rowIndex=Number(match[1]),columnIndex=Number(match[2]),rows=object(row['data'])['rows']
 if(!Number.isSafeInteger(rowIndex)||!Number.isSafeInteger(columnIndex)||!Array.isArray(rows))throw Error('CONTENT_SPAN_PATH')
 const cells=own(rows,String(rowIndex))
 if(!Array.isArray(cells))throw Error('CONTENT_SPAN_PATH')
 const cell=object(own(cells,String(columnIndex)))
 return {text:unicode(cell['value']),data:object(cell['data'])}
}
function boundary(text:string,offset:number):void {
 const left=text.charCodeAt(offset-1),right=text.charCodeAt(offset)
 if(left>=0xD800&&left<=0xDBFF&&right>=0xDC00&&right<=0xDFFF)throw Error('CONTENT_SPAN_BOUNDARY')
}

/** 先捕获全部引用和原串，再异步计算摘要；await后不重读调用方可变对象。 */
export async function verifyContentTextSpan(command:ContentTextSpanInput):Promise<VerifiedContentTextSpan> {
 const input=object(command),ref=object(input['reference']),expectedOwner=readContentTextOwner(input['owner']),spanOwner=readContentTextOwner(ref['owner'])
 const fields=['schemaVersion','projectId','revisionId','owner','path','start','end','unit','textDigest']
 if(Object.keys(ref).length!==fields.length||fields.some(key=>!Object.hasOwn(ref,key))||ref['schemaVersion']!==2||ref['unit']!=='utf16')throw Error('CONTENT_SPAN_SCHEMA')
 const projectId=identity(ref['projectId']),revisionId=identity(ref['revisionId'])
 if(projectId!==identity(input['projectId'])||revisionId!==identity(input['revisionId'])||!sameOwner(spanOwner,expectedOwner))throw Error('CONTENT_SPAN_CONTEXT')
 const path=unicode(ref['path']),start=ref['start'],end=ref['end'],textDigest=unicode(ref['textDigest']),mode=input['mode']
 if(!/^[a-f0-9]{64}$/u.test(textDigest))throw Error('CONTENT_SPAN_DIGEST')
 if(typeof start!=='number'||typeof end!=='number'||mode!=='TEXT'&&mode!=='INSERTION')throw Error('CONTENT_SPAN_RANGE')
 const result=await captureContentTextSpan({projectId,revisionId,owner:spanOwner,object:input['object'],path,start,end,mode})
 if(result.reference.textDigest!==textDigest)throw Error('CONTENT_SPAN_DIGEST')
 return result
}

/** 不接受调用方提供原串或摘要，从固定版字段切出原文并计算摘要。 */
export async function captureContentTextSpan(command:ContentTextSelection):Promise<VerifiedContentTextSpan>{
 const input=object(command),projectId=identity(input['projectId']),revisionId=identity(input['revisionId'])
 const spanOwner=readContentTextOwner(input['owner']),path=unicode(input['path']),start=input['start'],end=input['end'],mode=input['mode']
 const source=stringAt({source:input['object'],owner:spanOwner,path}),full=source.text
 if(typeof start!=='number'||typeof end!=='number'||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)
  ||start<0||end>full.length||start>end||mode!=='TEXT'&&mode!=='INSERTION'
  ||mode==='TEXT'&&start===end||mode==='INSERTION'&&start!==end)throw Error('CONTENT_SPAN_RANGE')
 boundary(full,start);boundary(full,end)
 const errors=validateContentPlaceholders({value:full,data:source.data})
 if(errors.length)throw Error(`CONTENT_SPAN_PLACEHOLDER:${errors.join(';')}`)
 let containsPlaceholders=false
 for(const match of full.matchAll(/\{\{[^{}]+\}\}/gu)){
  const tokenStart=match.index,tokenEnd=tokenStart+match[0].length
  if(start>tokenStart&&start<tokenEnd||end>tokenStart&&end<tokenEnd)throw Error('CONTENT_SPAN_PLACEHOLDER_BOUNDARY')
  if(start<=tokenStart&&end>=tokenEnd)containsPlaceholders=true
 }
 const text=full.slice(start,end),bytes=new TextEncoder().encode(text)
 const hash=await globalThis.crypto.subtle.digest('SHA-256',bytes)
 const textDigest=Array.from(new Uint8Array(hash),byte=>byte.toString(16).padStart(2,'0')).join('')
 return {reference:{schemaVersion:2,projectId,revisionId,owner:spanOwner,path,start,end,unit:'utf16',textDigest},text,containerText:full,
  containsPlaceholders,requiresFieldBindingChecks:containsPlaceholders,requiresCurrentAuthorityChecks:true}
}
