/**
 * @module app:services/smart-bid/operation/operation-choice-decision
 * 职责：按同一次运行、目标和成果版本的条件取证裁决排他分支。
 * 边界：不解释when、不执行脚本、不查询或写入；不证明证据真实或授予业务决定权。
 * AI用途：运行负责人交已核条件记录后，确定执行、待核、冲突或必办项阻断。
 */
import {isRecord} from '@spark-appworks/spark-utils'

/** 运行条件的固定使用对象；artifactHash属于本次稿，不借用历史检查。 */
export type OperationChoiceContext=Readonly<{runId:string;targetId:string;artifactHash:string}>
/** 条件解释器或检查责任方的结果；未知不转成false，引用仍须由正式记录解析。 */
export type OperationConditionEvaluation=OperationChoiceContext&Readonly<{
 state:'CURRENT'|'PENDING'|'MISSING'|'STALE';value:boolean|null;evidenceRefs:readonly string[]
}>
/** required表示本次子树存在必办义务，须由路线及本次适用性核定，不只看容器自身。 */
export type OperationChoiceBranch=Readonly<{id:string;required:boolean;evaluation:OperationConditionEvaluation}>
/** branches顺序是已核路线index顺序，不按字母或证据时间另排。 */
export type OperationChoiceInput=OperationChoiceContext&Readonly<{branches:readonly OperationChoiceBranch[]}>
/** 纯裁决结果；EXECUTE仍须由运行负责人核交接并派发，不是已执行凭据。 */
export type OperationChoiceDecision=
 |Readonly<{status:'EXECUTE';selectedBranchId:string;skippedBranchIds:readonly string[]}>
 |Readonly<{status:'SKIP';skippedBranchIds:readonly string[]}>
 |Readonly<{status:'WAIT'|'CONFLICT'|'REQUIRED';branchIds:readonly string[]}>

function record(value:unknown,keys:readonly string[]):value is Record<string,unknown>{
 if(!isRecord(value))return false
 const prototype:unknown=Object.getPrototypeOf(value),descriptors=Object.getOwnPropertyDescriptors(value)
 return (prototype===Object.prototype||prototype===null)&&Reflect.ownKeys(value).length===keys.length
  &&keys.every(key=>descriptors[key]?.enumerable===true&&Object.hasOwn(descriptors[key]??{},'value'))
}
function list(value:unknown):value is readonly unknown[]{
 if(!Array.isArray(value)||Reflect.ownKeys(value).length!==value.length+1)return false
 for(let i=0;i<value.length;i++){
  const descriptor=Object.getOwnPropertyDescriptor(value,String(i))
  if(descriptor?.enumerable!==true||!Object.hasOwn(descriptor,'value'))return false
 }
 return true
}
function identity(value:unknown):value is string{return typeof value==='string'&&value.length>0&&value.trim()===value}
const contextKeys=['runId','targetId','artifactHash'] as const
function context(value:Record<string,unknown>):boolean{return contextKeys.every(key=>identity(value[key]))}
function evaluation(value:unknown):boolean {
 return record(value,[...contextKeys,'state','value','evidenceRefs'])&&context(value)
  &&typeof value['state']==='string'&&['CURRENT','PENDING','MISSING','STALE'].includes(value['state'])
  &&(value['value']===null||typeof value['value']==='boolean')
  &&list(value['evidenceRefs'])&&value['evidenceRefs'].every(identity)
}
function assertInput(value:unknown):asserts value is OperationChoiceInput {
 if(!record(value,[...contextKeys,'branches'])||!context(value)||!list(value['branches'])||!value['branches'].length)
  throw Error('OPERATION_CHOICE_MODEL')
 const ids=new Set<string>()
 for(const branch of value['branches']){
  if(!record(branch,['id','required','evaluation'])||!identity(branch['id'])||typeof branch['required']!=='boolean'
   ||!evaluation(branch['evaluation'])||ids.has(branch['id'].normalize('NFC')))throw Error('OPERATION_CHOICE_MODEL')
  ids.add(branch['id'].normalize('NFC'))
 }
}

/** 根据完整显式取证裁决，不把缺失、过期、跨稿或无引用的结果当作可跳过依据。 */
export function decideOperationChoice(input:OperationChoiceInput):OperationChoiceDecision {
 assertInput(input)
 const waiting=input.branches.filter(branch=>{
  const result=branch.evaluation
  return result.state!=='CURRENT'||result.value===null||!result.evidenceRefs.length
   ||contextKeys.some(key=>result[key]!==input[key])
 })
 if(waiting.length)return {status:'WAIT',branchIds:waiting.map(branch=>branch.id)}
 const selected=input.branches.filter(branch=>branch.evaluation.value===true)
 if(selected.length>1)return {status:'CONFLICT',branchIds:selected.map(branch=>branch.id)}
 const skipped=input.branches.filter(branch=>branch.evaluation.value===false),required=skipped.filter(branch=>branch.required)
 if(required.length)return {status:'REQUIRED',branchIds:required.map(branch=>branch.id)}
 const winner=selected[0],skippedBranchIds=skipped.map(branch=>branch.id)
 return winner?{status:'EXECUTE',selectedBranchId:winner.id,skippedBranchIds}:{status:'SKIP',skippedBranchIds}
}
