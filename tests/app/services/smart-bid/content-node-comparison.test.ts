import {expect,it} from 'vitest'
import {compareContentNodeVersions} from '@/services/smart-bid/content-node-comparison'

const node=(value='原文')=>({nodeId:'N',parentId:'P',index:0,type:'paragraph',class:[],value,data:{}})
it('compares canonical payloads rather than trusting supplied hash metadata',()=>{
 const b=node(),result=compareContentNodeVersions({basis:b,current:{...b,hash:'current'},candidate:{...b,value:'修改',hash:'current'}})
 expect(result.presence).toBe('PRESENT')
 expect(result.content).toBe('CANDIDATE_ONLY')
 expect(result.conflicts).toEqual([])
 expect(result.requiresCurrentBasisChecks).toBe(true)
})
it('keeps current-only or identical changes without treating equality as business approval',()=>{
 const b=node(),o=node('当前')
 expect(compareContentNodeVersions({basis:b,current:o,candidate:b}).content).toBe('CURRENT_ONLY')
 expect(compareContentNodeVersions({basis:b,current:o,candidate:o}).content).toBe('SAME_CHANGE')
 expect(compareContentNodeVersions({basis:b,current:o,candidate:o}).requiresCurrentBasisChecks).toBe(true)
})
it('reports different concurrent content changes',()=>{
 expect(compareContentNodeVersions({basis:node(),current:node('甲'),candidate:node('乙')}).conflicts).toContain('CONTENT')
})
it.each([true,false])('separates a parent move from content editing, current move=%s',currentMoves=>{
 const b=node(),moved={...b,parentId:'Q'},edited=node('新内容')
 const result=compareContentNodeVersions({basis:b,current:currentMoves?moved:edited,candidate:currentMoves?edited:moved})
 expect(result.conflicts).toEqual([])
 expect(result.parent).toBe(currentMoves?'CURRENT_ONLY':'CANDIDATE_ONLY')
 expect(result.content).toBe(currentMoves?'CANDIDATE_ONLY':'CURRENT_ONLY')
 expect(result.requiresSiblingOrderReview).toBe(true)
})
it('conflicts on different parent moves but does not mistake index values for complete sibling-order knowledge',()=>{
 const b=node()
 expect(compareContentNodeVersions({basis:b,current:{...b,parentId:'Q'},candidate:{...b,parentId:'S'}}).conflicts).toContain('PARENT')
 const order=compareContentNodeVersions({basis:b,current:{...b,index:1},candidate:{...b,index:2}})
 expect(order.position).toBe('DIVERGED')
 expect(order.requiresSiblingOrderReview).toBe(true)
 expect(order.conflicts).not.toContain('CONTENT')
})
it('requires an explicit deletion reference check and exposes every reported referrer',()=>{
 const b=node()
 const pending=compareContentNodeVersions({basis:b,current:b,candidate:null})
 expect(pending.presence).toBe('CANDIDATE_DELETION')
 expect(pending.deletionReferenceCheck).toBe('REQUIRED')
 const used=compareContentNodeVersions({basis:b,current:b,candidate:null,deletionReferencedBy:['A','B']})
 expect(used.deletionReferenceCheck).toBe('REFERENCED')
 expect(used.conflicts).toContain('REFERENCED_DELETE')
 expect(used.referencedBy).toEqual(['A','B'])
 expect(compareContentNodeVersions({basis:b,current:b,candidate:null,deletionReferencedBy:[]}).deletionReferenceCheck).toBe('CLEAR')
})
it('conflicts on delete versus edit in either direction and preserves a current deletion when the candidate is unchanged',()=>{
 const b=node()
 expect(compareContentNodeVersions({basis:b,current:node('改'),candidate:null}).conflicts).toContain('DELETE_EDIT')
 expect(compareContentNodeVersions({basis:b,current:null,candidate:node('改')}).conflicts).toContain('DELETE_EDIT')
 expect(compareContentNodeVersions({basis:b,current:null,candidate:b}).conflicts).toEqual([])
})
it('distinguishes missing, unilateral and concurrent additions or deletions',()=>{
 const n=node()
 expect(compareContentNodeVersions({basis:null,current:null,candidate:null}).presence).toBe('ABSENT')
 expect(compareContentNodeVersions({basis:null,current:null,candidate:n}).presence).toBe('CANDIDATE_ADDITION')
 expect(compareContentNodeVersions({basis:null,current:n,candidate:null}).presence).toBe('CURRENT_ADDITION')
 expect(compareContentNodeVersions({basis:null,current:n,candidate:n}).conflicts).toEqual([])
 expect(compareContentNodeVersions({basis:null,current:n,candidate:node('不同')}).conflicts).toContain('ADD_COLLISION')
 expect(compareContentNodeVersions({basis:n,current:null,candidate:null}).presence).toBe('CONCURRENT_DELETION')
})
it('rejects unloaded snapshots and mismatched exact node identities, and reports immutable type changes',()=>{
 const n=node()
 expect(()=>compareContentNodeVersions({basis:n,current:undefined,candidate:n})).toThrow('CONTENT_NODE_SNAPSHOT_REQUIRED')
 expect(()=>compareContentNodeVersions({basis:n,current:n,candidate:{...n,nodeId:'OTHER'}})).toThrow('CONTENT_NODE_IDENTITY_MISMATCH')
 expect(compareContentNodeVersions({basis:n,current:n,candidate:{...n,type:'heading'}}).conflicts).toContain('TYPE_CHANGED')
})
it('does not mutate input or rewrite exact identities, and treats NFC-only text differences as equal',()=>{
 const b={...node('é'),nodeId:'e\u0301'},t={...b,value:'e\u0301'},before=structuredClone(b)
 const result=compareContentNodeVersions({basis:b,current:b,candidate:t})
 expect(result.content).toBe('UNCHANGED')
 expect(result.nodeId).toBe('e\u0301')
 expect(b).toEqual(before)
 expect(()=>compareContentNodeVersions({basis:b,current:b,candidate:{...t,nodeId:'é'}})).toThrow('CONTENT_NODE_IDENTITY_MISMATCH')
})
it('preserves exact parent references independently of canonical hashes for moves, delete/edit and concurrent adds',()=>{
 const b={...node(),parentId:'e\u0301'},t={...b,parentId:'é'}
 const moved=compareContentNodeVersions({basis:b,current:b,candidate:t})
 expect(moved.parent).toBe('CANDIDATE_ONLY')
 expect(moved.requiresSiblingOrderReview).toBe(true)
 expect(compareContentNodeVersions({basis:b,current:null,candidate:t}).conflicts).toContain('DELETE_EDIT')
 expect(compareContentNodeVersions({basis:b,current:t,candidate:null}).conflicts).toContain('DELETE_EDIT')
 expect(compareContentNodeVersions({basis:null,current:b,candidate:t}).conflicts).toContain('ADD_COLLISION')
})
it('ignores revision-level format metadata while explicitly requiring full snapshot and basis validation',()=>{
 const b=node(),o={...b,templateRefs:['NEW_TEMPLATE']}
 const result=compareContentNodeVersions({basis:b,current:o,candidate:b})
 expect(result.content).toBe('UNCHANGED')
 expect(result.requiresFullSnapshotValidation).toBe(true)
 expect(result.requiresCurrentBasisChecks).toBe(true)
})
it('rejects malformed reference evidence without evaluating array getters',()=>{
 let reads=0
 const refs:string[]=[]
 Object.defineProperty(refs,'0',{enumerable:true,get:()=>{reads++;return 'REF'}})
 expect(()=>compareContentNodeVersions({basis:node(),current:node(),candidate:null,deletionReferencedBy:refs})).toThrow('CONTENT_NODE_REFERENCE_CHECK')
 expect(reads).toBe(0)
 expect(()=>compareContentNodeVersions({basis:node(),current:node(),candidate:null,deletionReferencedBy:['']})).toThrow('CONTENT_NODE_REFERENCE_CHECK')
})
