/**
 * @module app:services/smart-bid/content/references/snapshot-reference-values
 * 职责：共用固定快照引用的精确身份、闭合记录与密集列表读取。
 * 边界：仅检查JSON值描述符，不补字段、不查询、不选择版本或保存第二份业务数据。
 * AI用途：分册模板和章节挂接复用同一安全读取，业务归属仍在各自合同核验。
 */
/** 身份不做Unicode归一、trim改写或版本号比较。 */
export function snapshotReferenceIdentity(value:unknown):value is string {
 return typeof value==='string'&&value.length>0&&value.trim()===value
  &&Array.from(value).every(character=>{const code=character.codePointAt(0)??0;return code<0xD800||code>0xDFFF})
}
/** 固定成员只读自身数据属性，拒绝额外键、访问器、符号及类实例。 */
export function snapshotReferenceFields(value:unknown,keys:readonly string[],error:string):Record<string,unknown> {
 if(value===null||typeof value!=='object'||Array.isArray(value)
  ||Object.getPrototypeOf(value)!==Object.prototype&&Object.getPrototypeOf(value)!==null
  ||Reflect.ownKeys(value).length!==keys.length)throw Error(error)
 const entries:Array<[string,unknown]>=[]
 for(const key of keys){
  const descriptor=Object.getOwnPropertyDescriptor(value,key)
  if(descriptor?.enumerable!==true||!Object.hasOwn(descriptor,'value'))throw Error(error)
  entries.push([key,descriptor.value])
 }
 return Object.fromEntries(entries)
}
/** 只读取自身记录供分项业务校验；未在此声称记录的所有业务成员均已验证。 */
export function snapshotReferenceRecord(value:unknown,error:string):Record<string,unknown> {
 if(value===null||typeof value!=='object')throw Error(error)
 const keys=Reflect.ownKeys(value)
 if(keys.some(key=>typeof key!=='string'))throw Error(error)
 return snapshotReferenceFields(value,keys.filter((key):key is string=>typeof key==='string'),error)
}
/** 不把缺项、稀疏项或访问器当成空组，也不经for-of执行成员getter。 */
export function visitSnapshotReferences(value:unknown,visit:(item:unknown)=>void,error:string):void {
 if(!Array.isArray(value)||Reflect.ownKeys(value).length!==value.length+1)throw Error(error)
 for(let index=0;index<value.length;index++){
  const descriptor=Object.getOwnPropertyDescriptor(value,String(index))
  if(descriptor?.enumerable!==true||!Object.hasOwn(descriptor,'value'))throw Error(error)
  visit(descriptor.value)
 }
}
