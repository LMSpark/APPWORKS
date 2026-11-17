import {expect,it} from 'vitest'
import {readCandidateContent} from '@/views/features/application/smart-bid/authoring/model/content-candidate-reader'
import {createCandidateReadFixture as fixture} from '../../../../../support/fixtures/smart-bid/content-candidate-fixture'

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
