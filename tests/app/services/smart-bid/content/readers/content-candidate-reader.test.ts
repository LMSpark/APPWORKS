import {expect,it} from 'vitest'
import {createHash} from 'node:crypto'
import {CONTENT_ROOT_HASH_CONTRACT} from '@/services/smart-bid/content/hashes/content-root-hash'
import {readCandidateContent} from '@/views/features/application/smart-bid/authoring/model/content-candidate-reader'
import {createCandidateReadFixture as fixture} from '../../../../../support/fixtures/smart-bid/content-candidate-fixture'

it('requires calculation inputs for exactly the original selected table placeholders',async()=>{
 const f=await fixture('calculation')
 try{
  const candidate=await readCandidateContent(f.host,{candidateRevisionId:'C',expectedHead:null})
  const table={nodeId:'T',generatorVersion:'deviation/1',formInstructionRefs:[],requirementVersions:[],
   confirmedResponses:[],factVersions:[],resourceVersions:[]}
  expect(candidate.readCalculationTemplates(['H'])).toEqual([])
  expect(candidate.readCalculationTemplates(['T'])).toEqual([{
   nodeId:'T',template:{documentId:'D',key:'T',version:'1',hash:'a'.repeat(64)},
  }])
  let current=true
  const assertInputs=()=>{if(!current)throw Error('CALCULATION_INPUT_STALE')}
  const readTemplate=async(ref:{documentId:string;key:string;version:string;hash:string})=>{
   expect(ref.documentId).toBe('D')
   return {...ref,classes:[{name:'deviation',elements:['table'],generatorKey:'deviation'}],assertCurrent:assertInputs}
  }
  await expect(candidate.resolveCalculationGenerators(['T'],async ref=>({...await readTemplate(ref),version:'other'})))
   .rejects.toThrow('CONTENT_CALCULATION_TEMPLATE_MISMATCH')
  await expect(candidate.resolveCalculationGenerators(['T'],async ref=>({...await readTemplate(ref),documentId:'other'})))
   .rejects.toThrow('CONTENT_CALCULATION_TEMPLATE_MISMATCH')
  const generators=await candidate.resolveCalculationGenerators(['T'],readTemplate)
  expect(generators.tables).toEqual([{nodeId:'T',generatorKey:'deviation'}])
  let registryCurrent=true
  const sources={readTemplate,assertInputsCurrent:assertInputs,readGenerator:(key:string)=>({
   key,version:'deviation/1',assertCurrent:()=>{if(!registryCurrent)throw Error('GENERATOR_STALE')},
  })}
  await expect(candidate.hashNodeCalculationInputs(['T'],[],sources)).rejects.toThrow('CONTENT_CALCULATION_INPUT_SCOPE')
  await expect(candidate.hashNodeCalculationInputs(['H'],[table],sources)).rejects.toThrow('CONTENT_CALCULATION_INPUT_SCOPE')
  await expect(candidate.hashNodeCalculationInputs(['T'],[{...table,generatorVersion:'other'}],sources))
   .rejects.toThrow('CONTENT_CALCULATION_GENERATOR_VERSION')
  const result=await candidate.hashNodeCalculationInputs(['H','T'],[table],sources)
  expect(result.tables.map(item=>item.nodeId)).toEqual(['T'])
  const builtIn=await candidate.hashNodeCalculationInputs(['T'],[{...table,generatorVersion:'1'}],{
   assertInputsCurrent:assertInputs,
   readTemplate:async ref=>({...await readTemplate(ref),classes:[
    {name:'deviation',elements:['table'],generatorKey:'attachment-index'},
   ]}),
  })
  expect(builtIn.tables.map(item=>item.nodeId)).toEqual(['T'])
  const readAttachmentTemplate=async (ref:Parameters<typeof readTemplate>[0])=>({...await readTemplate(ref),
   classes:[{name:'deviation',elements:['table'],generatorKey:'attachment-index'}]})
  const entries=[{resourceVersionId:'ATTACHMENT-2',nodeId:'H'}]
  const expanded=await candidate.expandAttachmentIndex('T',{entries,assertCurrent:assertInputs},readAttachmentTemplate)
  expect(expanded.table.data['rows']).toMatchObject([[{data:{附件:{resourceVersionId:'ATTACHMENT-2'}}},{data:{页码:{nodeId:'H'}}}]])
  entries[0]!.resourceVersionId='ATTACHMENT-3'
  const changed=await candidate.expandAttachmentIndex('T',{entries,assertCurrent:assertInputs},readAttachmentTemplate)
  expect(changed.table.inputHash).not.toBe(expanded.table.inputHash)
  registryCurrent=false;expect(()=>result.assertCurrent()).toThrow('GENERATOR_STALE')
  registryCurrent=true
  current=false;expect(()=>result.assertCurrent()).toThrow('CALCULATION_INPUT_STALE')
  expect(()=>generators.assertCurrent()).toThrow('CALCULATION_INPUT_STALE')
  expect(()=>expanded.assertCurrent()).toThrow('CALCULATION_INPUT_STALE')
  current=true;await f.ds.getView('ContentNodeVersion','snapshotMembers')!.refresh()
  expect(()=>result.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
  expect(()=>candidate.readCalculationTemplates(['T'])).toThrow('DATA_VIEW_READ_RESULT')
 }finally{f.ds.destroy()}
})

it('reads only explicitly selected independent response facts with exact assignment identity',async()=>{
 const f=await fixture('response-fact')
 try{
  const candidate=await readCandidateContent(f.host,{candidateRevisionId:'C',expectedHead:null})
  const before=f.query.mock.calls.length
  await expect(candidate.readEffectiveFacts({nodeIds:[],responses:[{assignmentId:'OTHER',responseId:'I'}]}))
   .rejects.toThrow('SNAPSHOT_RESPONSE_FACT_SCOPE')
  expect(f.query).toHaveBeenCalledTimes(before)
  expect((await candidate.readNodeEffectiveFacts([])).displayHashes).toEqual([])
  const result=await candidate.readEffectiveFacts({nodeIds:[],responses:[{assignmentId:'A',responseId:'I'}]})
  expect(result.displayHashes.map(item=>item.factId)).toEqual(['PRICE'])
  await f.ds.getView('RevisionSnapshot','selectedSnapshot')!.refresh()
  expect(()=>result.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
  expect(f.save).not.toHaveBeenCalled()
 }finally{f.ds.destroy()}
})

it('queries fixed facts from selected original candidate nodes only',async()=>{
 const f=await fixture('fact')
 try{
  const candidate=await readCandidateContent(f.host,{candidateRevisionId:'C',expectedHead:null})
  const before=f.query.mock.calls.length
  await expect(candidate.readNodeEffectiveFacts(['missing'])).rejects.toThrow('CONTENT_SNAPSHOT_FACT_SCOPE')
  expect(f.query).toHaveBeenCalledTimes(before)
  const chapter=await candidate.readNodeEffectiveFacts(['C'])
  expect(chapter.displayHashes).toEqual([])
  expect(f.query).toHaveBeenCalledTimes(before+1)
  const heading=await candidate.readNodeEffectiveFacts(['H'])
  expect(heading.displayHashes.map(item=>item.factId)).toEqual(['PRICE'])
  await f.ds.getView('ContentNodeVersion','snapshotMembers')!.refresh()
  expect(()=>heading.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
  expect(f.save).not.toHaveBeenCalled()
 }finally{f.ds.destroy()}
})

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
it('compares verified first-candidate versions under the original target scope',async()=>{
 const f=await fixture('populated')
 try{
  const candidate=await readCandidateContent(f.host,{candidateRevisionId:'C',expectedHead:null})
  const result=await candidate.previewScope({declaredAddedNodeIds:['D','C','H']})
  expect(result.scopeCheckPassed).toBe(true)
  expect(result.addedNodeIds).toEqual(['C','D','H'])
  expect(result.requiresCurrentAuthorityChecks).toBe(true)
  await f.ds.getView('ContentNodeVersion','snapshotMembers')!.refresh()
  expect(()=>result.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
 }finally{f.ds.destroy()}
})
it('previews selected text against the verified current head without modifying its view',async()=>{
 const f=await fixture('populated',{threeVersions:true})
 const span=(revisionId:string,text:string)=>({schemaVersion:2,projectId:'P',revisionId,owner:{kind:'NODE',nodeId:'H'},
  path:'/value',start:0,end:text.length,unit:'utf16',textDigest:createHash('sha256').update(text).digest('hex')})
 try{
  const candidate=await readCandidateContent(f.host,{candidateRevisionId:'C',expectedHead:'V2'})
  const captured=await candidate.captureNodeTextSelection({role:'candidate',nodeId:'H',path:'/value',start:0,end:1,mode:'TEXT'})
  expect(captured.reference).toEqual(span('C','标'))
  captured.assertCurrent()
  const versions=await candidate.readPreviewVersions()
  const queries=f.query.mock.calls.length
  const target=await versions.captureNodeTextSelection({role:'head',nodeId:'H',path:'/value',start:0,end:2,mode:'TEXT'})
  expect(target.reference).toEqual(span('V2','标题'))
  const result=await versions.previewText([{operation:'replace',sourceRef:captured.reference,targetRef:target.reference}])
  const selectionResult=await versions.previewNodeTextChange({operation:'replace',
   source:{nodeId:'H',path:'/value',start:0,end:1},target:{nodeId:'H',path:'/value',start:0,end:2}})
  expect(selectionResult.textPreview.patches).toEqual(result.textPreview.patches)
  const source={nodeId:'H',path:'/value',start:0,end:1},insertion={...source,start:2,end:2}
  const inserted=await versions.previewNodeTextChange({operation:'insert',source,target:insertion})
  expect(inserted.textPreview.patches[0]?.after).toBe('标题标{{册名}}')
  const deleted=await versions.previewNodeTextChange({operation:'delete',target:source})
  expect(deleted.textPreview.patches[0]?.after).toBe('题{{册名}}')
  await expect(versions.previewNodeTextChange({operation:'insert',source,target:source})).rejects.toThrow('CONTENT_SPAN_RANGE')
  expect(f.query).toHaveBeenCalledTimes(queries)
  target.assertCurrent()
  expect(result.textPreview.patches[0]?.after).toBe('标{{册名}}')
  expect(result.requiresMeaningChecks).toBe(true)
  expect(f.save).not.toHaveBeenCalled()
  await f.ds.getView('ContentNodeVersion','headSnapshotMembers')!.refresh()
  expect(()=>result.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
  await expect(versions.previewNodeTextChange({operation:'delete',target:{nodeId:'H',path:'/value',start:0,end:1}}))
   .rejects.toThrow('DATA_VIEW_READ_RESULT')
 }finally{f.ds.destroy()}
})
it('checks the candidate root against its original baseline without substituting current data',async()=>{
 const f=await fixture('populated',{computeRoot:true})
 try{
  const candidate=await readCandidateContent(f.host,{candidateRevisionId:'C',expectedHead:null})
  const reads=f.query.mock.calls.length
  await expect(candidate.verifyRootHash('unknown')).rejects.toThrow('CONTENT_ROOT_HASH_CONTRACT_REQUIRED')
  expect(f.query).toHaveBeenCalledTimes(reads)
  const verified=await candidate.verifyRootHash(CONTENT_ROOT_HASH_CONTRACT)
  expect(verified.rootHashVerified).toBe(true)
  expect(f.ds.getView('Baseline','selectedBaseline')!.queryContext).toMatchObject({projectId:'P',baselineId:'B'})
  await f.ds.getView('Baseline','selectedBaseline')!.refresh()
  expect(()=>verified.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
 }finally{f.ds.destroy()}
})
it('verifies three revision roots without invalidating another role baseline proof',async()=>{
 const f=await fixture('populated',{computeRoot:true,threeVersions:true})
 try{
  const candidate=await readCandidateContent(f.host,{candidateRevisionId:'C',expectedHead:'V2'})
  const versions=await candidate.readPreviewVersions()
  const results=await versions.verifyRootHashes(CONTENT_ROOT_HASH_CONTRACT)
  expect(results.candidate.rootHash).toBe(results.head?.rootHash)
  expect(results.candidate.rootHash).toBe(results.basis?.rootHash)
  results.assertCurrent()
  const views=f.query.mock.calls.map(([view])=>view.viewId)
  expect(views).toEqual(expect.arrayContaining(['selectedBaseline','selectedBasisBaseline','selectedHeadBaseline']))
  await f.ds.getView('Baseline','selectedHeadBaseline')!.refresh()
  expect(()=>results.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
  results.candidate.assertCurrent();results.basis?.assertCurrent()
 }finally{f.ds.destroy()}
})
