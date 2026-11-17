import {expect,it} from 'vitest'
import {compareContentTreeSnapshots} from '@/services/smart-bid/content-tree-comparison'

const node=(nodeId:string,parentId:string,index:number,type:string,value='')=>({nodeId,parentId,index,type,value,class:[],data:{}})
const tree=()=>[node('book','P',0,'document'),node('chapter','book',0,'chapter'),node('heading','chapter',0,'heading','标题'),
 node('A','chapter',1,'paragraph','甲'),node('B','chapter',2,'paragraph','乙'),node('C','chapter',3,'paragraph','丙')]
it('compares complete trees without turning diagnostics into adoption permission',()=>{
 const basis=tree(),candidate=tree().map(n=>n.nodeId==='A'?{...n,value:'候选'}:n),before=structuredClone(candidate)
 const result=compareContentTreeSnapshots({projectId:'P',basis,current:tree(),candidate})
 expect(result.nodes.find(n=>n.nodeId==='A')?.content).toBe('CANDIDATE_ONLY')
 expect(result.nodes).toHaveLength(6)
 expect(result.requiresCurrentBasisChecks).toBe(true)
 expect(candidate).toEqual(before)
 expect(result).not.toHaveProperty('mergedNodes')
})
it('accepts the empty initial basis and preserves newly proposed structure',()=>{
 const result=compareContentTreeSnapshots({projectId:'P',basis:[],current:[],candidate:tree()})
 expect(result.nodes.every(n=>n.presence==='CANDIDATE_ADDITION')).toBe(true)
 expect(result.siblings.find(n=>n.parentId==='P')?.requiresPresenceResolution).toBe(true)
})
it('rejects a locally valid deletion that leaves an invalid complete tree',()=>{
 expect(()=>compareContentTreeSnapshots({projectId:'P',basis:tree(),current:tree(),candidate:tree().filter(n=>n.nodeId!=='heading')})).toThrow('CHAPTER_HEADING')
})
it('does not interpret absent complete input or sparse arrays as node deletion',()=>{
 expect(()=>compareContentTreeSnapshots({projectId:'P',basis:tree(),current:undefined,candidate:[]})).toThrow('SNAPSHOT')
 expect(()=>compareContentTreeSnapshots({projectId:'P',basis:tree(),current:tree(),candidate:Array(2)})).toThrow('SNAPSHOT')
})
it('exposes deletion reference checks rather than assuming an empty index',()=>{
 const candidate=tree().filter(n=>n.nodeId!=='C')
 const result=compareContentTreeSnapshots({projectId:'P',basis:tree(),current:tree(),candidate})
 expect(result.nodes.find(n=>n.nodeId==='C')?.deletionReferenceCheck).toBe('REQUIRED')
})
it('compares full sibling sequences and reports two incompatible reorderings',()=>{
 const reordered=(order:string[])=>tree().map(n=>order.includes(n.nodeId)?{...n,index:order.indexOf(n.nodeId)+1}:n)
 const result=compareContentTreeSnapshots({projectId:'P',basis:tree(),current:reordered(['C','A','B']),candidate:reordered(['B','A','C'])})
 expect(result.siblings.find(n=>n.parentId==='chapter')?.status).toBe('CONFLICT')
})
it('rejects cross-version normalized identity aliases rather than pairing a different node',()=>{
 const basis=tree().map(n=>n.nodeId==='A'?{...n,nodeId:'é'}:n)
 const candidate=tree().map(n=>n.nodeId==='A'?{...n,nodeId:'e\u0301'}:n)
 expect(()=>compareContentTreeSnapshots({projectId:'P',basis,current:basis,candidate})).toThrow('IDENTITY')
})
it('never executes a snapshot element getter',()=>{
 let reads=0
 const candidate=tree()
 Object.defineProperty(candidate,'0',{get(){reads++;return tree()[0]},enumerable:true})
 expect(()=>compareContentTreeSnapshots({projectId:'P',basis:tree(),current:tree(),candidate})).toThrow('SNAPSHOT')
 expect(reads).toBe(0)
})
it('checks immutable node type across otherwise independently valid trees',()=>{
 const candidate=tree().map(n=>n.nodeId==='A'?{...n,type:'raw',class:['legacy']}:n)
 const result=compareContentTreeSnapshots({projectId:'P',basis:tree(),current:tree(),candidate})
 expect(result.nodes.find(n=>n.nodeId==='A')?.conflicts).toContain('TYPE_CHANGED')
})
it('does not lose current edits when the candidate deletes the same node',()=>{
 const current=tree().map(n=>n.nodeId==='C'?{...n,value:'人工新改'}:n)
 const result=compareContentTreeSnapshots({projectId:'P',basis:tree(),current,candidate:tree().filter(n=>n.nodeId!=='C')})
 expect(result.nodes.find(n=>n.nodeId==='C')?.conflicts).toContain('DELETE_EDIT')
})
it('uses sibling indices rather than physical array order',()=>{
 const result=compareContentTreeSnapshots({projectId:'P',basis:tree(),current:tree().reverse(),candidate:tree()})
 expect(result.nodes.every(n=>n.content==='UNCHANGED')).toBe(true)
 expect(result.siblings.every(n=>n.status==='UNCHANGED')).toBe(true)
})
it('reports actual reference owners and dangling candidate targets without claiming external checks complete',()=>{
 const basis=tree().map(n=>n.nodeId==='A'?{...n,value:'见{{后文}}',data:{后文:{type:'xref',nodeId:'C',show:'title'}}}:n)
 const result=compareContentTreeSnapshots({projectId:'P',basis,current:basis,candidate:basis.filter(n=>n.nodeId!=='C')})
 expect(result.linkChecks).toContainEqual({snapshot:'CURRENT',ownerNodeId:'A',path:['data','后文'],kind:'xref',targetNodeId:'C',targetExists:true})
 expect(result.linkChecks).toContainEqual({snapshot:'CANDIDATE',ownerNodeId:'A',path:['data','后文'],kind:'xref',targetNodeId:'C',targetExists:false})
 expect(result.requiresExternalReferenceChecks).toBe(true)
 expect(result.nodes.find(n=>n.nodeId==='C')?.deletionReferenceCheck).toBe('REQUIRED')
})
it('does not report a dangling reference when the candidate removes its binding too',()=>{
 const basis=tree().map(n=>n.nodeId==='A'?{...n,value:'见{{后文}}',data:{后文:{type:'page',nodeId:'C'}}}:n)
 const result=compareContentTreeSnapshots({projectId:'P',basis,current:basis,candidate:tree().filter(n=>n.nodeId!=='C')})
 expect(result.linkChecks.filter(link=>link.snapshot==='CANDIDATE')).toEqual([])
 expect(result.linkChecks.filter(link=>link.snapshot==='CURRENT')).toHaveLength(1)
})
