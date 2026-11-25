import {expect,it,vi} from 'vitest'
import {createHash} from 'node:crypto'
import {CONTENT_ROOT_HASH_CONTRACT} from '@/services/smart-bid/content/hashes/content-root-hash'
import {readCandidateContent} from '@/views/features/application/smart-bid/authoring/model/content-candidate-reader'
import {prepareRegisteredDraftCandidateRequest,readDraftCandidateBasis} from '@/views/features/application/smart-bid/authoring/model/draft/content-draft-candidate-basis'
import {prepareCandidateProduction} from '@/views/features/application/smart-bid/authoring/model/review/production/candidate-production-reader'
import {prepareBidVolumePlan} from '@/services/smart-bid/content/references/response/bid-volume-plan'
import {compareAdoptionBasisChecks} from '@/services/smart-bid/content/adoption/adoption-basis-checks'
import {prepareResponseDraft} from '@/services/smart-bid/content/references/response/response-draft'
import {bindDraftCandidateFactEvidence} from '@/services/smart-bid/content/draft/content-draft-candidate-request'
import {readDraftResponseVersions} from '@/views/features/application/smart-bid/authoring/model/draft/content-draft-response-versions'
import {readReviewedResponseForCandidate,reviewResponseDraft} from '@/services/smart-bid/content/references/response/response-review'
import {canonicalSnapshotValue,hashCanonicalSnapshotText} from '@/services/smart-bid/content/revision-snapshot-hash'
import {createCandidateReadFixture as fixture} from '../../../../../support/fixtures/smart-bid/content-candidate-fixture'

it('reads candidate-generation scope from the exact adopted draft basis',async()=>{
 const f=await fixture('populated',{threeVersions:true})
 try{
  const basis=await readDraftCandidateBasis(f.host,{revisionId:'V1'})
  expect(basis).toMatchObject({revisionId:'V1',baselineId:'B',basisNodes:[
   {nodeId:'D',parentId:'P'},{nodeId:'C',parentId:'D'},{nodeId:'H',parentId:'C'},
  ],responses:[]})
  await f.ds.getView('Baseline','selectedBasisBaseline')?.refresh()
  expect(()=>basis.assertCurrent()).toThrow()
 }finally{f.ds.destroy()}
})
it('rejects a draft basis response with no original assignment',async()=>{
 const f=await fixture('bad-response',{threeVersions:true})
 try{
  await expect(readDraftCandidateBasis(f.host,{revisionId:'V1'})).rejects.toThrow('CONTENT_SCOPE_ASSIGNMENT_BASIS')
 }finally{f.ds.destroy()}
})
it('rejects a hash-matched draft basis whose template refers to a heading',async()=>{
 const f=await fixture('bad-template',{threeVersions:true})
 try{
  await expect(readDraftCandidateBasis(f.host,{revisionId:'V1'})).rejects.toThrow('SNAPSHOT_TEMPLATE')
 }finally{f.ds.destroy()}
})
it('keeps exact original responses and unfilled assignments distinct for draft preparation',async()=>{
 const f=await fixture('response-fact',{threeVersions:true,baselineRequirementVersion:'R1'})
 try{
  const basis=await readDraftCandidateBasis(f.host,{revisionId:'V1'})
  expect(basis.responses).toEqual([
   {projectId:'P',assignmentId:'A',responseId:'I'},
   {projectId:'P',assignmentId:'UNANSWERED',responseId:null},
  ])
 }finally{f.ds.destroy()}
})
it.each(['valid-pin','response-fact'])('rejects %s requirements from a different frozen version',async mode=>{
 const f=await fixture(mode,{threeVersions:true})
 try{
  await expect(readDraftCandidateBasis(f.host,{revisionId:'V1'})).rejects.toThrow('CONTENT_DRAFT_CANDIDATE_BASIS_REQUIREMENT')
 }finally{f.ds.destroy()}
})
it.each(['fact','response-fact'])('rejects a %s reference missing from the frozen baseline',async mode=>{
 const f=await fixture(mode,{threeVersions:true,baselineRequirementVersion:'R1',baselineFactId:'OTHER'})
 try{
  await expect(readDraftCandidateBasis(f.host,{revisionId:'V1'})).rejects.toThrow('CONTENT_DRAFT_CANDIDATE_BASIS_FACT')
 }finally{f.ds.destroy()}
})
it('binds a prepared draft candidate to the original fact version query',async()=>{
 const f=await fixture('fact',{threeVersions:true})
 try{
  const basis=await readDraftCandidateBasis(f.host,{revisionId:'V1'})
  const draftJson=canonicalSnapshotValue({nodes:basis.nodePayloads,responseChanges:[]})
  const request=await prepareRegisteredDraftCandidateRequest(f.host,{projectId:'P',draftId:'D',actorUserId:'U',
   draftVersion:'D1',baseRevisionId:'V1',draftJson,contentDigest:await hashCanonicalSnapshotText(draftJson),assertCurrent:()=>{}},
  {basis,input:{requestKey:'Q',targetScope:{schemaVersion:2,projectId:'P',targets:[{kind:'PROJECT'}]}}})
  expect(request).toMatchObject({factVersions:[{factId:'PRICE',version:2}],
   factDependencyHash:expect.stringMatching(/^[a-f0-9]{64}$/u),requiresFactUseCheck:true})
  expect(request.requestJson).toContain(`"factDependencyHash":"${request.factDependencyHash}"`)
  expect(request.requestDigest).toBe(await hashCanonicalSnapshotText(`["spark-bid.draft-candidate/1",${request.requestJson}]`))
  const facts=f.ds.getView('FactVersion','effectiveFactVersions')!
  facts.queryConfig={...facts.queryConfig,cacheType:'page'}
  expect(()=>request.assertCurrent()).toThrow('EFFECTIVE_FACT_VIEW_STALE')
 }finally{f.ds.destroy()}
})
it('pins a new independent response and its frozen facts in the candidate request',async()=>{
 const f=await fixture('response-fact',{threeVersions:true,baselineRequirementVersion:'R1'})
 try{
  const basis=await readDraftCandidateBasis(f.host,{revisionId:'V1'})
  const draftJson=canonicalSnapshotValue({nodes:[],responseChanges:[{assignmentId:'A',basisResponseId:'I',responseId:'NEW'}]})
  const prepared=await prepareRegisteredDraftCandidateRequest(f.host,{projectId:'P',draftId:'D',actorUserId:'U',
   draftVersion:'D1',baseRevisionId:'V1',draftJson,contentDigest:await hashCanonicalSnapshotText(draftJson),assertCurrent:()=>{}},
  {basis,input:{requestKey:'Q',targetScope:{schemaVersion:2,projectId:'P',targets:[{kind:'RESPONSE',assignmentId:'A',responseId:'I'}]}}})
  expect(prepared).toMatchObject({factVersions:[{factId:'PRICE',version:2}],requiresResponseUseCheck:true})
  expect(prepared.requestJson).toContain('"responseId":"NEW"')
  expect(prepared.requestJson).toContain('"payloadHash":')
  const [version]=prepared.responseVersions
  if(!version)throw Error('Expected the selected response version')
  const extra={factId:'ADDITIONAL',version:1}
  const ordered=await bindDraftCandidateFactEvidence(prepared,{...prepared,factVersions:[extra,...prepared.factVersions]})
  const reversed=await bindDraftCandidateFactEvidence(prepared,{...prepared,factVersions:[...prepared.factVersions,extra]})
  expect(reversed.requestJson).toBe(ordered.requestJson)
  expect(reversed.requestDigest).toBe(ordered.requestDigest)
  extra.version=2
  expect(reversed.factVersions[0]?.version).toBe(1)
  for(const responseVersions of [[],[version,version],[{...version,responseId:'OTHER'}]]){
   await expect(bindDraftCandidateFactEvidence(prepared,{...prepared,responseVersions}))
    .rejects.toThrow('CONTENT_DRAFT_CANDIDATE_FACT_EVIDENCE')
  }
  await f.ds.getView('Response','selectedDraftResponseVersions')?.refresh()
  expect(()=>prepared.assertCurrent()).toThrow()
 }finally{f.ds.destroy()}
})
it('pins the original review stamp in the independent response version digest',async()=>{
 const responseReview:{reviewedBy:string|null;reviewedAt:string|null}={reviewedBy:null,reviewedAt:null}
 const f=await fixture('response-fact',{responseReview})
 const read=()=>readDraftResponseVersions(f.host,[{responseId:'NEW',assignmentId:'A',lineageId:'L',version:'R1'}],[])
 try{
  const pending=await read()
  responseReview.reviewedBy='REVIEWER'
  await expect(read()).rejects.toThrow('CONTENT_DRAFT_RESPONSE_VERSION')
  expect(()=>pending.assertCurrent()).toThrow()
  responseReview.reviewedAt='2026-11-19T06:00:00+08:00'
  const recorded=await read()
  expect(recorded.versions[0]?.payloadHash).toMatch(/^[a-f0-9]{64}$/u)
  expect(recorded.versions[0]?.payloadHash).not.toBe(pending.versions[0]?.payloadHash)
  const view=f.ds.getView('Response','selectedDraftResponseVersions')!
  view.queryConfig={...view.queryConfig,cacheType:'page'}
  expect(()=>recorded.assertCurrent()).toThrow('CONTENT_DRAFT_RESPONSE_VERSION')
  const queryCount=f.query.mock.calls.length
  await expect(read()).rejects.toThrow('CONTENT_DRAFT_RESPONSE_VERSION')
  expect(f.query).toHaveBeenCalledTimes(queryCount)
  view.queryConfig={...view.queryConfig,cacheType:'none',fields:['id','projectId','statement']}
  await expect(read()).rejects.toThrow('CONTENT_DRAFT_RESPONSE_VERSION')
  expect(f.query).toHaveBeenCalledTimes(queryCount)
 }finally{f.ds.destroy()}
})
it('takes first draft target nodes from the frozen input snapshot',async()=>{
 const f=await fixture('populated')
 try{
  const candidate=await readCandidateContent(f.host,{candidateRevisionId:'C',expectedHead:null})
  const snapshotHash=f.host.runtime.resolveView(candidate.snapshot.dataViewKey)?.rows[0]?.['snapshotHash']
  if(typeof snapshotHash!=='string')throw Error('TEST_SNAPSHOT_HASH_REQUIRED')
  const targetScope={schemaVersion:2,projectId:'P',targets:[{kind:'PROJECT'}]}
  const selection={revisionId:null,firstBaselineId:'B',firstBatchId:'BATCH',targetScope}
  const first=await readDraftCandidateBasis(f.host,selection)
  expect(first).toMatchObject({revisionId:null,baselineId:'B',inputSnapshotHash:snapshotHash,batchId:'BATCH',lockHash:'f'.repeat(64),
   basisNodes:expect.arrayContaining([{nodeId:'D',parentId:'P',type:'document',index:0}])})
  const indexed=await readDraftCandidateBasis(f.host,{revisionId:null,firstBaselineId:'B',firstBatchId:'BATCH',targetScopeIndex:1})
  expect(indexed).toMatchObject({targetScope:{targets:[{nodeId:'C',extent:'NODE'},{nodeId:'H',extent:'NODE'}]}})
  await expect(readDraftCandidateBasis(f.host,{revisionId:null,firstBaselineId:'B',firstBatchId:'BATCH',targetScopeIndex:2}))
   .rejects.toThrow('CONTENT_DRAFT_CANDIDATE_BASIS')
  await expect(readDraftCandidateBasis(f.host,{...selection,targetScope:{...targetScope,targets:[{kind:'NODE',nodeId:'D',extent:'NODE'}]}}))
   .rejects.toThrow('CONTENT_DRAFT_CANDIDATE_BASIS')
  expect(()=>first.assertCurrent()).toThrow()
 }finally{f.ds.destroy()}
})

it('prepares a review-only production request from a verified candidate root',async()=>{
 const f=await fixture('populated',{computeRoot:true})
 try{
  const selection={candidateRevisionId:'C',expectedHead:null}
  const request={projectId:'P',documentId:'D',revisionId:'C',baselineId:'B',requestKey:'RUN',
   toolVersionRef:'TOOL',outputOptions:{format:'PDF'}}
  const prepared=await prepareCandidateProduction(f.host,{selection,request},async version=>({
   ...version,templateVersionRef:'T1',ruleVersionRef:'RULE',factRefs:[],
   formRequired:false,formVersionRef:null,requiredAttachmentRefs:[],attachmentRefs:[],
  }))
  expect(prepared.request).toMatchObject({documentId:'D',revisionId:'C',purpose:'REVIEW',rootHash:expect.stringMatching(/^[a-f0-9]{64}$/u)})
  await f.ds.getView('ContentNodeVersion','snapshotMembers')?.refresh()
  expect(()=>prepared.assertCurrent()).toThrow()
 }finally{f.ds.destroy()}
})

it('checks the planned volume against the actual candidate tree and revokes the proof on refresh',async()=>{
 const f=await fixture('populated')
 try{
  const candidate=await readCandidateContent(f.host,{candidateRevisionId:'C',expectedHead:null})
  const scope={projectId:'P',baselineId:'B'}
  const obligation={kind:'DOCUMENT' as const,obligationRef:'DOC'}
  const source={...scope,obligations:[{...obligation,required:true,allowedDisclosureRefs:[]}],assertCurrent:()=>{}}
  const targets={...obligation,targetRef:'C',disclosureRefs:[]}
  const plan=prepareBidVolumePlan({...scope,destinations:[{...targets,documentId:'D'}]},source)
  const wrong=prepareBidVolumePlan({...scope,destinations:[{...targets,documentId:'OTHER'}]},source)
  const proof=candidate.verifyVolumePlan(plan)
  expect(proof.documentIds).toEqual(['D'])
  const updated=prepareBidVolumePlan({...scope,destinations:[{...targets,documentId:'D',targetRef:'H'}]},source)
  expect(compareAdoptionBasisChecks([proof.basisCheck],[candidate.verifyVolumePlan(updated).basisCheck])).toMatchObject({
   matches:false,issues:[{owner:'BidVolume',code:'SCOPE_EVIDENCE_CHANGED'}],
  })
  expect(()=>candidate.verifyVolumePlan(wrong)).toThrow('BID_VOLUME_PLAN_PLACEMENT')
  const registeredProof=await candidate.verifyVolumePlanFromBaseline([{...targets,documentId:'D'}])
  expect(registeredProof.basisCheck.recordRefs).toMatchObject([{obligationRef:'DOC',sourceRef:'SOURCE-V1',documentId:'D'}])
  await f.ds.getView('SubmissionObligation','originalBaselineObligations')?.refresh()
  expect(()=>registeredProof.assertCurrent()).toThrow()
  await f.ds.getView('ContentNodeVersion','snapshotMembers')?.refresh()
  expect(()=>proof.assertCurrent()).toThrow()
 }finally{f.ds.destroy()}
})

it.each(['response-fact','scoped-response'] as const)('matches reviewed response content against the actual candidate manifest (%s)',async mode=>{
 const f=await fixture(mode)
 try{
  const candidate=await readCandidateContent(f.host,{candidateRevisionId:'C',expectedHead:null})
  const anchored=mode==='scoped-response',responseId=anchored?'R':'I',targetRef=anchored?'H':'FIELD'
  const scope={projectId:'P',baselineId:'B',assignmentId:'A',lineageId:'L',version:anchored?'R2':'R1',targetRef}
  const assertCurrent=()=>{}
  const draft=prepareResponseDraft({...scope,authorRef:'OWNER',at:10,
   body:anchored?{chapterId:'C',anchorNodeId:'H'}:{statement:'报价{{金额}}元，再确认{{金额}}元',data:{金额:{type:'fact',factId:'PRICE'}}}},{
   ...scope,task:{...scope,taskRef:'TASK',assignmentVersion:'A1',assigneeRef:'OWNER',dueAt:20,state:'ACCEPTED' as const,acceptance:{receiptRef:'ACCEPT',assignmentVersion:'A1',assigneeRef:'OWNER',acceptedAt:1},assertCurrent:()=>{}},allowedNodeIds:['H'],...(anchored?{chapterId:'C'}:{}),
   requiredEvidence:[],evidence:[],assertCurrent,
  })
  const {assertCurrent:_proof,...body}=draft
  const draftHash=await hashCanonicalSnapshotText(canonicalSnapshotValue(body))
  const nodeHash=f.ds.getView('ContentNodeVersion','snapshotMembers')?.rows.find(item=>item['nodeId']==='H')?.['nodeHash']
  const getReview=(hash:string,deviation:'POSITIVE'|null=null)=>{
   const position={positionRef:targetRef,contentHash:hash,requiresAiVerification:false}
   return reviewResponseDraft(draft,{draftHash,reviewerRef:'REVIEWER',ruleVersionRef:'RULE',deviation,
    deviationAllowed:true,positions:[position],checks:[{...position,accepted:true,reviewRef:'REVIEW',aiVerificationRef:null,assertCurrent}],
    deferredPositionRefs:[],assertCurrent})
  }
  const review=await getReview(anchored&&typeof nodeHash==='string'?nodeHash:
   await hashCanonicalSnapshotText(canonicalSnapshotValue(draft.body)))
  const reviewed=await readReviewedResponseForCandidate(scope,draft,review)
  const responseProof=candidate.verifyReviewedResponse(responseId,reviewed)
  expect(responseProof).toMatchObject({responseId,reviewHash:reviewed.reviewHash,
   reviewRecord:{draftHash,reviewerRef:'REVIEWER',ruleVersionRef:'RULE',positions:[{reviewRef:'REVIEW'}]}})
  expect(()=>candidate.verifyReviewedResponse('OTHER',reviewed)).toThrow('CONTENT_CANDIDATE_REVIEWED_RESPONSE')
  const wrongDeviation=await readReviewedResponseForCandidate(scope,draft,
   await getReview(review.positions[0]!.contentHash,'POSITIVE'))
  expect(()=>candidate.verifyReviewedResponse(responseId,wrongDeviation)).toThrow('CONTENT_CANDIDATE_REVIEWED_RESPONSE')
  if(anchored){
   const wrong=await readReviewedResponseForCandidate(scope,draft,await getReview('b'.repeat(64)))
   expect(()=>candidate.verifyReviewedResponse(responseId,wrong)).toThrow('CONTENT_CANDIDATE_REVIEWED_RESPONSE')
   await f.ds.getView('ContentNodeVersion','snapshotMembers')?.refresh()
   expect(()=>responseProof.assertCurrent()).toThrow()
  }
 }finally{f.ds.destroy()}
})

it('requires every original non-fact display and rejects an invented position on a normal node',async()=>{
 const f=await fixture('populated')
 try{
  const candidate=await readCandidateContent(f.host,{candidateRevisionId:'C',expectedHead:null})
  type Sources=Parameters<typeof candidate.readSubtreeEffectiveHash>[2]
  const makeSources=(displayRefs:unknown):Sources=>({
   readTemplate:async ref=>({...ref,defaultDeliverable:true,restrictions:[],
    classes:[{name:'candidate-heading',elements:['heading']}],assertCurrent:()=>{}}),
   readSupplement:async()=>({qualificationIds:[],displayRefs,calculations:[],assertCurrent:()=>{}}),
  })
  await expect(candidate.readSubtreeEffectiveHash('C',[],makeSources([]))).rejects.toThrow('CONTENT_REVIEW_DISPLAY_INCOMPLETE')
  const display={nodeId:'H',occurrence:0,displayHash:'b'.repeat(64)}
  const result=await candidate.readSubtreeEffectiveHash('C',[],makeSources([display]))
  expect(result.effectiveHash).toMatch(/^[a-f0-9]{64}$/)
  await expect(candidate.readSubtreeEffectiveHash('C',[],makeSources([display,{...display,occurrence:1}])))
   .rejects.toThrow('CONTENT_REVIEW_DISPLAY_SCOPE')
 }finally{f.ds.destroy()}
})

it('combines candidate subtree evidence and rejects supplementary references outside the subtree',async()=>{
 const f=await fixture('fixed-pin')
 try{
  const candidate=await readCandidateContent(f.host,{candidateRevisionId:'C',expectedHead:null})
  type Sources=Parameters<typeof candidate.readSubtreeEffectiveHash>[2]
  let current=true
  const source:Sources={
   readTemplate:async ref=>({...ref,defaultDeliverable:true,restrictions:[],
    classes:[{name:'candidate-heading',elements:['heading']}],assertCurrent:()=>{}}),
   readSupplement:async nodeIds=>{
    expect(nodeIds).toEqual(['C','H'])
    return {qualificationIds:[],displayRefs:[],calculations:[],
     assertCurrent:()=>{if(!current)throw Error('REVIEW_SUPPLEMENT_STALE')}}
   },
  }
  await expect(candidate.readSubtreeEffectiveHash('C',[],{...source,readSupplement:async ids=>({
   ...await source.readSupplement(ids),displayRefs:[{nodeId:'D',occurrence:0,displayHash:'b'.repeat(64)}],
  })})).rejects.toThrow('CONTENT_REVIEW_DISPLAY_SCOPE')
  const result=await candidate.readSubtreeEffectiveHash('C',[],source)
  expect(result.effectiveHash).toMatch(/^[0-9a-f]{64}$/)
  expect(result.requiresUseCheck).toBe(true)
  current=false;expect(()=>result.assertCurrent()).toThrow('REVIEW_SUPPLEMENT_STALE')
 }finally{f.ds.destroy()}
})

it('binds content rule digests to the original owning document',async()=>{
 const f=await fixture('populated')
 try{
  const candidate=await readCandidateContent(f.host,{candidateRevisionId:'C',expectedHead:null})
  let sourceCurrent=true
  const source=vi.fn(async (ref:Parameters<Parameters<typeof candidate.readContentRulesHash>[1]>[0])=>({
   ...ref,defaultDeliverable:true,restrictions:[],classes:[{name:'candidate-heading',elements:['heading']}],
   assertCurrent:()=>{if(!sourceCurrent)throw Error('RULE_SOURCE_STALE')},
  }))
  const result=await candidate.readContentRulesHash(['C','H'],source)
  expect(source).toHaveBeenCalledOnce()
  expect(result.contentRulesHash).toMatch(/^[a-f0-9]{64}$/)
  await expect(candidate.readContentRulesHash(['C'],async ref=>({...await source(ref),documentId:'OTHER'})))
   .rejects.toThrow('CONTENT_RULES_TEMPLATE_MISMATCH')
  sourceCurrent=false
  expect(()=>result.assertCurrent()).toThrow('RULE_SOURCE_STALE')
  sourceCurrent=true
  await f.ds.getView('RevisionSnapshot','selectedSnapshot')!.refresh()
  expect(()=>result.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
 }finally{f.ds.destroy()}
})

it('reads scoped qualification evidence with the original snapshot proof',async()=>{
 const f=await fixture('qualification')
 try{
  const candidate=await readCandidateContent(f.host,{candidateRevisionId:'C',expectedHead:null})
  const result=await candidate.readQualificationHash(['Q'])
  expect(result.qualificationHash).not.toBe((await candidate.readQualificationHash([])).qualificationHash)
  expect(result.requiresUseCheck).toBe(true)
  await f.ds.getView('RevisionSnapshot','selectedSnapshot')!.refresh()
  expect(()=>result.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
 }finally{f.ds.destroy()}
})

it('includes a fixed anchored response only within its chapter or anchor scope',async()=>{
 const f=await fixture('scoped-response')
 try{
  const candidate=await readCandidateContent(f.host,{candidateRevisionId:'C',expectedHead:null})
  const document=await candidate.readReviewDependencies({nodeIds:['D'],responses:[]})
  const chapter=await candidate.readReviewDependencies({nodeIds:['C'],responses:[]})
  const anchor=await candidate.readReviewDependencies({nodeIds:['H'],responses:[]})
  expect(chapter.responseDependencyHash).not.toBe(document.responseDependencyHash)
  expect(anchor.responseDependencyHash).toBe(chapter.responseDependencyHash)
 }finally{f.ds.destroy()}
})

it('retains simultaneous fact and requirement proofs from one original baseline query',async()=>{
 const f=await fixture('fixed-pin')
 try{
  const candidate=await readCandidateContent(f.host,{candidateRevisionId:'C',expectedHead:null})
  await expect(candidate.readSubtreeReviewDependencies('missing',[])).rejects.toThrow('CONTENT_REVIEW_SUBTREE_REQUIRED')
  const result=await candidate.readSubtreeReviewDependencies('C',[])
  expect(result.nodeIds).toEqual(['C','H'])
  expect(result.subtreeHash).toBe(candidate.nodes.subtreeHashes.find(item=>item.nodeId==='C')?.subtreeHash)
  expect(result.facts.displayHashes.map(item=>item.factId)).toEqual(['PRICE'])
  expect(result.requirements.requirementBindingHash).toMatch(/^[a-f0-9]{64}$/)
  expect(f.query.mock.calls.filter(([view])=>view.viewId==='selectedBaseline')).toHaveLength(1)
  result.assertCurrent()
  await f.ds.getView('Baseline','selectedBaseline')!.refresh()
  expect(()=>result.facts.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
  expect(()=>result.requirements.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
 }finally{f.ds.destroy()}
})

it('hashes scoped requirement bindings from the original baseline and requirement batch',async()=>{
 const f=await fixture('fixed-pin')
 try{
  const candidate=await readCandidateContent(f.host,{candidateRevisionId:'C',expectedHead:null})
  const empty=await candidate.readRequirementBindingHash(['H'])
  expect(f.query.mock.calls.some(([view])=>view.viewId==='effectiveRequirementVersions')).toBe(false)
  const result=await candidate.readRequirementBindingHash(['C'])
  expect(result.requirementBindingHash).toMatch(/^[a-f0-9]{64}$/)
  expect(result.requirementBindingHash).not.toBe(empty.requirementBindingHash)
  expect(result.requiresUseCheck).toBe(true)
  await f.ds.getView('Requirement','effectiveRequirementVersions')!.refresh()
  expect(()=>result.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
 }finally{f.ds.destroy()}
})

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
  const reviewSource=(calculations:ReadonlyArray<typeof expanded>,occurrence:number)=>({
   readTemplate:async (ref:Parameters<typeof readTemplate>[0])=>({...await readAttachmentTemplate(ref),defaultDeliverable:true,restrictions:[]}),
   readSupplement:async()=>({qualificationIds:[],calculations,assertCurrent:assertInputs,
    displayRefs:[{nodeId:'T',occurrence,displayHash:'a'.repeat(64)}]}),
  })
  await expect(candidate.readSubtreeEffectiveHash('T',[],reviewSource([],0))).rejects.toThrow('CONTENT_CALCULATION_INPUT_SCOPE')
  await expect(candidate.readSubtreeEffectiveHash('T',[],reviewSource([{...expanded}],0))).rejects.toThrow('CONTENT_REVIEW_CALCULATION_SOURCE')
  await expect(candidate.readSubtreeEffectiveHash('T',[],reviewSource([expanded],1))).rejects.toThrow('CONTENT_REVIEW_DISPLAY_SCOPE')
  const reviewed=await candidate.readSubtreeEffectiveHash('T',[],reviewSource([expanded],0))
  expect(reviewed.effectiveHash).toMatch(/^[a-f0-9]{64}$/)
  expect(expanded.table.data['rows']).toMatchObject([[{data:{附件:{resourceVersionId:'ATTACHMENT-2'}}},{data:{页码:{nodeId:'H'}}}]])
  expect(expanded.readComputed({nodeId:'T',inputHash:expanded.table.inputHash})).toBe(expanded.table)
  const query={projectId:'P',revisionId:'C',nodeId:'T',inputHash:expanded.table.inputHash}
  expect(expanded.computedGetTool.function).toMatchObject({name:'computed_get',strict:true,
   parameters:{required:Object.keys(query),additionalProperties:false}})
  expect(expanded.computedGet(query).data).toBe(expanded.table.data)
  let stationCurrent=true
  const station=expanded.createComputedQueryRoot(()=>{if(!stationCurrent)throw Error('STATION_STALE')})
  expect(station.computed_get(query).data).toBe(expanded.table.data)
  stationCurrent=false
  expect(()=>station.computed_get(query)).toThrow('STATION_STALE')
  expect(()=>expanded.computedGet({...query,projectId:'OTHER'})).toThrow('CONTENT_COMPUTED_QUERY_SCOPE')
  expect(()=>expanded.computedGet({...query,revisionId:'OTHER'})).toThrow('CONTENT_COMPUTED_QUERY_SCOPE')
  expect(()=>expanded.computedGet({...query,extra:true})).toThrow('CONTENT_COMPUTED_QUERY_SCOPE')
  expect(()=>expanded.readComputed({nodeId:'H',inputHash:expanded.table.inputHash})).toThrow('CONTENT_COMPUTED_RESULT_MISMATCH')
  entries[0]!.resourceVersionId='ATTACHMENT-3'
  const changed=await candidate.expandAttachmentIndex('T',{entries,assertCurrent:assertInputs},readAttachmentTemplate)
  expect(changed.table.inputHash).not.toBe(expanded.table.inputHash)
  expect(()=>changed.readComputed({nodeId:'T',inputHash:expanded.table.inputHash})).toThrow('CONTENT_COMPUTED_RESULT_MISMATCH')
  registryCurrent=false;expect(()=>result.assertCurrent()).toThrow('GENERATOR_STALE')
  registryCurrent=true
  current=false;expect(()=>result.assertCurrent()).toThrow('CALCULATION_INPUT_STALE')
  expect(()=>generators.assertCurrent()).toThrow('CALCULATION_INPUT_STALE')
  expect(()=>expanded.assertCurrent()).toThrow('CALCULATION_INPUT_STALE')
  expect(()=>expanded.readComputed({nodeId:'T',inputHash:expanded.table.inputHash})).toThrow('CALCULATION_INPUT_STALE')
  expect(()=>expanded.computedGet(query)).toThrow('CALCULATION_INPUT_STALE')
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
  expect(result.responseDisplayRefs).toEqual([0,1].map(occurrence=>({
   responseId:'I',assignmentId:'A',occurrence,displayHash:result.displayHashes[0]?.displayHash,
  })))
  const empty=await candidate.readReviewDependencies({nodeIds:[],responses:[]})
  const unanswered=await candidate.readReviewDependencies({nodeIds:[],responses:[{assignmentId:'UNANSWERED',responseId:null}]})
  expect(unanswered.responseDependencyHash).not.toBe(empty.responseDependencyHash)
  expect(unanswered.facts.responseDisplayRefs).toEqual([])
  await expect(candidate.readReviewDependencies({nodeIds:[],responses:[{assignmentId:'A',responseId:null}]}))
   .rejects.toThrow('CONTENT_EFFECTIVE_RESPONSE_SCOPE')
  const scoped=await candidate.readReviewDependencies({nodeIds:[],responses:[{assignmentId:'A',responseId:'I'}]})
  expect(scoped.responseDependencyHash).not.toBe(empty.responseDependencyHash)
  scoped.assertCurrent()
  await f.ds.getView('RevisionSnapshot','selectedSnapshot')!.refresh()
  expect(()=>scoped.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
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
  expect(heading.nodeDisplayRefs).toEqual([{nodeId:'H',occurrence:0,displayHash:heading.displayHashes[0]?.displayHash}])
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
  await expect(candidate.readRequirementPinIssues(undefined,['missing'])).rejects.toThrow('CONTENT_CANDIDATE_REQUIREMENT_SCOPE')
  expect((await candidate.readRequirementPinIssues(undefined,['H'])).issues).toEqual([])
  const report=await candidate.readRequirementPinIssues(undefined,['C','H'])
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
  const declaredAddedNodeIds=['D','C','H']
  await expect(candidate.previewScope({declaredAddedNodeIds,volumeDestinations:[]})).rejects.toThrow('BID_VOLUME_PLAN_INCOMPLETE')
  const result=await candidate.previewScope({declaredAddedNodeIds,volumeDestinations:[
   {kind:'DOCUMENT',obligationRef:'DOC',targetRef:'C',documentId:'D',disclosureRefs:[]},
  ]})
  expect(result.scopeCheckPassed).toBe(true)
  expect(result.addedNodeIds).toEqual(['C','D','H'])
  expect(result.requiresCurrentAuthorityChecks).toBe(true)
  expect(result.volumeBasisCheck).toMatchObject({owner:'BidVolume',recordRefs:[{documentId:'D',sourceRef:'SOURCE-V1'}]})
  await f.ds.getView('SubmissionObligation','originalBaselineObligations')!.refresh()
  expect(()=>result.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
 }finally{f.ds.destroy()}
})
it('binds original form evidence to the exact template used by the candidate document',async()=>{
 const f=await fixture('mapped-form')
 try{
  const candidate=await readCandidateContent(f.host,{candidateRevisionId:'C',expectedHead:null})
  const selected={declaredAddedNodeIds:['D','C','H'],originalFormTemplate:{documentId:'D',templateRef:'T',templateVersion:'1'}}
  await expect(candidate.previewScope({...selected,originalFormTemplate:{...selected.originalFormTemplate,documentId:'H'}}))
   .rejects.toThrow('CONTENT_CANDIDATE_ORIGINAL_FORM_SCOPE')
  const result=await candidate.previewScope(selected)
  expect(result.originalFormBasisCheck).toMatchObject({owner:'DocumentTemplate',scopeRef:{documentId:'D',baselineId:'B'},
   recordRefs:[{templateRef:'T',formRef:'FORM',tenderRecordRef:{recordVersion:'002'},mappings:[{fieldRef:'F'}]}]})
  await f.ds.getView('DocumentTemplate','originalFormMapping')?.refresh()
  expect(()=>result.assertCurrent()).toThrow()
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

it.each(['candidate-read','evidence-read'] as const)('keeps the original production input during %s',async waitFor=>{
 const f=await fixture('populated',{computeRoot:true})
 const selection:{candidateRevisionId:string;expectedHead:string|null}={candidateRevisionId:'C',expectedHead:null}
 const request={projectId:'P',documentId:'D',revisionId:'C',baselineId:'B',requestKey:'ORIGINAL',
  toolVersionRef:'TOOL',outputOptions:{format:'PDF',print:{copies:1}}}
 const changed=()=>{
  selection.candidateRevisionId='OTHER'
  selection.expectedHead='NEW_HEAD'
  request.revisionId='OTHER'
  request.requestKey='REPLACEMENT'
  request.toolVersionRef='OTHER_TOOL'
  request.outputOptions.format='DOCX'
  request.outputOptions.print.copies=2
 }
 const execute=f.query.getMockImplementation()
 if(!execute)throw Error('Expected the original query executor')
 let enter!:()=>void,release!:()=>void
 const entered=new Promise<void>(resolve=>{enter=resolve})
 const waiting=new Promise<void>(resolve=>{release=resolve})
 const wait=async()=>{enter();await waiting}
 if(waitFor==='candidate-read')f.query.mockImplementationOnce(async view=>{await wait();return execute(view)})
 const readEvidence=vi.fn<Parameters<typeof prepareCandidateProduction>[2]>(async version=>{
  if(waitFor==='evidence-read')await wait()
  return {...version,templateVersionRef:'T1',ruleVersionRef:'RULE',factRefs:[],
   formRequired:false,formVersionRef:null,requiredAttachmentRefs:[],attachmentRefs:[]}
 })
 try{
  const pending=prepareCandidateProduction(f.host,{selection,request},readEvidence)
  await entered
  changed()
  release()
  const prepared=await pending
  expect(readEvidence).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({documentId:'D',revisionId:'C',baselineId:'B'}))
  expect(prepared.request).toMatchObject({documentId:'D',revisionId:'C',requestKey:'ORIGINAL',toolVersionRef:'TOOL',
   outputOptions:{format:'PDF',print:{copies:1}},rootHash:expect.stringMatching(/^[a-f0-9]{64}$/u)})
  expect(()=>prepared.assertCurrent()).not.toThrow()
  expect(f.save).not.toHaveBeenCalled()
 }finally{release();f.ds.destroy()}
})
