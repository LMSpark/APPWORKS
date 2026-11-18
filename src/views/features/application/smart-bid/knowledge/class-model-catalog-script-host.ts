/**
 * @module app:views/features/application/smart-bid/knowledge/class-model-catalog-script-host
 * 职责：页17读取当前授权 ClassModel 根实例的定义目录。
 */
import {CLASS_MODEL_TOOL_NAMES,type ClassModelRuntime} from '@spark-appworks/spark-ai/class-model'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {isRecord} from '@spark-appworks/spark-utils'
import {snapshotReferenceIdentity as identity} from '@/services/smart-bid/content/references/snapshot-reference-values'

/** 目录只从本次已绑定的模型运行实例读取。 */
export function createBidClassModelCatalogHost<Runtime extends Pick<PageRuntime,'generation'|'isLoaded'|'destroyed'>>(
 runtime:Runtime,classModel:Pick<ClassModelRuntime,'executeTool'>,scope:Readonly<{rootKind:string;assertCurrent:()=>void}>){
 const {rootKind}=scope
 return {runtime,assertCurrent:scope.assertCurrent,async invoke(name:string,input:unknown,signal:AbortSignal){
  const error='BID_CLASS_MODEL_CATALOG_SCOPE'
  if(name!=='bid.models.readCatalog'||!isRecord(input)||Object.keys(input).length!==0||!identity(rootKind))throw Error(error)
  const generation=runtime.generation
  const assertCurrent=()=>{
   scope.assertCurrent()
   if(signal.aborted||runtime.destroyed||!runtime.isLoaded||runtime.generation!==generation)throw Error('BID_CLASS_MODEL_CATALOG_STALE')
  }
  assertCurrent()
  const result=await classModel.executeTool(CLASS_MODEL_TOOL_NAMES.query,{includeMembers:true})
  assertCurrent()
  if(!result.ok||!isRecord(result.data)||result.data['rootKind']!==rootKind||!Array.isArray(result.data['models']))throw Error(error)
  const seen=new Set<string>()
  const models=Array.from<unknown>(result.data['models']).map(model=>{
   if(!isRecord(model)||!identity(model['kind'])||!Array.isArray(model['methods'])||seen.has(model['kind']))throw Error(error)
   const kind=model['kind'],methods=new Set<string>()
   for(const method of Array.from<unknown>(model['methods'])){
    if(!isRecord(method)||!identity(method['name'])||methods.has(method['name']))throw Error(error)
    methods.add(method['name'])
   }
   seen.add(kind)
   return Object.freeze({kind,methods:Object.freeze([...methods])})
  })
  return Object.freeze({rootKind,models:Object.freeze(models),assertCurrent,async readGuide(kind:string,actionName?:string){
   assertCurrent()
   const model=models.find(item=>item.kind===kind)
   if(!model||(actionName!==undefined&&!model.methods.includes(actionName)))throw Error(error)
   const guide=actionName===undefined
    ?await classModel.executeTool(CLASS_MODEL_TOOL_NAMES.modelGuide,{kind})
    :await classModel.executeTool(CLASS_MODEL_TOOL_NAMES.actionGuide,{kind,actionName})
   assertCurrent()
   if(!guide.ok||typeof guide.data!=='string'||!guide.data.trim())throw Error('BID_CLASS_MODEL_GUIDE_REQUIRED')
   return Object.freeze({kind,actionName,guide:guide.data,assertCurrent})
  }})
 }}
}
