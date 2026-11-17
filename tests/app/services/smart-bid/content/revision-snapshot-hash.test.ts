import {readFileSync} from 'node:fs'
import {expect,it} from 'vitest'
import {canonicalRevisionSnapshot,hashRevisionSnapshot} from '@/services/smart-bid/content/revision-snapshot-hash'

const vectors=JSON.parse(readFileSync('tests/support/fixtures/smart-bid/revision-snapshot-hash-v1.json','utf8')).vectors
for(const sample of vectors)it(`matches independent canonical bytes and SHA256: ${sample.name}`,async()=>{
 expect(canonicalRevisionSnapshot(sample.input)).toBe(sample.canonical)
 expect(new TextEncoder().encode(canonicalRevisionSnapshot(sample.input)).length).toBe(sample.utf8Bytes)
 expect(await hashRevisionSnapshot(sample.input)).toBe(sample.sha256)
})
it('covers every manifest group and preserves array order and exact reference strings',async()=>{
 const base=vectors[0].input,hash=await hashRevisionSnapshot(base)
 for(const key of ['stageRef','templateRefs','requirementPins','responseAssignments','responses','qualificationReviews','sensitiveRefs']){
  const changed={...base,[key]:key==='stageRef'?{decisionId:'OTHER'}:[{ref:'A'}]}
  expect(await hashRevisionSnapshot(changed)).not.toBe(hash)
 }
 expect(await hashRevisionSnapshot({...base,responses:[{ref:'A'},{ref:'B'}]})).not.toBe(await hashRevisionSnapshot({...base,responses:[{ref:'B'},{ref:'A'}]}))
 expect(await hashRevisionSnapshot({...base,baselineId:'e\u0301'})).not.toBe(await hashRevisionSnapshot({...base,baselineId:'é'}))
})
it('requires the persisted hash contract and refuses unsupported JSON without coercion',()=>{
 const base=vectors[0].input,missing={...base};delete missing.hashContract
 expect(()=>canonicalRevisionSnapshot(missing)).toThrow()
 expect(()=>canonicalRevisionSnapshot({...base,hashContract:'future'})).toThrow()
 for(const value of [NaN,Infinity,undefined,BigInt(1),new Date(),'\uD800',()=>true])
  expect(()=>canonicalRevisionSnapshot({...base,stageRef:{value}})).toThrow()
 const cycle:Record<string,unknown>={};cycle['self']=cycle
 expect(()=>canonicalRevisionSnapshot({...base,stageRef:cycle})).toThrow()
})
it('does not execute accessors and rejects sparse or extended arrays',()=>{
 const base=vectors[0].input;let reads=0
 const ref=Object.defineProperty({},'key',{enumerable:true,get:()=>{reads++;return 'A'}})
 expect(()=>canonicalRevisionSnapshot({...base,stageRef:ref})).toThrow();expect(reads).toBe(0)
 expect(()=>canonicalRevisionSnapshot({...base,responses:new Array(1)})).toThrow()
 expect(()=>canonicalRevisionSnapshot({...base,responses:Object.assign([],{extra:'x'})})).toThrow()
})
it('captures canonical bytes before asynchronous hashing without normalizing keys or numeric encoding',async()=>{
 const input=structuredClone(vectors[0].input),pending=hashRevisionSnapshot(input)
 input.baselineId='CHANGED'
 expect(await pending).toBe(vectors[0].sha256)
 const text=canonicalRevisionSnapshot({...vectors[0].input,stageRef:{ratio:1e-7,large:1e21,zero:-0,'é':'A','e\u0301':'B'}})
 expect(text).toContain('"large":1e+21');expect(text).toContain('"ratio":1e-7');expect(text).toContain('"zero":0')
 expect(text).toContain('"e\u0301":"B"');expect(text).toContain('"é":"A"')
})
