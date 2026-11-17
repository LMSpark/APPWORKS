import {expect,it} from 'vitest'
import craft from '@/services/smart-bid/craft/route-compose-v1.json'
import {readOperationRouteCandidate} from '@/services/smart-bid/operation/operation-route-candidate'
import {resolveContentTargetScope} from '@/services/smart-bid/content/content-target-scope'
import {previewOperationRoute} from '@/services/smart-bid/operation/operation-route-preview'
import {readComposedOperationRouteCandidate} from '@/services/smart-bid/operation/operation-station-fit'

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
