/**
 * @module app:lowcode/resources/semi-structured/excel-import/layout/routes
 * 职责：按实际导出服务的路由比较和版式启用语义核引用；不改写原定义。
 */
import {isJsonObject,parseJsonDocument} from '@spark-appworks/spark-json-document'
/** 服务比较物理路径时去除首尾空格并忽略大小写；不是持久化转换。 */
export function excelLayoutTableKey(value:unknown):string{return typeof value==='string'?value.trim().toLowerCase():''}
/** v3定义或已启用定义须核引用；停用的历史定义不具有当前导出引用。 */
export function hasExcelLayoutReferences(raw:unknown):boolean{
 return requiresReferences(readLayout(raw))
}

function readLayout(raw:unknown){
 if(raw===null||raw===undefined||raw==='')return undefined
 if(typeof raw!=='string')throw Error('版式引用不是JSON文本')
 const value=parseJsonDocument(raw)
 if(!isJsonObject(value))throw Error('版式引用必须是对象')
 return value
}

function requiresReferences(value:ReturnType<typeof readLayout>):boolean{
 return value?.['version']===3||value?.['enabled']===true
}

/** 读取存活祖先的正式节点身份及规范化物理路由，缺少合同则拒绝删除。 */
export function readExcelLayoutDeleteTargets(raw:unknown){
 const layout=readLayout(raw)
 if(!requiresReferences(layout))return undefined
 if(layout?.['version']!==3||!Array.isArray(layout['tables']))throw Error('祖先版式删除引用无法核定')
 return layout['tables'].map((table:unknown)=>{
  if(!isJsonObject(table))throw Error('祖先版式删除引用无法核定')
  const route=excelLayoutTableKey(table['table'])
  if(!route)throw Error('祖先版式删除引用无法核定')
  return {configId:table['configId'],route}
 })
}
