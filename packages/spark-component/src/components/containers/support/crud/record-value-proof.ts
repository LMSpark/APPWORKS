/**
 * @module @spark-appworks/spark-component:components/containers/support/crud/record-value-proof
 * 职责：捕获仅用于比较的原生值证明，区分缺失属性、undefined、NaN及嵌套成员变化。
 * 边界：只返回比较函数，不返回可编辑副本；不参与保存序列化。
 */
import {toRaw} from 'vue'
/** 保留原对象身份、属性存在性及叶值；不支持的可变容器明确拒绝。 */
export function recordValueProof(value:unknown): (current:unknown)=>boolean{
 const seen=new WeakSet<object>()
 function capture(source:unknown):(current:unknown)=>boolean{
  if(source===null||typeof source!=='object')return current=>Object.is(source,current)
  const original=toRaw(source)
  if(original instanceof Date){const time=original.getTime();return current=>current instanceof Date&&toRaw(current)===original&&Object.is(current.getTime(),time)}
  const prototype:unknown=Object.getPrototypeOf(original)
  if(!Array.isArray(original)&&prototype!==Object.prototype&&prototype!==null)throw Error('RECORD_EDIT_PROOF: 不支持该原生值类型的待提交状态核对')
  if(seen.has(original))return current=>current!==null&&typeof current==='object'&&toRaw(current)===original
  seen.add(original)
  const keys=Reflect.ownKeys(original),members=keys.map(key=>({key,equals:capture(Reflect.get(original,key))}))
  return current=>{
   if(current===null||typeof current!=='object'||toRaw(current)!==original)return false
   const currentKeys=Reflect.ownKeys(current)
   return currentKeys.length===keys.length&&keys.every(key=>Object.prototype.hasOwnProperty.call(current,key))&&members.every(member=>member.equals(Reflect.get(current,member.key)))
  }
 }
 return capture(value)
}
