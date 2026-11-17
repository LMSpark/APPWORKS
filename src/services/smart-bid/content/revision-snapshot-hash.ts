/**
 * @module app:services/smart-bid/content/revision-snapshot-hash
 * 职责：按持久版本合同规范编码新快照完整清单并计算UTF8 SHA256。
 * 边界：不改节点哈希、不改写旧清单或历史摘要，不代业务闭包/rootHash/权限和采用校验。
 * AI用途：新清单登记前及精确读取后用同版规范核完整清单摘要。
 */
import {readSnapshotNodeIndex} from './revision-snapshot-index'

function string(value:string):string {
 for(const character of value){const code=character.codePointAt(0)??0
  if(code>=0xD800&&code<=0xDFFF)throw Error('SNAPSHOT_HASH_UNICODE')}
 return JSON.stringify(value)
}
function own(value:object,key:PropertyKey):unknown {
 const descriptor=Object.getOwnPropertyDescriptor(value,key)
 if(typeof key!=='string'||descriptor?.enumerable!==true||!Object.hasOwn(descriptor,'value'))throw Error('SNAPSHOT_HASH_JSON')
 return descriptor.value
}
function canonical(value:unknown,ancestors:Set<object>):string {
 if(typeof value==='string')return string(value)
 if(value===null||typeof value==='boolean')return JSON.stringify(value)
 if(typeof value==='number'&&Number.isFinite(value))return JSON.stringify(value)
 if(typeof value!=='object'||ancestors.has(value))throw Error('SNAPSHOT_HASH_JSON')
 ancestors.add(value)
 try{
  if(Array.isArray(value)){
   if(Reflect.ownKeys(value).length!==value.length+1)throw Error('SNAPSHOT_HASH_JSON')
   const items:string[]=[]
   for(let index=0;index<value.length;index++)items.push(canonical(own(value,String(index)),ancestors))
   return `[${items.join(',')}]`
  }
  const prototype:unknown=Object.getPrototypeOf(value)
  if(prototype!==Object.prototype&&prototype!==null)throw Error('SNAPSHOT_HASH_JSON')
  if(Reflect.ownKeys(value).some(key=>typeof key!=='string'))throw Error('SNAPSHOT_HASH_JSON')
  return `{${Object.getOwnPropertyNames(value).sort().map(key=>`${string(key)}:${canonical(own(value,key),ancestors)}`).join(',')}}`
 }finally{ancestors.delete(value)}
}

/** 规范编码固定快照中的 JSON 值，保留原字符串和数组顺序。 */
export function canonicalSnapshotValue(value:unknown):string {
 return canonical(value,new Set())
}

/** 完整清单版本和索引外形先核；保留原字符串与数组顺序，不修复数据或归一引用身份。 */
export function canonicalRevisionSnapshot(value:unknown):string {
 if(value===null||typeof value!=='object')throw Error('SNAPSHOT_MANIFEST_MODEL')
 const projectId=own(value,'projectId')
 if(typeof projectId!=='string')throw Error('SNAPSHOT_MANIFEST_PROJECT')
 readSnapshotNodeIndex(value,projectId)
 return canonicalSnapshotValue(value)
}
/** 规范文本在await前捕获；使用WebCrypto，不降级摘要也不改写原清单。 */
export async function hashRevisionSnapshot(value:unknown):Promise<string> {
 const text=canonicalRevisionSnapshot(value),bytes=new TextEncoder().encode(text)
 const digest=await globalThis.crypto.subtle.digest('SHA-256',bytes)
 return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('')
}
