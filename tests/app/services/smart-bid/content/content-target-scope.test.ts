import {expect,it} from 'vitest'
import {resolveContentTargetScope} from '@/services/smart-bid/content/content-target-scope'

const basisNodes=[{nodeId:'book',parentId:'P',index:0,type:'document'},{nodeId:'chapter',parentId:'book',index:0,type:'chapter'},
 {nodeId:'title',parentId:'chapter',index:0,type:'heading'},{nodeId:'text',parentId:'chapter',index:1,type:'paragraph'}]
const responses=[{projectId:'P',assignmentId:'A',responseId:'R'},{projectId:'P',assignmentId:'B',responseId:null}]
const scope=(targets:unknown[])=>({schemaVersion:2,projectId:'P',targets})
const resolve=(targets:unknown[])=>resolveContentTargetScope({projectId:'P',scope:scope(targets),basisNodes,responses})
it('resolves only a node or its explicitly declared subtree in the fixed basis',()=>{
 expect(resolve([{kind:'NODE',nodeId:'chapter',extent:'NODE'}]).nodeIds).toEqual(['chapter'])
 expect(resolve([{kind:'NODE',nodeId:'chapter',extent:'SUBTREE'}]).nodeIds).toEqual(['chapter','text','title'])
})
it('rejects overlapping or duplicate scopes instead of silently combining them',()=>{
 expect(()=>resolve([{kind:'NODE',nodeId:'chapter',extent:'SUBTREE'},{kind:'NODE',nodeId:'text',extent:'NODE'}])).toThrow('OVERLAP')
 expect(()=>resolve([{kind:'PROJECT'},{kind:'NODE',nodeId:'text',extent:'NODE'}])).toThrow('OVERLAP')
 expect(()=>resolve([{kind:'RESPONSE',assignmentId:'A',responseId:'R'},{kind:'RESPONSE',assignmentId:'A',responseId:'R'}])).toThrow('OVERLAP')
})
it('allows distinct node-only targets and independent responses without fake chapters',()=>{
 const result=resolve([{kind:'NODE',nodeId:'chapter',extent:'NODE'},{kind:'NODE',nodeId:'text',extent:'NODE'},{kind:'RESPONSE',assignmentId:'A',responseId:'R'}])
 expect(result.nodeIds).toEqual(['chapter','text'])
 expect(result.responseTargets).toEqual([{assignmentId:'A',responseId:'R'}])
 expect(result.requiresCurrentAuthorityChecks).toBe(true)
 expect(result.requiresAdditionScopeChecks).toBe(true)
})
it('accepts an explicit project root for an empty first draft',()=>{
 const result=resolveContentTargetScope({projectId:'P',scope:scope([{kind:'PROJECT'}]),basisNodes:[],responses:[]})
 expect(result.projectWide).toBe(true)
 expect(result.nodeIds).toEqual([])
})
it('requires the actual existing response identity and explicit null for a first response',()=>{
 expect(resolve([{kind:'RESPONSE',assignmentId:'B',responseId:null}]).responseTargets).toEqual([{assignmentId:'B',responseId:null}])
 expect(()=>resolve([{kind:'RESPONSE',assignmentId:'A',responseId:null}])).toThrow('RESPONSE')
 expect(()=>resolve([{kind:'RESPONSE',assignmentId:'A',responseId:'other'}])).toThrow('RESPONSE')
 expect(()=>resolve([{kind:'RESPONSE',assignmentId:'B'}])).toThrow()
})
it.each([
 [],[{kind:'NODE',nodeId:'text'}],[{kind:'NODE',nodeId:'new',extent:'NODE'}],
 [{kind:'NODE',nodeId:'text',extent:'SUBTREE',admin:true}],
 [{kind:'RESPONSE',assignmentId:'unknown',responseId:null}],[{kind:'PROJECT',projectId:'OTHER'}]
].map(targets=>({targets})))('rejects incomplete, invented, or broadened scope $targets',({targets})=>{
 expect(()=>resolve(targets)).toThrow()
})
it('does not accept a different project or an old schema version',()=>{
 expect(()=>resolveContentTargetScope({projectId:'OTHER',scope:scope([{kind:'PROJECT'}]),basisNodes:[],responses:[]})).toThrow('PROJECT')
 expect(()=>resolveContentTargetScope({projectId:'P',scope:{...scope([{kind:'PROJECT'}]),schemaVersion:1},basisNodes:[],responses:[]})).toThrow('SCHEMA')
})
it('does not execute target getters or accept sparse target arrays',()=>{
 let reads=0
 const target={kind:'NODE',extent:'NODE'}
 Object.defineProperty(target,'nodeId',{enumerable:true,get(){reads++;return 'text'}})
 expect(()=>resolve([target])).toThrow()
 expect(reads).toBe(0)
 expect(()=>resolve(Array(1))).toThrow()
})
it('checks response ownership and rejects ambiguous assignment records',()=>{
 const input={projectId:'P',scope:scope([{kind:'RESPONSE',assignmentId:'A',responseId:'R'}]),basisNodes}
 expect(()=>resolveContentTargetScope({...input,responses:[{projectId:'OTHER',assignmentId:'A',responseId:'R'}]})).toThrow('RESPONSE')
 expect(()=>resolveContentTargetScope({...input,responses:[responses[0]!,responses[0]!]})).toThrow('RESPONSE')
})
it('does not silently select independent responses with the project content root',()=>{
 expect(resolve([{kind:'PROJECT'}]).responseTargets).toEqual([])
 const result=resolve([{kind:'PROJECT'},{kind:'RESPONSE',assignmentId:'A',responseId:'R'}])
 expect(result.projectWide).toBe(true)
 expect(result.responseTargets).toEqual([{assignmentId:'A',responseId:'R'}])
})
it('captures the fixed basis once without executing node identity accessors',()=>{
 let reads=0
 const basis=structuredClone(basisNodes)
 Object.defineProperty(basis[0],'nodeId',{enumerable:true,get(){reads++;return 'book'}})
 expect(()=>resolveContentTargetScope({projectId:'P',scope:scope([{kind:'PROJECT'}]),basisNodes:basis,responses})).toThrow()
 expect(reads).toBe(0)
})
