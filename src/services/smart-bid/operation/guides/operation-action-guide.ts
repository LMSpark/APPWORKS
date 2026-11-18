/**
 * @module app:services/smart-bid/operation/guides/operation-action-guide
 * 职责：第02项沿当前 ClassModel 根读取原动作指南并核固定版本摘要。
 */
import {CLASS_MODEL_TOOL_NAMES,type ClassModelRuntime} from '@spark-appworks/spark-ai/class-model'
import {isRecord} from '@spark-appworks/spark-utils'
import {snapshotReferenceIdentity as identity} from '../../content/references/snapshot-reference-values'
import {hashCanonicalSnapshotText} from '../../content/revision-snapshot-hash'

/** 根实例与指南版本由已核绑定提供；读取能力不授予动作执行权限。 */
export async function readOperationActionGuide(runtime:Pick<ClassModelRuntime,'executeTool'>,source:Readonly<{
 rootKind:string;kind:string;actionName:string;guideRef:string;guideDigest:string;assertCurrent:()=>void
}>){
 source.assertCurrent()
 const {rootKind,kind,actionName,guideRef,guideDigest}=source
 if(![rootKind,kind,actionName,guideRef].every(identity)||!/^[a-f0-9]{64}$/u.test(guideDigest))
  throw Error('OPERATION_ACTION_GUIDE_SCOPE')
 const catalog=await runtime.executeTool(CLASS_MODEL_TOOL_NAMES.query,{kind,includeMembers:true})
 source.assertCurrent()
 const models=isRecord(catalog.data)?catalog.data['models']:undefined
 if(!catalog.ok||!isRecord(catalog.data)||catalog.data['rootKind']!==rootKind||!Array.isArray(models)||
  models.length!==1||!isRecord(models[0])||models[0]['kind']!==kind)throw Error('OPERATION_ACTION_GUIDE_UNREACHABLE')
 const methods=models[0]['methods']
 if(!Array.isArray(methods)||!methods.some((method:unknown)=>isRecord(method)&&method['name']===actionName))
  throw Error('OPERATION_ACTION_GUIDE_UNREACHABLE')
 const result=await runtime.executeTool(CLASS_MODEL_TOOL_NAMES.actionGuide,{kind,actionName})
 if(!result.ok||typeof result.data!=='string'||await hashCanonicalSnapshotText(result.data)!==guideDigest)
  throw Error('OPERATION_ACTION_GUIDE_VERSION')
 source.assertCurrent()
 return Object.freeze({rootKind,kind,actionName,guideRef,guideDigest,guide:result.data,assertCurrent:()=>source.assertCurrent()})
}
