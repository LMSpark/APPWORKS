/**
 * @module app:services/smart-bid/operation/guides/operation-guide-discovery
 * 职责：第01项在当前根的可达目录内核正式指南与动作引用。
 * 边界：发现可达动作并保留定义身份，调用许可由原执行上下文确认。
 * AI用途：定位目录为什么显示或过滤某个工艺动作。
 */
import {CLASS_MODEL_TOOL_NAMES,type ClassModelRuntime} from '@spark-appworks/spark-ai/class-model'
import {isRecord} from '@spark-appworks/spark-utils'
import {snapshotReferenceIdentity as identity} from '../../content/references/snapshot-reference-values'
import {readOperationActionGuide} from './operation-action-guide'

/** 目录可达动作及其原始定义引用。 */
type Entry=Readonly<{guideRef:string;versionRef:string;guideDigest:string;kind:string;actionName:string;pathRefs:readonly string[];
 materialRefs:readonly string[];assertCurrent:()=>void}>

/** 正式目录条目与 ClassModel 可达动作相交，只交引用供第02项继续核验。 */
export async function discoverOperationGuides(runtime:Pick<ClassModelRuntime,'executeTool'>,source:Readonly<{
 rootKind:string;entries:readonly Entry[];assertCurrent:()=>void
}>){
 const {rootKind}=source,entries=[...source.entries]
 const assertCurrent=()=>{source.assertCurrent();for(const entry of entries)entry.assertCurrent()}
 assertCurrent()
 const error='OPERATION_GUIDE_DISCOVERY_SCOPE'
 const seen=new Set<string>()
 if(!identity(rootKind))throw Error(error)
 const candidates=entries.map(entry=>{
  const {guideRef,versionRef,guideDigest,kind,actionName}=entry
  const pathRefs=Object.freeze([...entry.pathRefs]),materialRefs=Object.freeze([...entry.materialRefs])
  const key=JSON.stringify([guideRef,versionRef,kind,actionName])
  if(![guideRef,versionRef,kind,actionName,...pathRefs,...materialRefs].every(identity)||seen.has(key)||!pathRefs.length||
   !/^[a-f0-9]{64}$/u.test(guideDigest))
   throw Error(error)
  seen.add(key)
  return {guideRef,versionRef,guideDigest,kind,actionName,pathRefs,materialRefs}
 })
 const query=await runtime.executeTool(CLASS_MODEL_TOOL_NAMES.query,{includeMembers:true})
 assertCurrent()
 const models=isRecord(query.data)?query.data['models']:undefined
 if(!query.ok||!isRecord(query.data)||query.data['rootKind']!==rootKind||!Array.isArray(models))throw Error(error)
 const methods=new Map<string,Set<string>>()
 const modelEntries:readonly unknown[]=models
 for(const model of modelEntries){
  if(!isRecord(model)||!identity(model['kind'])||!Array.isArray(model['methods'])||methods.has(model['kind']))throw Error(error)
  const names=new Set<string>()
  const methodEntries:readonly unknown[]=model['methods']
  for(const method of methodEntries){
   if(!isRecord(method)||!identity(method['name']))throw Error(error)
   names.add(method['name'])
  }
  methods.set(model['kind'],names)
 }
 const items=candidates.map(entry=>Object.freeze({...entry,
  state:methods.get(entry.kind)?.has(entry.actionName)===true?'REACHABLE':'DEFINITION_REQUIRED'}))
 return Object.freeze({rootKind,items:Object.freeze(items),assertCurrent})
}

/** 第02项只重开明确选中的可达候选，按目录原版摘要核读。 */
export async function readDiscoveredOperationGuide(runtime:Pick<ClassModelRuntime,'executeTool'>,
 discovery:Awaited<ReturnType<typeof discoverOperationGuides>>,selection:Pick<Entry,'guideRef'|'versionRef'|'kind'|'actionName'>){
 discovery.assertCurrent()
 const item=discovery.items.find(candidate=>candidate.guideRef===selection.guideRef&&candidate.versionRef===selection.versionRef&&
  candidate.kind===selection.kind&&candidate.actionName===selection.actionName)
 if(item?.state!=='REACHABLE')throw Error('OPERATION_GUIDE_SELECTION_UNAVAILABLE')
 const {guideRef,guideDigest,kind,actionName}=item
 const action=await readOperationActionGuide(runtime,{
  rootKind:discovery.rootKind,guideRef,guideDigest,kind,actionName,assertCurrent:discovery.assertCurrent,
 })
 return Object.freeze({...action,versionRef:item.versionRef,pathRefs:item.pathRefs,materialRefs:item.materialRefs})
}
