import {expect,it} from 'vitest'
import {hashContentSubtrees,SUBTREE_HASH_CONTRACT} from '@/services/smart-bid/content/hashes/content-subtree-hash'
import vectors from '../../../../../support/fixtures/smart-bid/content-subtree-hash-v1.json'

const nodes=vectors.nodes
it('uses child index order independently of returned row order and carries a versioned contract',async()=>{
 expect(SUBTREE_HASH_CONTRACT).toBe('spark-bid.content-subtree/1')
 const result=await hashContentSubtrees({projectId:'P',nodes})
 expect(await hashContentSubtrees({projectId:'P',nodes:[...nodes].reverse()})).toEqual(result)
 expect(result.map(row=>row.nodeId)).toEqual(['A','B','C','D','H'])
 expect(Object.isFrozen(result)).toBe(true);expect(result.every(Object.isFrozen)).toBe(true)
})
it('matches independently computed Python SHA256 vectors',async()=>{
 expect(await hashContentSubtrees({projectId:'P',nodes:vectors.nodes})).toEqual(vectors.subtreeHashes)
})
it('changes ancestor subtree hashes after a descendant payload change while leaving unrelated siblings unchanged',async()=>{
 const before=await hashContentSubtrees({projectId:'P',nodes})
 const after=await hashContentSubtrees({projectId:'P',nodes:nodes.map(node=>node.nodeId==='A'?{...node,nodeHash:'f'.repeat(64)}:node)})
 const hash=(rows:typeof before,id:string)=>rows.find(row=>row.nodeId===id)?.subtreeHash
 for(const id of ['A','C','D'])expect(hash(after,id)).not.toBe(hash(before,id))
 for(const id of ['H','B'])expect(hash(after,id)).toBe(hash(before,id))
})
it('captures all node and position inputs before asynchronous hashing',async()=>{
 const original=nodes.map(node=>({...node})),expected=await hashContentSubtrees({projectId:'P',nodes:original})
 const pending=hashContentSubtrees({projectId:'P',nodes:original})
 original[0]!.nodeHash='f'.repeat(64);original[3]!.index=200
 expect(await pending).toEqual(expected)
})
it('keeps an empty project root empty and rejects invalid tree/hash inputs',async()=>{
 expect(await hashContentSubtrees({projectId:'P',nodes:[]})).toEqual([])
 await expect(hashContentSubtrees({projectId:'P',nodes:nodes.map(node=>node.nodeId==='H'?{...node,nodeHash:'bad'}:node)})).rejects.toThrow('CONTENT_SUBTREE_NODE_HASH')
 await expect(hashContentSubtrees({projectId:'P',nodes:nodes.slice(0,2)})).rejects.toThrow('CONTENT_SUBTREE_STRUCTURE')
})
