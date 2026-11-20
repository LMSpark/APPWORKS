import {expect,it} from 'vitest'
import {compareContentSiblingOrder} from '@/services/smart-bid/content-sibling-order'

const input=(current:readonly string[],candidate:readonly string[])=>({parentId:'P',basis:['A','B','C'],current,candidate})
it('retains unchanged and one-sided reorder without interpreting insertion indices',()=>{
 expect(compareContentSiblingOrder(input(['A','B','C'],['A','B','C'])).status).toBe('UNCHANGED')
 const current=compareContentSiblingOrder(input(['C','A','B'],['A','B','C']))
 expect(current.status).toBe('CURRENT_ORDER')
 expect(current.resolvedCommonOrder).toEqual(['C','A','B'])
 expect(compareContentSiblingOrder(input(['A','B','C'],['B','C','A'])).status).toBe('CANDIDATE_ORDER')
})
it('keeps identical concurrent reorder and rejects different concurrent reorder',()=>{
 expect(compareContentSiblingOrder(input(['C','A','B'],['C','A','B'])).status).toBe('SAME_ORDER')
 const conflict=compareContentSiblingOrder(input(['C','A','B'],['B','A','C']))
 expect(conflict.status).toBe('CONFLICT')
 expect(conflict.resolvedCommonOrder).toBeNull()
})
it('separates reorder from added membership and never silently drops inserted nodes',()=>{
 const result=compareContentSiblingOrder(input(['C','A','B'],['A','X','B','C']))
 expect(result.status).toBe('CURRENT_ORDER')
 expect(result.resolvedCommonOrder).toEqual(['C','A','B'])
 expect(result.candidateNewAtParent).toEqual(['X'])
 expect(result.requiresPresenceResolution).toBe(true)
})
it('reports missing membership without calling a missing node deleted',()=>{
 const result=compareContentSiblingOrder(input(['B','C'],['A','C','B']))
 expect(result.currentMissing).toEqual(['A'])
 expect(result.candidateMissing).toEqual([])
 expect(result.status).toBe('CANDIDATE_ORDER')
 expect(result.resolvedCommonOrder).toEqual(['C','B'])
 expect(result.requiresPresenceResolution).toBe(true)
})
it('does not claim a complete merge when no common nodes remain',()=>{
 const result=compareContentSiblingOrder({parentId:'P',basis:['A'],current:[],candidate:['NEW']})
 expect(result.resolvedCommonOrder).toEqual([])
 expect(result.currentMissing).toEqual(['A'])
 expect(result.candidateMissing).toEqual(['A'])
 expect(result.candidateNewAtParent).toEqual(['NEW'])
 expect(result.requiresPresenceResolution).toBe(true)
 expect(result.requiresFullSnapshotValidation).toBe(true)
 expect(result.requiresCurrentBasisChecks).toBe(true)
})
it('preserves exact identifiers and rejects duplicates, NFC aliases and self parenting',()=>{
 const exact={parentId:'P',basis:['e\u0301'],current:['e\u0301'],candidate:['e\u0301']}
 expect(compareContentSiblingOrder(exact).resolvedCommonOrder).toEqual(['e\u0301'])
 expect(()=>compareContentSiblingOrder({...exact,candidate:['é']})).toThrow('CONTENT_SIBLING_IDENTITY_ALIAS')
 expect(()=>compareContentSiblingOrder(input(['A','A','C'],['A','B','C']))).toThrow('CONTENT_SIBLING_DUPLICATE')
 expect(()=>compareContentSiblingOrder({parentId:'P',basis:['P'],current:['P'],candidate:['P']})).toThrow('CONTENT_SIBLING_SELF_PARENT')
})
it('rejects unloaded or malformed lists and does not execute array accessors',()=>{
 expect(()=>compareContentSiblingOrder({...input([],[]),current:undefined as unknown as string[]})).toThrow('CONTENT_SIBLING_ORDER_REQUIRED')
 const order:string[]=[];let reads=0
 Object.defineProperty(order,'0',{enumerable:true,get:()=>{reads++;return 'A'}})
 expect(()=>compareContentSiblingOrder({...input([],[]),current:order})).toThrow('CONTENT_SIBLING_ORDER_REQUIRED')
 expect(reads).toBe(0)
 expect(()=>compareContentSiblingOrder({...input([],[]),current:['\uD800']})).toThrow('CONTENT_SIBLING_ID')
})
it('does not mutate arrays or share result arrays with inputs',()=>{
 const value=input(['C','A','B'],['A','B','C']),before=structuredClone(value)
 const result=compareContentSiblingOrder(value)
 expect(value).toEqual(before)
 expect(result.resolvedCommonOrder).not.toBe(value.current)
})
