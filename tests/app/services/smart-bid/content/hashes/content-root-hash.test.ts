import {createHash} from 'node:crypto'
import {expect,it} from 'vitest'
import {CONTENT_ROOT_HASH_CONTRACT,hashContentRoot} from '@/services/smart-bid/content/hashes/content-root-hash'

const hash=(char:string)=>char.repeat(64)
const input={projectId:'P',nodes:[{nodeId:'B',nodeHash:hash('b')},{nodeId:'A',nodeHash:hash('a')}],
 factTableHash:hash('c'),requirementPinHash:hash('d'),responseSetHash:hash('e')}
it('uses a versioned root with node hashes in stable node identity order',async()=>{
 const vector=JSON.stringify([CONTENT_ROOT_HASH_CONTRACT,'P',[hash('a'),hash('b')],hash('c'),hash('d'),hash('e')])
 const expected=createHash('sha256').update(vector,'utf8').digest('hex')
 expect(await hashContentRoot(input)).toBe(expected)
 expect(await hashContentRoot({...input,nodes:[...input.nodes].reverse()})).toBe(expected)
})
it('changes for each known business digest, even with the same nodes',async()=>{
 const original=await hashContentRoot(input)
 for(const field of ['factTableHash','requirementPinHash','responseSetHash'] as const)
  expect(await hashContentRoot({...input,[field]:hash('f')})).not.toBe(original)
})
it('requires complete component digests and rejects duplicate nodes',async()=>{
 await expect(hashContentRoot({...input,factTableHash:''})).rejects.toThrow('CONTENT_ROOT_HASH_COMPONENT')
 await expect(hashContentRoot({...input,nodes:[input.nodes[0],input.nodes[0]]})).rejects.toThrow('CONTENT_ROOT_HASH_DUPLICATE_NODE')
})
