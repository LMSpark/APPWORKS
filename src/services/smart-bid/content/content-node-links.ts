/**
 * @module app:services/smart-bid/content/content-node-links
 * 职责：按节点及表格格子的正式引用合同读取page/xref节点链接。
 * 边界：不解引用、不查询或保存；不覆盖独立响应、挂接、模板和来源引用。
 */
import {isRecord} from '@spark-appworks/spark-utils'
import {canonicalContentNode} from '../content-node-hash'
import {inspectContentPlaceholders,validateContentPlaceholders} from '../content-placeholders'
import {validateContentReference} from '../content-reference'

/** 原节点身份和JSON路径；保留精确目标身份，不用NFC替换引用对象。 */
export type ContentNodeLink=Readonly<{
 ownerNodeId:string;path:readonly string[];kind:'page'|'xref';targetNodeId:string
}>
/** 空计算表须另核模板类；没有链接不等于所有领域引用已核。 */
export type ContentNodeLinks=Readonly<{
 links:readonly ContentNodeLink[];requiresTableGeneratorCheck:boolean
}>

/** 普通表和已展开计算表共用的正文 JSON 结构。 */
export type ContentTableData=Readonly<{
 header:readonly string[]
 rows:ReadonlyArray<ReadonlyArray<Readonly<{value:string;data:Readonly<Record<string,unknown>>}>>>
}>
/** 位置按原文 UTF-16 左闭右开区间，表格位置由 path 中的行列标识。 */
export type ContentNodeLinkOccurrence=ContentNodeLink&Readonly<{start:number;end:number}>
type NodeReferences={links:ContentNodeLink[];factIds:Set<string>;resourceVersionIds:Set<string>;linkOccurrences:ContentNodeLinkOccurrence[]}
const containers=new Set(['document','toc','chapter','list','item','figure','quote'])
const texts=new Set(['heading','paragraph','caption','image'])

function own(source:object,key:string):unknown {
 const descriptor=Object.getOwnPropertyDescriptor(source,key)
 if(descriptor?.enumerable!==true||!Object.hasOwn(descriptor,'value'))throw Error('CONTENT_LINK_DATA')
 return descriptor.value
}
function record(value:unknown):Record<string,unknown> {
 if(!isRecord(value))throw Error('CONTENT_LINK_DATA')
 return Object.fromEntries(Object.keys(value).map(key=>[key,own(value,key)]))
}
function text(value:unknown):string {
 if(typeof value!=='string')throw Error('CONTENT_LINK_TEXT')
 return value
}
function checkFields(input:Readonly<{value:string;data:Record<string,unknown>;ownerNodeId:string;path:readonly string[];references:NodeReferences}>):void {
 const {value,data,ownerNodeId,path,references}=input
 const errors=validateContentPlaceholders({value,data})
 if(errors.length)throw Error(`CONTENT_LINK_PLACEHOLDER:${errors.join(';')}`)
 const fieldLinks=new Map<string,ContentNodeLink>()
 for(const key of Object.keys(data)){
  const reference=record(data[key]),referenceErrors=validateContentReference(reference)
  if(referenceErrors.length)throw Error(`CONTENT_LINK_REFERENCE:${referenceErrors.join(';')}`)
  const kind=reference['type'],targetNodeId=reference['nodeId']
  if((kind==='page'||kind==='xref')&&typeof targetNodeId==='string'){
   const link:ContentNodeLink={ownerNodeId,path:[...path,key],kind,targetNodeId}
   references.links.push(link);fieldLinks.set(key,link)
  }
 }
 const parsed=inspectContentPlaceholders(value)
 for(const {name,start,end} of parsed.occurrences){
  const link=fieldLinks.get(name)
  if(link)references.linkOccurrences.push({...link,start,end})
 }
 for(const key of parsed.names){
  const reference=record(data[key]),factId=reference['factId'],resourceVersionId=reference['resourceVersionId']
  if(reference['type']==='fact'&&typeof factId==='string')references.factIds.add(factId)
  if(reference['type']==='resource'&&typeof resourceVersionId==='string')references.resourceVersionIds.add(resourceVersionId)
 }
}
function checkTable(data:Record<string,unknown>,ownerNodeId:string,references:NodeReferences):boolean {
 if(Object.keys(data).length!==2||!Object.hasOwn(data,'header')||!Object.hasOwn(data,'rows'))throw Error('CONTENT_LINK_TABLE')
 const header=data['header'],rows=data['rows']
 if(!Array.isArray(header)||!Array.isArray(rows))throw Error('CONTENT_LINK_TABLE')
 if(header.length===0){if(rows.length!==0)throw Error('CONTENT_LINK_TABLE');return true}
 const names=header.map(value=>text(value)),normalized=names.map(name=>name.normalize('NFC'))
 if(names.some(name=>!name.trim())||new Set(normalized).size!==names.length)throw Error('CONTENT_LINK_TABLE_HEADER')
 const columnKinds=new Map<number,string>()
 rows.forEach((row:unknown,rowIndex:number)=>{
  if(!Array.isArray(row)||row.length!==names.length)throw Error('CONTENT_LINK_TABLE_ROW')
  row.forEach((item:unknown,columnIndex:number)=>{
   const cell=record(item)
   if(Object.keys(cell).length!==2)throw Error('CONTENT_LINK_TABLE_CELL')
   const value=text(own(cell,'value')),fields=record(own(cell,'data')),name=names[columnIndex]
   const kind=Object.keys(fields).length===0?'TEXT':'DATA',previous=columnKinds.get(columnIndex)
   if(previous!==undefined&&previous!==kind)throw Error('CONTENT_LINK_TABLE_COLUMN')
   columnKinds.set(columnIndex,kind)
   if(kind==='DATA'&&(value!==`{{${name}}}`||Object.keys(fields).length!==1||name===undefined||!Object.hasOwn(fields,name)))throw Error('CONTENT_LINK_TABLE_CELL')
   checkFields({value,data:fields,ownerNodeId,path:['data','rows',String(rowIndex),String(columnIndex),'data'],references})
  })
 })
 return false
}

function readNodeReferences(input:unknown) {
 canonicalContentNode(input)
 const node=record(input),ownerNodeId=text(own(node,'nodeId')),type=text(own(node,'type'))
 const value=text(own(node,'value')),data=record(own(node,'data'))
 const references:NodeReferences={links:[],factIds:new Set(),resourceVersionIds:new Set(),linkOccurrences:[]}
 let requiresTableGeneratorCheck=false
 if(containers.has(type)){
  if(value!==''||Object.keys(data).length!==0)throw Error('CONTENT_LINK_CONTAINER')
 }else if(texts.has(type)){
  checkFields({value,data,ownerNodeId,path:['data'],references})
  if(type==='image'){
   const keys=Object.keys(data),key=keys[0]
   if(keys.length!==1||key===undefined||value!==`{{${key}}}`||record(data[key])['type']!=='resource')throw Error('CONTENT_LINK_IMAGE')
  }
 }else if(type==='table'){
  if(value!=='')throw Error('CONTENT_LINK_TABLE')
  requiresTableGeneratorCheck=checkTable(data,ownerNodeId,references)
 }else if(type==='raw'){
  const classes=own(node,'class')
  if(Object.keys(data).length!==0||!Array.isArray(classes)||classes.length!==1||classes[0]!=='legacy')throw Error('CONTENT_LINK_RAW')
 }else throw Error('CONTENT_LINK_TYPE')
 return {...references,requiresTableGeneratorCheck}
}

/** 从正式节点 JSON 中提取 page/xref 引用。 */
export function readContentNodeLinks(input:unknown):ContentNodeLinks {
 const {links,requiresTableGeneratorCheck}=readNodeReferences(input)
 return {links,requiresTableGeneratorCheck}
}

/** 返回正文或表格按首次出现排列的直接事实键，供固定版本批查。 */
export function readContentNodeFactIds(input:unknown):readonly string[] {
 return [...readNodeReferences(input).factIds]
}

/** 返回节点正文、图片或表格中直接引用的固定资源版本。 */
export function readContentNodeResourceVersions(input:unknown):readonly string[] {
 return [...readNodeReferences(input).resourceVersionIds]
}

/** 逐处返回页码和交叉引用，重复占位仍保留各自位置。 */
export function readContentNodeLinkOccurrences(input:unknown):readonly ContentNodeLinkOccurrence[] {
 return readNodeReferences(input).linkOccurrences
}
