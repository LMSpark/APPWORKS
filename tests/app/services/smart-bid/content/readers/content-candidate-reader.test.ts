import {expect,it} from 'vitest'
import {readCandidateContent} from '@/views/features/application/smart-bid/authoring/model/content-candidate-reader'
import {createCandidateReadFixture as fixture} from '../../../../../support/fixtures/smart-bid/content-candidate-fixture'

it('checks the source hash against the candidate baseline and revokes proof when the candidate snapshot changes',async()=>{
 const f=await fixture()
 const ref={runId:'RUN',type:'FORMAT',ordinal:0,recordVersion:'002',recordHash:'a'.repeat(64)}
 try{
  const candidate=await readCandidateContent(f.host,{candidateRevisionId:'C',expectedHead:null})
  await expect(candidate.readFixedTenderRecord({...ref,recordHash:'b'.repeat(64)})).rejects.toThrow('BASELINE_TENDER_RECORD_MISSING')
  expect(f.query.mock.calls.some(([view])=>view.dataTable?.tableName==='TenderRecord')).toBe(false)
  const binding=await candidate.readFixedTenderRecord(ref)
  expect(binding.dataViewKey).toBe('S@TenderRecord@selectedTenderRecord')
  expect(f.ds.getView('TenderRecord','selectedTenderRecord')!.rows[0]?.['payload']).toEqual({text:'核定原文'})
  binding.assertCurrent()
  await f.ds.getView('RevisionSnapshot','selectedSnapshot')!.refresh()
  expect(()=>binding.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
  expect(f.save).not.toHaveBeenCalled()
 }finally{f.ds.destroy()}
})

it('checks original candidate pins against its fixed baseline and invalidates the report after snapshot refresh',async()=>{
 const f=await fixture('valid-pin')
 try{
  const candidate=await readCandidateContent(f.host,{candidateRevisionId:'C',expectedHead:null})
  const report=await candidate.readRequirementPinIssues()
  expect(report.issues).toEqual([{chapterId:'C',lineageId:'L',version:'R1',reason:'VERSION_CHANGED',selectedVersion:'R2'}])
  expect(report.requiresRevisionMatchCheck).toBe(false);expect(report.requiresUseCheck).toBe(true)
  report.assertCurrent()
  expect(f.ds.getView('Baseline','selectedBaseline')!.queryContext).toMatchObject({projectId:'P',baselineId:'B'})
  await f.ds.getView('RevisionSnapshot','selectedSnapshot')!.refresh()
  expect(()=>report.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT');expect(f.save).not.toHaveBeenCalled()
 }finally{f.ds.destroy()}
})
it.each(['Baseline','TenderRecord'])('drops original tender evidence when the consumer leaves during %s query',async model=>{
 const f=await fixture()
 try{
  const candidate=await readCandidateContent(f.host,{candidateRevisionId:'C',expectedHead:null})
  const execute=f.query.getMockImplementation()!
  let current=true
  f.query.mockImplementation(async view=>{
   const result=await execute(view)
   if(view.dataTable?.tableName===model)current=false
   return result
  })
  await expect(candidate.readFixedTenderRecord({
   runId:'RUN',type:'FORMAT',ordinal:0,recordVersion:'002',recordHash:'a'.repeat(64),
  },()=>{if(!current)throw Error('CONSUMER_STALE')})).rejects.toThrow('CONSUMER_STALE')
  const requested=f.query.mock.calls.map(([view])=>view.dataTable?.tableName)
  expect(requested.filter(name=>name==='TenderRecord')).toHaveLength(model==='Baseline'?0:1)
  expect(f.save).not.toHaveBeenCalled()
 }finally{f.ds.destroy()}
})
it('checks the consumer before dispatch and after an in-flight fixed requirement baseline read',async()=>{
 const f=await fixture('valid-pin')
 try{
  const candidate=await readCandidateContent(f.host,{candidateRevisionId:'C',expectedHead:null}),before=f.query.mock.calls.length
  await expect(candidate.readRequirementPinIssues(()=>{throw Error('CONSUMER_STALE')})).rejects.toThrow('CONSUMER_STALE')
  expect(f.query).toHaveBeenCalledTimes(before)
  let current=true
  const execute=f.query.getMockImplementation()!
  f.query.mockImplementationOnce(async view=>{const result=await execute(view);current=false;return result})
  await expect(candidate.readRequirementPinIssues(()=>{if(!current)throw Error('CONSUMER_STALE')})).rejects.toThrow('CONSUMER_STALE')
  expect(f.save).not.toHaveBeenCalled()
 }finally{f.ds.destroy()}
})

it('composes the original revision and verified empty snapshot without manufacturing node queries',async()=>{
 const f=await fixture(),result=await readCandidateContent(f.host,{candidateRevisionId:'C',expectedHead:null})
 expect(result.revisions.candidateDataViewKey).toBe('S@ContentRevision@selectedCandidate')
 expect(result.snapshot.manifestHashVerified).toBe(true);expect(result.nodes.dataViewKey).toBeNull()
 expect(result.revisionMatchVerified).toBe(true);expect(result.requiresBusinessSectionChecks).toBe(true)
 result.assertCurrent();expect(f.query).toHaveBeenCalledTimes(3);expect(f.save).not.toHaveBeenCalled()
})
it.each(['baseline','stage','template','hidden'])('rejects incompatible or unreadable revision evidence: %s',async mode=>{
 const f=await fixture(mode);await expect(readCandidateContent(f.host,{candidateRevisionId:'C',expectedHead:null})).rejects.toThrow()
 expect(f.save).not.toHaveBeenCalled()
})
it('retains original query and host proofs after returning',async()=>{
 const f=await fixture(),result=await readCandidateContent(f.host,{candidateRevisionId:'C',expectedHead:null})
 await f.ds.getView('ContentRevision','selectedCandidate')!.refresh()
 expect(()=>result.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
 f.expire();expect(()=>result.assertCurrent()).toThrow('HOST_STALE')
})
it('keeps candidate, manifest and full member results simultaneously valid in the original runtime',async()=>{
 const f=await fixture('populated'),result=await readCandidateContent(f.host,{candidateRevisionId:'C',expectedHead:null})
 expect(result.nodes.dataViewKey).toBe('S@ContentNodeVersion@snapshotMembers');result.assertCurrent()
 expect(f.query).toHaveBeenCalledTimes(4);expect(f.save).not.toHaveBeenCalled()
 await f.ds.getView('RevisionSnapshot','selectedSnapshot')!.refresh()
 expect(()=>result.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
})
it('rejects a digest-correct snapshot whose template binding targets a heading instead of a document',async()=>{
 const f=await fixture('bad-template')
 await expect(readCandidateContent(f.host,{candidateRevisionId:'C',expectedHead:null})).rejects.toThrow('SNAPSHOT_TEMPLATE_DOCUMENT')
 expect(f.save).not.toHaveBeenCalled()
})
it('rejects a digest-correct requirement pin attached to a heading instead of a chapter',async()=>{
 const f=await fixture('bad-pin')
 await expect(readCandidateContent(f.host,{candidateRevisionId:'C',expectedHead:null})).rejects.toThrow('SNAPSHOT_REQUIREMENT_PIN_CHAPTER')
 expect(f.save).not.toHaveBeenCalled()
})
it('checks real chapter pin membership while leaving fixed baseline version/status checks explicit',async()=>{
 const f=await fixture('valid-pin'),result=await readCandidateContent(f.host,{candidateRevisionId:'C',expectedHead:null})
 expect(result.requirementBindingsVerified).toBe(true);expect(result.requiresRequirementVersionChecks).toBe(true)
 expect(result.requiresBusinessSectionChecks).toBe(true);result.assertCurrent()
 expect(f.query).toHaveBeenCalledTimes(4);expect(f.save).not.toHaveBeenCalled()
})
it('rejects a digest-correct chapter response anchored outside its own chapter',async()=>{
 const f=await fixture('bad-response')
 await expect(readCandidateContent(f.host,{candidateRevisionId:'C',expectedHead:null})).rejects.toThrow('SNAPSHOT_RESPONSE_ANCHOR')
 expect(f.save).not.toHaveBeenCalled()
})
it('rejects an independent answer whose placeholder has no structured binding',async()=>{
 const f=await fixture('bad-response-text')
 await expect(readCandidateContent(f.host,{candidateRevisionId:'C',expectedHead:null})).rejects.toThrow('SNAPSHOT_RESPONSE_PLACEHOLDER')
 expect(f.save).not.toHaveBeenCalled()
})
it('derives fixed basis identity from the original candidate instead of caller supplied baseline parameters',async()=>{
 const f=await fixture()
 const candidate=await readCandidateContent(f.host,{candidateRevisionId:'C',expectedHead:null})
 const fact=await candidate.readFixedFact({factId:'PRICE',version:2})
 expect(fact.requiresRevisionMatchCheck).toBe(false)
 expect(fact.requiresUseCheck).toBe(true);fact.assertCurrent()
 expect(f.ds.getView('Baseline','selectedBaseline')!.queryContext).toMatchObject({projectId:'P',baselineId:'B'})
 expect(f.save).not.toHaveBeenCalled()
})
it('rejects a different available baseline and invalidates fact proofs after candidate refresh',async()=>{
 const wrong=await fixture('wrong-fact-baseline'),binding=await readCandidateContent(wrong.host,{candidateRevisionId:'C',expectedHead:null})
 await expect(binding.readFixedFact({factId:'PRICE',version:2})).rejects.toThrow('CONTENT_BASELINE_UNAVAILABLE')
 const f=await fixture(),candidate=await readCandidateContent(f.host,{candidateRevisionId:'C',expectedHead:null})
 const fact=await candidate.readFixedFact({factId:'PRICE',version:2})
 await f.ds.getView('ContentRevision','selectedCandidate')!.refresh()
 expect(()=>fact.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
})
it('rejects candidate replacement while its fixed baseline query is in flight',async()=>{
 const f=await fixture(),candidate=await readCandidateContent(f.host,{candidateRevisionId:'C',expectedHead:null})
 const execute=f.query.getMockImplementation()!
 f.query.mockImplementationOnce(async view=>{
  const result=await execute(view)
  await f.ds.getView('ContentRevision','selectedCandidate')!.refresh()
  return result
 })
 await expect(candidate.readFixedFact({factId:'PRICE',version:2})).rejects.toThrow('DATA_VIEW_READ_RESULT')
 expect(f.save).not.toHaveBeenCalled()
})
it('resolves a node fact key through the fixed baseline instead of asking the page to guess a version',async()=>{
 const f=await fixture(),candidate=await readCandidateContent(f.host,{candidateRevisionId:'C',expectedHead:null})
 const fact=await candidate.readFixedFact({factId:'PRICE'})
 fact.assertCurrent()
 expect(f.ds.getView('FactVersion','selectedFactVersion')!.queryContext).toMatchObject({key:'PRICE',version:2})
 expect(f.save).not.toHaveBeenCalled()
})
it('opens the original requirement only for an exact chapter pin in the candidate',async()=>{
 const f=await fixture('fixed-pin')
 try{
  const candidate=await readCandidateContent(f.host,{candidateRevisionId:'C',expectedHead:null})
  const pin={chapterId:'C',lineageId:'L',version:'R2'}
  const before=f.query.mock.calls.length
  await expect(candidate.readFixedRequirement({...pin,chapterId:'H'})).rejects.toThrow('CONTENT_CANDIDATE_REQUIREMENT_PIN')
  expect(f.query).toHaveBeenCalledTimes(before)
  const result=await candidate.readFixedRequirement(pin)
  expect(result.requirementDataViewKey).toBe('S@Requirement@selectedRequirement')
  expect(result.requiresRevisionMatchCheck).toBe(false)
  expect(result.requiresUseCheck).toBe(true)
  result.assertCurrent()
  await f.ds.getView('RevisionSnapshot','selectedSnapshot')!.refresh()
  expect(()=>result.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
  expect(f.save).not.toHaveBeenCalled()
 }finally{f.ds.destroy()}
})
it('assembles explicit empty versions only for the verified first candidate',async()=>{
 const f=await fixture('populated')
 try{
  const candidate=await readCandidateContent(f.host,{candidateRevisionId:'C',expectedHead:null})
  const preview=await candidate.readPreviewVersions()
  expect(preview.basis).toBeNull();expect(preview.head).toBeNull()
  expect(preview.candidate.snapshot).toBe(candidate.snapshot)
  expect(preview.candidate.nodes).toBe(candidate.nodes)
  expect(f.query).toHaveBeenCalledTimes(4)
  preview.assertCurrent()
  await f.ds.getView('RevisionSnapshot','selectedSnapshot')!.refresh()
  expect(()=>preview.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
 }finally{f.ds.destroy()}
})
it('assembles complete basis and head from their own revision, snapshot and member views',async()=>{
 const f=await fixture('populated',{threeVersions:true})
 try{
  const candidate=await readCandidateContent(f.host,{candidateRevisionId:'C',expectedHead:'V2'})
  const preview=await candidate.readPreviewVersions()
  expect(preview.basis?.nodes.dataViewKey).toBe('S@ContentNodeVersion@basisSnapshotMembers')
  expect(preview.head?.nodes.dataViewKey).toBe('S@ContentNodeVersion@headSnapshotMembers')
  expect(preview.candidate.nodes.dataViewKey).toBe('S@ContentNodeVersion@snapshotMembers')
  preview.assertCurrent()
  await f.ds.getView('RevisionSnapshot','selectedHeadSnapshot')!.refresh()
  expect(()=>preview.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
  candidate.assertCurrent()
 }finally{f.ds.destroy()}
})
