import {createHash} from 'node:crypto'
import {expect,it} from 'vitest'
import {previewContentTextPatch} from '@/services/smart-bid/content/content-text-patch'

const owner={kind:'NODE' as const,nodeId:'N'}
const digest=(value:string)=>createHash('sha256').update(value,'utf8').digest('hex')
const node=(value:string)=>({nodeId:'N',parentId:'P',index:0,type:'paragraph',class:[],value,data:{}})
const span=(value:string,revisionId:string,start:number,end:number)=>({schemaVersion:2,projectId:'P',revisionId,owner,path:'/value',start,end,unit:'utf16',textDigest:digest(value.slice(start,end))})
const command=(source:string,target:string,changes:unknown[])=>({projectId:'P',candidateRevisionId:'C',expectedHead:'H',
 sources:[{owner,object:node(source)}],targets:[{owner,object:node(target)}],changes})
it('applies disjoint replacements simultaneously using the same original head coordinates',async()=>{
 const source='甲乙丙丁',target='abcdef'
 const changes=[{operation:'replace',sourceRef:span(source,'C',0,2),targetRef:span(target,'H',1,2)},
  {operation:'replace',sourceRef:span(source,'C',2,4),targetRef:span(target,'H',4,5)}]
 const result=await previewContentTextPatch(command(source,target,changes))
 expect(result.patches[0]?.before).toBe('abcdef')
 expect(result.patches[0]?.after).toBe('a甲乙cd丙丁f')
 expect(result.patches[0]?.parts.map(part=>[part.resultStart,part.resultEnd])).toEqual([[1,3],[5,7]])
 expect(result.requiresMergedSnapshotValidation).toBe(true)
 expect(result).not.toHaveProperty('adoptAllowed')
})
it('distinguishes insertion from deletion without inventing a deletion source',async()=>{
 const source='新',target='旧文'
 const result=await previewContentTextPatch(command(source,target,[
  {operation:'delete',targetRef:span(target,'H',0,1)},
  {operation:'insert',sourceRef:span(source,'C',0,1),targetRef:span(target,'H',2,2)}]))
 expect(result.patches[0]?.after).toBe('文新')
 expect(result.requiresDeletionDifferenceChecks).toBe(true)
 await expect(previewContentTextPatch(command(source,target,[{operation:'delete',sourceRef:span(source,'C',0,1),targetRef:span(target,'H',0,1)}]))).rejects.toThrow()
})
it('rejects overlap and same-position inserts rather than choosing an implicit order',async()=>{
 const source='XY',target='abcd'
 const replacement={operation:'replace',sourceRef:span(source,'C',0,1),targetRef:span(target,'H',0,3)}
 await expect(previewContentTextPatch(command(source,target,[replacement,{operation:'delete',targetRef:span(target,'H',2,4)}]))).rejects.toThrow('OVERLAP')
 const insert={operation:'insert',sourceRef:span(source,'C',0,1),targetRef:span(target,'H',1,1)}
 await expect(previewContentTextPatch(command(source,target,[insert,insert]))).rejects.toThrow('ORDER')
 await expect(previewContentTextPatch(command(source,target,[replacement,insert]))).rejects.toThrow('OVERLAP')
})
it('rejects empty replacement ends, stale source or head versions',async()=>{
 const source='X',target='a'
 for(const change of [
  {operation:'replace',sourceRef:span(source,'C',0,0),targetRef:span(target,'H',0,1)},
  {operation:'replace',sourceRef:span(source,'OLD',0,1),targetRef:span(target,'H',0,1)},
  {operation:'replace',sourceRef:span(source,'C',0,1),targetRef:span(target,'OLD',0,1)}
 ])await expect(previewContentTextPatch(command(source,target,[change]))).rejects.toThrow()
})
it('rejects cross-owner text substitution even when both objects are available',async()=>{
 const source='X',target='a',otherOwner={kind:'NODE' as const,nodeId:'OTHER'}
 const change={operation:'replace',sourceRef:{...span(source,'C',0,1),owner:otherOwner},targetRef:span(target,'H',0,1)}
 const c=command(source,target,[change])
 c.sources.push({owner:otherOwner,object:{...node(source),nodeId:'OTHER'}})
 await expect(previewContentTextPatch(c)).rejects.toThrow('OWNER')
})
it('does not mutate source or target objects',async()=>{
 const source='新',target='旧',c=command(source,target,[{operation:'replace',sourceRef:span(source,'C',0,1),targetRef:span(target,'H',0,1)}]),before=structuredClone(c)
 await previewContentTextPatch(c)
 expect(c).toEqual(before)
})
it('keeps whole-result binding checks even when only the concatenation forms a placeholder',async()=>{
 const source='{}',target='{名字}'
 const result=await previewContentTextPatch(command(source,target,[
  {operation:'insert',sourceRef:span(source,'C',0,1),targetRef:span(target,'H',1,1)},
  {operation:'insert',sourceRef:span(source,'C',1,2),targetRef:span(target,'H',4,4)}]))
 expect(result.patches[0]?.after).toBe('{{名字}}')
 expect(result.requiresFieldBindingChecks).toBe(true)
})
it('does not leave async digest rejections behind when a later change has an invalid operation',async()=>{
 const source='X',target='a'
 const changes=[{operation:'replace',sourceRef:{...span(source,'C',0,1),textDigest:'0'.repeat(64)},targetRef:span(target,'H',0,1)},
  {operation:'bad',targetRef:span(target,'H',0,1)}]
 await expect(previewContentTextPatch(command(source,target,changes))).rejects.toThrow('OPERATION')
 await new Promise(resolve=>setTimeout(resolve,20))
})
it('previews a new response version against the same assignment in the current head',async()=>{
 const sourceOwner={kind:'RESPONSE' as const,assignmentId:'A',responseId:'V2'},targetOwner={kind:'RESPONSE' as const,assignmentId:'A',responseId:'V1'}
 const result=await previewContentTextPatch({projectId:'P',candidateRevisionId:'C',expectedHead:'H',
  sources:[{owner:sourceOwner,object:{assignmentId:'A',responseId:'V2',statement:'新答复',data:{}}}],
  targets:[{owner:targetOwner,object:{assignmentId:'A',responseId:'V1',statement:'旧答复',data:{}}}],
  changes:[{operation:'replace',sourceRef:{...span('新答复','C',0,1),owner:sourceOwner,path:'/statement'},
   targetRef:{...span('旧答复','H',0,1),owner:targetOwner,path:'/statement'}}]})
 expect(result.patches[0]?.after).toBe('新答复')
 expect(result.patches[0]?.parts[0]?.sourceRef?.owner).toEqual(sourceOwner)
 expect(result.patches[0]?.owner).toEqual(targetOwner)
})
