import {expect,it,vi} from 'vitest'
import craft from '@/services/smart-bid/craft/route-compose-v1.json'
import {readOperationRouteCandidate} from '@/services/smart-bid/operation/operation-route-candidate'
import {resolveContentTargetScope} from '@/services/smart-bid/content/content-target-scope'
import {previewOperationRoute} from '@/services/smart-bid/operation/operation-route-preview'
import {readComposedOperationRouteCandidate} from '@/services/smart-bid/operation/operation-station-fit'
import {verifyDispatchedOperationRouteReturn,verifyOperationRouteReturn} from '@/services/smart-bid/operation/operation-route-return'
import {verifyOriginalOperationRouteDispatch} from '@/services/smart-bid/operation/operation-route-dispatch-evidence'
import {canonicalSnapshotValue,hashCanonicalSnapshotText} from '@/services/smart-bid/content/revision-snapshot-hash'
import {freezeOperationRouteContext} from '@/services/smart-bid/operation/operation-route-context'
import {recoverOperationRouteAttempt} from '@/services/smart-bid/operation/operation-route-recovery'
import {readOperationActionGuide} from '@/services/smart-bid/operation/guides/operation-action-guide'

it('accepts only the original complete attempt and the JSON candidate that fits its catalog',async()=>{
 const scope={runId:'RUN',attemptRef:'TRY',requestKey:'Q',projectId:'P',targetDigest:'a'.repeat(64),configurationLockHash:'b'.repeat(64)}
 const receipt={...scope,receiptRef:'RESULT',assertCurrent:()=>{}}
 const source={catalog:{stationRefs:craft.inputExample.stationCatalog.map(station=>station.ref),routeRefs:[]},
  match:()=>true,assertCurrent:()=>{}}
 await expect(verifyOperationRouteReturn(scope,{...receipt,state:'INVALID' as 'PARTIAL'},source))
  .rejects.toThrow('OPERATION_ROUTE_RETURN_SCOPE')
 expect(await verifyOperationRouteReturn(scope,{...receipt,state:'PARTIAL'},source)).toMatchObject({state:'PARTIAL'})
 expect(await verifyOperationRouteReturn(scope,{...receipt,state:'COMPLETE',output:craft.outputExample},source))
  .toMatchObject({state:'VERIFIED_CANDIDATE',receiptRef:'RESULT'})
 await expect(verifyOperationRouteReturn(scope,{...receipt,attemptRef:'OLD',state:'COMPLETE',output:craft.outputExample},source))
  .rejects.toThrow('OPERATION_ROUTE_RETURN_SCOPE')
 await expect(verifyOperationRouteReturn(scope,{...receipt,state:'COMPLETE',output:'## 编制路线'},source))
  .rejects.toThrow('OPERATION_ROUTE_JSON_MODEL')
 const actualInputDigest=await hashCanonicalSnapshotText(canonicalSnapshotValue(craft.inputExample))
 const guideDigest=await hashCanonicalSnapshotText('原工艺指南')
 const action=await readOperationActionGuide({executeTool:async name=>name==='model_query'?
  {ok:true,data:{rootKind:'ROOT',models:[{kind:'ROUTE',methods:[{name:'compose'}]}]}}:{ok:true,data:'原工艺指南'}},
 {rootKind:'ROOT',kind:'ROUTE',actionName:'compose',guideRef:'GUIDE',guideDigest,assertCurrent:source.assertCurrent})
 const manifestGuide={action,guideVersionRef:'GV1',createdAt:'2026-11-18T10:00:00+08:00',
  slots:Object.keys(craft.inputExample).map(slotId=>({slotId,required:true}))}
 const provenance=Object.entries(craft.inputExample).map(([slotId,value])=>({slotId,value,state:'ALLOWED' as const,
  sourceRef:'SOURCE',versionRef:'V1',useRef:'USE',assertCurrent:source.assertCurrent}))
 await expect(freezeOperationRouteContext(scope,{...manifestGuide,slots:manifestGuide.slots.map(slot=>({
  ...slot,required:undefined as unknown as boolean,
 }))},provenance)).rejects.toThrow('OPERATION_ROUTE_CONTEXT_SCOPE')
 const manifest=await freezeOperationRouteContext(scope,manifestGuide,provenance)
 expect(manifest).toMatchObject({usable:true,inputDigest:actualInputDigest})
 const selected=provenance.map((item,index)=>index===0?{...item,requirementRead:{lineageId:'CLAUSE',version:'V1'}}:item)
 const withRequirement=await freezeOperationRouteContext(scope,manifestGuide,selected)
 expect(withRequirement.requirementReads).toEqual([{lineageId:'CLAUSE',version:'V1',fieldPath:provenance[0]?.slotId}])
 expect(withRequirement.manifestDigest).not.toBe(manifest.manifestDigest)
 expect(withRequirement.inputDigest).toBe(manifest.inputDigest)
 await expect(freezeOperationRouteContext(scope,manifestGuide,provenance.map(item=>
  ({...item,requirementRead:{lineageId:'CLAUSE',version:'V2'}})))).rejects.toThrow('OPERATION_ROUTE_CONTEXT_SCOPE')
 const missing=await freezeOperationRouteContext(scope,manifestGuide,provenance.slice(1))
 expect(missing).toMatchObject({usable:false,inputJson:null,inputDigest:null})
 const evidence={expectedInputDigest:actualInputDigest,assertCurrent:source.assertCurrent}
 const sent={...scope,dispatchRef:'SENT',state:'DISPATCH_RECORDED' as const,actualInputDigest,assertCurrent:source.assertCurrent}
 expect(await verifyOriginalOperationRouteDispatch(scope,sent,evidence)).toMatchObject({state:'MATCHED',inputJson:null})
 expect(await verifyOriginalOperationRouteDispatch(scope,{...sent,input:craft.inputExample},evidence))
  .toMatchObject({state:'MATCHED',inputJson:canonicalSnapshotValue(craft.inputExample)})
 await expect(verifyOriginalOperationRouteDispatch(scope,{...sent,input:{other:true}},evidence))
  .rejects.toThrow('OPERATION_ROUTE_DISPATCH_DIGEST')
 await expect(verifyOriginalOperationRouteDispatch(scope,{...sent,configurationLockHash:'0'.repeat(64)},evidence))
  .rejects.toThrow('OPERATION_ROUTE_DISPATCH_SCOPE')
 const dispatch=await verifyOriginalOperationRouteDispatch(scope,sent,evidence)
 const response={...receipt,state:'COMPLETE' as const,output:craft.outputExample}
 const guide={...source,guideVersionRef:'GV1',guideRef:'GUIDE',guideDigest,configurationLockHash:scope.configurationLockHash,assertGuideCurrent:action.assertCurrent}
 expect(await verifyDispatchedOperationRouteReturn(dispatch,response,guide))
  .toMatchObject({state:'VERIFIED_CANDIDATE',dispatchRef:'SENT',guideRef:'GUIDE',actualInputDigest})
 const mismatch=await verifyOriginalOperationRouteDispatch(scope,sent,{...evidence,expectedInputDigest:'0'.repeat(64)})
 expect(await verifyDispatchedOperationRouteReturn(mismatch,response,guide)).toMatchObject({state:'DISPATCH_EVIDENCE_REQUIRED'})
 await expect(verifyDispatchedOperationRouteReturn(dispatch,response,{...guide,configurationLockHash:'0'.repeat(64)}))
  .rejects.toThrow('OPERATION_ROUTE_RETURN_GUIDE_SCOPE')
 const readResult=vi.fn(async()=>response)
 const recovery={readDispatch:async()=>sent,readResult,guide,assertCurrent:source.assertCurrent}
 expect(await recoverOperationRouteAttempt(manifest,{...recovery,readDispatch:async()=>undefined}))
  .toMatchObject({state:'DISPATCH_UNKNOWN'})
 let emptyResultCurrent=true
 const empty=await recoverOperationRouteAttempt(manifest,{...recovery,readDispatch:async()=>({...scope,state:'UNKNOWN',
  assertCurrent:()=>{if(!emptyResultCurrent)throw Error('ORIGINAL_DISPATCH_REFRESHED')}})})
 expect(empty).toMatchObject({state:'DISPATCH_UNKNOWN'})
 emptyResultCurrent=false
 expect(()=>empty.assertCurrent()).toThrow('ORIGINAL_DISPATCH_REFRESHED')
 expect(await recoverOperationRouteAttempt(manifest,{...recovery,
  readDispatch:async()=>({...sent,actualInputDigest:'0'.repeat(64),input:undefined})}))
  .toMatchObject({state:'DISPATCH_EVIDENCE_REQUIRED'})
 expect(readResult).not.toHaveBeenCalled()
 expect(await recoverOperationRouteAttempt(manifest,recovery)).toMatchObject({state:'VERIFIED_CANDIDATE',
  result:{dispatchRef:'SENT',guideRef:'GUIDE'},actualRequirementReads:null})
 expect(await recoverOperationRouteAttempt(withRequirement,recovery)).toMatchObject({state:'VERIFIED_CANDIDATE',actualRequirementReads:null})
 const verifiedDispatch={...recovery,readDispatch:async()=>({...sent,input:craft.inputExample})}
 expect(await recoverOperationRouteAttempt(withRequirement,verifiedDispatch)).toMatchObject({state:'VERIFIED_CANDIDATE',
  actualRequirementReads:[{lineageId:'CLAUSE',version:'V1',fieldPath:provenance[0]?.slotId,callRef:'SENT',resultRef:'RESULT'}]})
 expect(await recoverOperationRouteAttempt({...withRequirement,requirementReads:[{
  fieldPath:'missingField',lineageId:'CLAUSE',version:'V1',
 }]},verifiedDispatch)).toMatchObject({state:'VERIFIED_CANDIDATE',actualRequirementReads:null})
 expect(await recoverOperationRouteAttempt(withRequirement,{...verifiedDispatch,readResult:async()=>({...receipt,state:'PARTIAL'})}))
  .toMatchObject({state:'PARTIAL',actualRequirementReads:null})
 expect(readResult).toHaveBeenCalledWith(scope)
 await expect(recoverOperationRouteAttempt(manifest,{...recovery,guide:{...guide,guideDigest:'0'.repeat(64)}}))
  .rejects.toThrow('OPERATION_ROUTE_RETURN_GUIDE_SCOPE')
})

it('keeps a draft prompt, exact slots and sample tied to the existing native JSON model',()=>{
 expect(craft.status).toBe('DRAFT_NOT_PUBLISHED')
 const names=[...craft.prompt.user.matchAll(/\{\{([^{}]+)\}\}/gu)].map(match=>match[1])
 expect(names).toEqual(craft.prompt.slots)
 expect(craft.prompt.slots.every(slot=>craft.inputExample.recipeSlots.includes(slot))).toBe(true)
 expect(craft.validator).toBe('readComposedOperationRouteCandidate')
 const stationRefs=craft.inputExample.stationCatalog.map(station=>station.ref)
 const fits=new Map([['EXAMPLE_RETRIEVE_V1','gather'],['EXAMPLE_GENERATE_V1','write'],['EXAMPLE_VALIDATE_V1','review']])
 const output=readComposedOperationRouteCandidate(craft.outputExample,
  {stationRefs,routeRefs:craft.inputExample.routeCatalog},
  (ref,classes)=>classes.length===1&&classes[0]===fits.get(ref))
 expect(output.nodes).toHaveLength(5)
})
it('rejects old document or format output rather than repairing it into a candidate',()=>{
 expect(()=>readOperationRouteCandidate('## 编制路线')).toThrow('OPERATION_ROUTE_JSON_MODEL')
 expect(()=>readOperationRouteCandidate({...craft.outputExample,markdown:'旧报告'})).toThrow('OPERATION_ROUTE_JSON_MODEL')
 const nodes=structuredClone(craft.outputExample.nodes)
 Object.assign(nodes[2]!,{fontSize:'12'})
 expect(()=>readOperationRouteCandidate({nodes})).toThrow('OPERATION_ROUTE_NODE_MODEL')
})
it('uses a target example accepted by the actual fixed-basis scope contract',()=>{
 const scope=resolveContentTargetScope({projectId:'EXAMPLE_PROJECT',scope:craft.inputExample.targetScope,responses:[],basisNodes:[
  {nodeId:'EXAMPLE_BOOK',parentId:'EXAMPLE_PROJECT',index:0,type:'document'},
  {nodeId:'EXAMPLE_CHAPTER',parentId:'EXAMPLE_BOOK',index:0,type:'chapter'},
  {nodeId:'EXAMPLE_HEADING',parentId:'EXAMPLE_CHAPTER',index:0,type:'heading'},
 ]})
 expect(scope.nodeIds).toContain('EXAMPLE_CHAPTER')
 expect(scope.requiresCurrentAuthorityChecks).toBe(true)
})
it('gives every sample task an explicit operation classification instead of inheriting unrelated root or sequence classes',()=>{
 const preview=previewOperationRoute({nodes:craft.outputExample.nodes})
 expect(preview.errors).toEqual([])
 expect(preview.taskClasses).toEqual([
  {taskId:'retrieve',sourceId:'retrieve',classes:['gather']},
  {taskId:'generate',sourceId:'generate',classes:['write']},
  {taskId:'validate',sourceId:'validate',classes:['review']},
 ])
})
it('rejects a structurally valid task whose station is outside the supplied catalog',()=>{
 const sample=structuredClone(craft.outputExample)
 Object.assign(sample.nodes[2]!.data,{stationRef:'NOT_IN_THIS_CATALOG'})
 const catalog={stationRefs:craft.inputExample.stationCatalog.map(item=>item.ref)}
 expect(()=>readOperationRouteCandidate(sample,catalog)).toThrow('OPERATION_ROUTE_STATION_OUTSIDE_CATALOG')
 expect(readOperationRouteCandidate(craft.outputExample,catalog).nodes).toHaveLength(5)
})
it('matches a call against the exact supplied route version regardless of JSON object key order',()=>{
 const sample={nodes:[craft.outputExample.nodes[0],{
  id:'call',parentId:'r',index:0,type:'call',class:[],value:'核验',data:{routeRef:{key:'R',version:'002'}}
 }]}
 const stationRefs:string[]=[]
 expect(()=>readOperationRouteCandidate(sample,{stationRefs,routeRefs:[{key:'R',version:'2'}]})).toThrow('OPERATION_ROUTE_CALL_OUTSIDE_CATALOG')
 expect(()=>readOperationRouteCandidate(sample,{stationRefs,routeRefs:[]})).toThrow('OPERATION_ROUTE_CALL_OUTSIDE_CATALOG')
 expect(readOperationRouteCandidate(sample,{stationRefs,routeRefs:[{version:'002',key:'R'}]})).toEqual(sample)
})
