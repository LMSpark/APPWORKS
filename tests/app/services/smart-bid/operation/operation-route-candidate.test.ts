import {expect,it} from 'vitest'
import {readOperationRouteCandidate} from '@/services/smart-bid/operation/operation-route-candidate'

const root=()=>({id:'R',parentId:null,index:0,type:'route',class:[],value:'编制',data:{}})
const task=()=>({id:'T',parentId:'R',index:0,type:'task',class:['write'],value:'起草',data:{stationRef:'draft',maxTimes:'2'}})
it('returns a detached, explicit JSON model without rewriting identities or mixing presentation',()=>{
 const input={nodes:[root(),task()]},result=readOperationRouteCandidate(input)
 expect(result).toEqual(input)
 expect(result).not.toBe(input)
 expect(result.nodes[0]).not.toBe(input.nodes[0])
 expect(JSON.parse(JSON.stringify(result))).toEqual(input)
})
it.each(['## 工艺报告','```json\n{"nodes":[]}\n```','{"nodes":[]}'])('refuses text instead of a materialized JSON model',value=>{
 expect(()=>readOperationRouteCandidate(value)).toThrow('OPERATION_ROUTE_JSON_MODEL')
})
it.each(['markdown','html','style','templateRefs','report'])('refuses unexpected root member %s',key=>{
 expect(()=>readOperationRouteCandidate({nodes:[root(),task()],[key]:'legacy'})).toThrow('OPERATION_ROUTE_JSON_MODEL')
})
it.each(['children','content','blocks','fontSize','pageBreak'])('refuses old or presentation node member %s',key=>{
 expect(()=>readOperationRouteCandidate({nodes:[root(),{...task(),[key]:'legacy'}]})).toThrow('OPERATION_ROUTE_NODE_MODEL')
})
it('rejects invalid payload and tree rather than repairing it into an apparently successful output',()=>{
 expect(()=>readOperationRouteCandidate({nodes:[root(),{...task(),data:{stationRef:'draft',maxTimes:2}}]})).toThrow('OPERATION_ROUTE_NODE_MODEL')
 expect(()=>readOperationRouteCandidate({nodes:[root(),{...task(),value:'\uD800'}]})).toThrow('OPERATION_ROUTE_CANDIDATE')
 expect(()=>readOperationRouteCandidate({nodes:[root(),{...task(),parentId:'MISSING'}]})).toThrow('OPERATION_ROUTE_CANDIDATE')
})
it('rejects accessors before reading model fields',()=>{
 let reads=0
 const value=Object.defineProperty({},'nodes',{enumerable:true,get:()=>{reads++;return [root(),task()]}})
 expect(()=>readOperationRouteCandidate(value)).toThrow('OPERATION_ROUTE_JSON_MODEL')
 expect(reads).toBe(0)
})
it.each([{fontSize:'12'},{stationRef:'draft',pageBreak:true},{stationRef:'draft',required:'true'},{stationRef:'draft',maxTimes:'1.5'}])('rejects presentation or invalid control data %j',data=>{
 expect(()=>readOperationRouteCandidate({nodes:[root(),{...task(),data}]})).toThrow('OPERATION_ROUTE_NODE_MODEL')
})
it('rejects node-array accessors without evaluating them and rejects non-JSON array members',()=>{
 let reads=0
 const nodes:unknown[]=[]
 Object.defineProperty(nodes,'0',{enumerable:true,get:()=>{reads++;return root()}})
 expect(()=>readOperationRouteCandidate({nodes})).toThrow('OPERATION_ROUTE_JSON_MODEL')
 expect(reads).toBe(0)
 const extra=Object.assign([root(),task()],{markdown:'legacy'})
 expect(()=>readOperationRouteCandidate({nodes:extra})).toThrow('OPERATION_ROUTE_JSON_MODEL')
})
it('rejects class-array accessors before canonicalization or snapshotting can read different values',()=>{
 let reads=0
 const classes:unknown[]=[]
 Object.defineProperty(classes,'0',{enumerable:true,get:()=>{reads++;return reads<3?'write':123}})
 expect(()=>readOperationRouteCandidate({nodes:[root(),{...task(),class:classes}]})).toThrow('OPERATION_ROUTE_NODE_MODEL')
 expect(reads).toBe(0)
 expect(()=>readOperationRouteCandidate({nodes:[root(),{...task(),class:Object.assign(['write'],{style:'legacy'})}]})).toThrow('OPERATION_ROUTE_NODE_MODEL')
})
