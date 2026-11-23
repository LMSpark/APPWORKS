/**
 * @module app:services/smart-bid/operation/guides/operation-guide-discovery
 * 职责：第01项在当前根的可达目录内核正式指南与动作引用。
 * 边界：发现可达动作并保留定义身份，调用许可由原执行上下文确认。
 * AI用途：定位目录为什么显示或过滤某个工艺动作。
 */
import {CLASS_MODEL_TOOL_NAMES,type ClassModelRuntime} from '@spark-appworks/spark-ai/class-model'
import {isRecord} from '@spark-appworks/spark-utils'
import {snapshotReferenceIdentity as identity} from '../../content/references/snapshot-reference-values'
import {hashCanonicalSnapshotText} from '../../content/revision-snapshot-hash'
import {readOperationActionGuide} from './operation-action-guide'

/** ClassModel 方法即指南正式定义；引用和版本由模型、动作及指南文本确定。 */
type Entry=Readonly<{guideRef:string;versionRef:string;guideDigest:string;kind:string;actionName:string;pathRefs:readonly string[];
 materialRefs:readonly string[];state:'REACHABLE';assertCurrent:()=>void}>
type EntryInput=Readonly<Omit<Entry,'state'>>

/** 直接从当前根 ClassModel 发现可达动作，并以 actionGuide 文本生成固定版本。 */
export async function discoverOperationGuides(runtime:Pick<ClassModelRuntime,'executeTool'>,source:Readonly<{
 rootKind:string;directoryRef?:string;entries?:readonly EntryInput[];assertCurrent:()=>void
}>){
 const {rootKind}=source
 const assertCurrent=()=>source.assertCurrent()
 assertCurrent()
 const error='OPERATION_GUIDE_DISCOVERY_SCOPE'
 if(!identity(rootKind))throw Error(error)
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
 const declared=source.entries
 if(declared){
  const items=declared.map(entry=>Object.freeze({
   ...entry,state:methods.get(entry.kind)?.has(entry.actionName)===true?'REACHABLE' as const:'DEFINITION_REQUIRED' as const,
  }))
  return Object.freeze({rootKind,items:Object.freeze(items),assertCurrent})
 }
 const items:Entry[]=[]
 for(const [kind,names] of methods){
  for(const actionName of names){
   assertCurrent()
   const guide=await runtime.executeTool(CLASS_MODEL_TOOL_NAMES.actionGuide,{kind,actionName})
   assertCurrent()
   if(!guide.ok||typeof guide.data!=='string'||!guide.data.trim())throw Error(error)
   const guideDigest=await hashCanonicalSnapshotText(guide.data)
   const guideRef=`${kind}.${actionName}`
   items.push(Object.freeze({
    guideRef,versionRef:guideDigest,guideDigest,kind,actionName,
    pathRefs:Object.freeze(source.directoryRef?[source.directoryRef]:[]),
    materialRefs:Object.freeze([guideRef]),state:'REACHABLE',assertCurrent,
   }))
  }
 }
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
