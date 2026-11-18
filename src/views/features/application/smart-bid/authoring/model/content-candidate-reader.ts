/**
 * @module app:views/features/application/smart-bid/authoring/model/content-candidate-reader
 * 职责：在原正文运行实例串联候选修订、同版清单及完整节点成员。
 * 边界：仅返回原视图绑定与证明；不缓存载荷、不采用、不冒充完整业务闭包或三版预演。
 * AI用途：候选内容先核固定依据一致，再交后续业务检查；JSON内容与模板引用分别核对。
 */
import {assertRevisionTemplateBindings,readCalculationTableTemplateRefs,readContentDocumentScope,readRevisionTemplateBindings,type RevisionTemplateRef} from '@/services/smart-bid/content/revision-template-bindings'
import {resolveTemplateContentRules} from '@/services/smart-bid/content/references/template-content-rules'
import {resolveCalculationTableGenerator} from '@/services/smart-bid/content/references/calculation-table-generator'
import {assertRevisionResponseAnchors} from '@/services/smart-bid/content/references/revision-response-anchors'
import {assertRevisionResponseText,readIndependentResponseFactOccurrences,type IndependentResponseFactTarget} from '@/services/smart-bid/content/references/revision-response-text'
import {hasCompleteSingleContentResult,readContentRevisionBasis,readContentRevisions,type ContentRevisionReadHost,type ContentRevisionSelection,type ContentRevisionReadBinding} from './content-revision-reader'
import {assertContentNodeVersionPayload} from './content-node-version-reader'
import {assertRevisionManifest,readContentSnapshotIndex,type ContentSnapshotIndexBinding,type ContentSnapshotRole} from './content-snapshot-reader'
import {readContentSnapshotNodes,type ContentSnapshotNodesBinding} from './content-snapshot-nodes'
import {verifyReadableRevisionRoot} from './hashes/content-revision-root-reader'
import {readContentBaselineFact,readContentBaselineRequirement,readContentBaselineRequirementPins,readContentBaselineTenderRecord,readContentReviewBaseline,type ContentBaselineFactBinding,type ContentBaselineRequirementPinsBinding} from './content-baseline-reader'
import {assessBaselineRequirementPins} from '@/services/smart-bid/content/references/baseline-requirement-members'
import type {RevisionRequirementPin} from '@/services/smart-bid/content/references/revision-requirement-pins'
import {snapshotReferenceFields,snapshotReferenceIdentity,snapshotReferenceRecord,visitSnapshotReferences} from '@/services/smart-bid/content/references/snapshot-reference-values'
import {readTenderRecordReference} from '@/services/smart-bid/content/references/baseline-tender-records'
import {readContentTenderRecord} from './content-tender-record-reader'
import {previewScopedRevisionChanges,type ScopedContentPreviewInput} from '@/services/smart-bid/content/content-scoped-preview'
import {readEffectiveFactDependencies,readEffectiveFactsFromBaseline} from './hashes/effective-fact-reader'
import {hashCalculationInputs,hashCalculationInputSet} from '@/services/smart-bid/content/hashes/calculation-inputs-hash'
import {hashRequirementBindings} from '@/services/smart-bid/content/hashes/requirement-binding-hash'
import {hashQualificationReviews} from '@/services/smart-bid/content/hashes/qualification-review-hash'
import {hashContentRules} from '@/services/smart-bid/content/hashes/content-rules-hash'
import {hashScopedResponses,type ScopedResponseTarget} from '@/services/smart-bid/content/hashes/content-root-sections'
import {hashContentEffective,hashEffectiveResponseDependencies} from '@/services/smart-bid/content/hashes/content-effective-hash'
import {readContentSupplementalDisplayPositions} from '@/services/smart-bid/content/content-node-links'
import {resolveContentTargetScope} from '@/services/smart-bid/content/content-target-scope'
import {readEffectiveRequirementVersions} from './content-requirement-reader'
import {projectFactDisplayOccurrences,projectResponseFactDisplayOccurrences} from '@/services/smart-bid/content/hashes/fact-display-occurrences'
import {expandBuiltInCalculationTable,readBuiltInCalculationGenerator} from '@/services/smart-bid/content/calculation/calculation-table-registry'
import {ATTACHMENT_INDEX_GENERATOR} from '@/services/smart-bid/content/calculation/attachment-index-generator'
import {ComputedQueryRoot,computedGetTool} from '@/services/smart-bid/content/calculation/computed-query-tool'
import {previewContentTextSnapshot,type ContentResponseTextSnapshot,type ContentTextSnapshotPreview} from '@/services/smart-bid/content/content-text-snapshot-preview'
import {captureContentTextSpan,type ContentTextSelection,type VerifiedContentTextSpan} from '@/services/smart-bid/content/content-text-span'

/** 原候选及同版清单已证明基线身份；冻结和用途许可仍不在读取层推断。 */
export type ContentCandidateFactBinding=Omit<ContentBaselineFactBinding,'requiresRevisionMatchCheck'>&Readonly<{requiresRevisionMatchCheck:false}>
/** 候选固定基线的挂接诊断；要求原记录及准用另核。 */
export type ContentCandidateRequirementPinsBinding=Omit<ContentBaselineRequirementPinsBinding,'requiresRevisionMatchCheck'>&Readonly<{requiresRevisionMatchCheck:false}>
/** 候选章节、固定基线和原要求记录已匹配；用途另核。 */
export type ContentCandidateRequirementBinding=Omit<Awaited<ReturnType<typeof readContentBaselineRequirement>>,'requiresRevisionMatchCheck'>&Readonly<{requiresRevisionMatchCheck:false}>
type PreviewVersion=Readonly<{snapshot:ContentSnapshotIndexBinding;nodes:ContentSnapshotNodesBinding}>
type FixedCalculationTemplate=RevisionTemplateRef&Readonly<{classes:unknown;assertCurrent:()=>void}>
type ReadFixedCalculationTemplate=(ref:RevisionTemplateRef)=>Promise<FixedCalculationTemplate>
type FixedRulesTemplate=FixedCalculationTemplate&Readonly<{defaultDeliverable:boolean;restrictions:unknown}>
type ReadFixedRulesTemplate=(ref:RevisionTemplateRef)=>Promise<FixedRulesTemplate>
type CalculationSources=Readonly<{
 readTemplate:ReadFixedCalculationTemplate
 readGenerator?:(key:string)=>Readonly<{key:string;version:string;assertCurrent:()=>void}>|undefined
 assertInputsCurrent:()=>void
}>
type ComputedTable=ReturnType<typeof expandBuiltInCalculationTable>
type EffectiveFactsWithDisplays=Awaited<ReturnType<typeof readEffectiveFactDependencies>>&Readonly<{
 nodeDisplayRefs:ReturnType<typeof projectFactDisplayOccurrences>
 responseDisplayRefs:ReturnType<typeof projectResponseFactDisplayOccurrences>
}>
type ReviewBaseline=Awaited<ReturnType<typeof readContentReviewBaseline>>
type ReviewScope=Readonly<{nodeIds:readonly string[];responses:readonly ScopedResponseTarget[]}>
type RequirementBindingDigest=Readonly<{requirementBindingHash:string;requiresUseCheck:true;assertCurrent:()=>void}>
type ReviewDependencies=Readonly<{
 facts:EffectiveFactsWithDisplays;requirements:RequirementBindingDigest;responseDependencyHash:string;assertCurrent:()=>void
}>
type SubtreeReviewSources=Readonly<{
 readTemplate:ReadFixedRulesTemplate
 readSupplement:(nodeIds:readonly string[])=>Promise<Readonly<{
  qualificationIds:readonly string[];displayRefs:unknown;calculations:ReadonlyArray<Readonly<{
   table:ComputedTable;assertCurrent:()=>void
  }>>;assertCurrent:()=>void
 }>>
}>
type PreviewVersions=Readonly<{basis:PreviewVersion|null;head:PreviewVersion|null;candidate:PreviewVersion;assertCurrent:()=>void}>
type PreviewScopeInput=Pick<ScopedContentPreviewInput,'declaredAddedNodeIds'>
type CandidateScopePreview=Readonly<ReturnType<typeof previewScopedRevisionChanges>&{assertCurrent:()=>void}>
type CandidateNodeSelection=Pick<ContentTextSelection,'path'|'start'|'end'|'mode'>&Readonly<{role:'candidate'|'head';nodeId:string}>
type NodeTextCoordinates=Omit<CandidateNodeSelection,'role'|'mode'>
type NodeTextChange=Readonly<{operation:'delete';target:NodeTextCoordinates}>
 |Readonly<{operation:'insert'|'replace';source:NodeTextCoordinates;target:NodeTextCoordinates}>
type TextPreviewBinding=Readonly<ContentTextSnapshotPreview&{assertCurrent:()=>void}>
type TextSelectionBinding=Readonly<VerifiedContentTextSpan&{assertCurrent:()=>void}>
type RevisionRootProof=Awaited<ReturnType<typeof verifyReadableRevisionRoot>>
type PreviewRootProofs=Readonly<{candidate:RevisionRootProof;basis:RevisionRootProof|null;head:RevisionRootProof|null;assertCurrent:()=>void}>
type PreviewVersionSession=PreviewVersions&Readonly<{
 previewText:(changes:unknown)=>Promise<TextPreviewBinding>
 captureNodeTextSelection:(input:CandidateNodeSelection)=>Promise<TextSelectionBinding>
 previewNodeTextChange:(change:NodeTextChange)=>Promise<TextPreviewBinding>
 verifyRootHashes:(contract:string)=>Promise<PreviewRootProofs>
}>


/** 候选链保留各原视图证明；其它业务分组、当前依据、rootHash和采用必须继续核验。 */
export type ContentCandidateBinding=Readonly<{
 runtime:ContentRevisionReadHost['runtime']
 readFixedFact:(selection:Readonly<{factId:string;version?:number}>,assertConsumer?:()=>void)=>Promise<ContentCandidateFactBinding>
 readNodeEffectiveFacts:(nodeIds:readonly string[],assertConsumer?:()=>void)=>Promise<EffectiveFactsWithDisplays>
 hashNodeCalculationInputs:(nodeIds:readonly string[],tables:unknown,sources:CalculationSources)=>
  Promise<Awaited<ReturnType<typeof hashCalculationInputs>>&Readonly<{assertCurrent:()=>void}>>
 readCalculationTemplates:(nodeIds:readonly string[])=>ReturnType<typeof readCalculationTableTemplateRefs>
 expandAttachmentIndex:(nodeId:string,source:Readonly<{entries:unknown;assertCurrent:()=>void}>,readTemplate:ReadFixedCalculationTemplate)=>
  Promise<Readonly<{
   table:ComputedTable;calculationInputsHash:string;assertCurrent:()=>void
   readComputed:(target:Readonly<{nodeId:string;inputHash:string}>)=>ComputedTable
   computedGet:(input:unknown)=>Readonly<{nodeId:string;inputHash:string;data:ComputedTable['data']}>
   computedGetTool:typeof computedGetTool
   createComputedQueryRoot:(assertAllowed:()=>void)=>ComputedQueryRoot
  }>>
 resolveCalculationGenerators:(nodeIds:readonly string[],readTemplate:ReadFixedCalculationTemplate)=>Promise<Readonly<{
  tables:ReadonlyArray<Readonly<{nodeId:string;generatorKey:string}>>;assertCurrent:()=>void
 }>>
 readEffectiveFacts:(scope:ReviewScope,assertConsumer?:()=>void)=>Promise<EffectiveFactsWithDisplays>
 readRequirementPinIssues:(assertConsumer?:()=>void,nodeIds?:readonly string[])=>Promise<ContentCandidateRequirementPinsBinding>
 readRequirementBindingHash:(nodeIds:readonly string[],assertConsumer?:()=>void)=>Promise<RequirementBindingDigest>
 readContentRulesHash:(nodeIds:readonly string[],readTemplate:ReadFixedRulesTemplate)=>
  Promise<Readonly<{contentRulesHash:string;assertCurrent:()=>void}>>
 readQualificationHash:(reviewIds:readonly string[],assertConsumer?:()=>void)=>Promise<Readonly<{
  qualificationHash:string;requiresUseCheck:true;assertCurrent:()=>void
 }>>
 readReviewDependencies:(scope:ReviewScope,assertConsumer?:()=>void)=>Promise<ReviewDependencies>
 readSubtreeReviewDependencies:(nodeId:string,responses:readonly ScopedResponseTarget[],assertConsumer?:()=>void)=>
  Promise<ReviewDependencies&Readonly<{subtreeHash:string;nodeIds:readonly string[]}>>
 readSubtreeEffectiveHash:(nodeId:string,responses:readonly ScopedResponseTarget[],sources:SubtreeReviewSources,assertConsumer?:()=>void)=>
  Promise<Readonly<{effectiveHash:string;requiresUseCheck:true;assertCurrent:()=>void}>>
 readFixedRequirement:(pin:RevisionRequirementPin,assertConsumer?:()=>void)=>Promise<ContentCandidateRequirementBinding>
 readFixedTenderRecord:(reference:unknown,assertConsumer?:()=>void)=>ReturnType<typeof readContentTenderRecord>
 readPreviewVersions:(assertConsumer?:()=>void)=>Promise<PreviewVersionSession>
 verifyRootHash:(contract:string)=>ReturnType<typeof verifyReadableRevisionRoot>
 previewScope:(input:PreviewScopeInput,assertConsumer?:()=>void)=>Promise<CandidateScopePreview>
 previewText:(changes:unknown,assertConsumer?:()=>void)=>Promise<TextPreviewBinding>
 captureNodeTextSelection:(input:CandidateNodeSelection,assertConsumer?:()=>void)=>Promise<TextSelectionBinding>
 revisions:ContentRevisionReadBinding;snapshot:ContentSnapshotIndexBinding;nodes:ContentSnapshotNodesBinding
 revisionMatchVerified:true;templateBindingsVerified:true;requirementBindingsVerified:true;responseAnchorsVerified:true;responseTextVerified:true
 requiresResponseReferenceChecks:true;requiresResponsePayloadChecks:true;requiresTemplateResourceChecks:true;requiresRequirementVersionChecks:true;requiresBusinessSectionChecks:true;assertCurrent:()=>void
}>

/** 只装配候选；头/基准须另用正式角色视图，不能覆盖本次单个快照视图后沿用旧证明。 */
export async function readCandidateContent(host:ContentRevisionReadHost,selection:ContentRevisionSelection):Promise<ContentCandidateBinding>{
 const {candidateRevisionId,expectedHead}=selection
 const revisions=await readContentRevisions(host,{candidateRevisionId,expectedHead})
 const candidate=host.runtime.resolveView(revisions.candidateDataViewKey)
 if(!candidate||!hasCompleteSingleContentResult(candidate))throw Error('CONTENT_CANDIDATE_NOT_UNIQUE')
 const row=candidate.rows[0]
 if(!row)throw Error('CONTENT_CANDIDATE_UNAVAILABLE')
 const assertResult=candidate.captureReadResult()
 const assertRow=candidate.captureReadRow(row,['id','projectId','status','snapshotHash','baselineId','stageRef','templateRefs'])
 const assertCandidate=()=>{host.assertCurrent();revisions.assertCurrent();assertResult();assertRow()}
 assertCandidate()
 const snapshotHash=row['snapshotHash']
 if(typeof snapshotHash!=='string')throw Error('CONTENT_CANDIDATE_SNAPSHOT_REQUIRED')
 const snapshot=await readContentSnapshotIndex(host,{snapshotHash})
 assertCandidate();snapshot.assertCurrent()
 const snapshotView=host.runtime.resolveView(snapshot.dataViewKey),manifest=snapshotView?.rows[0]?.['manifest']
 // 同一规范编码保留精确引用身份；临时比较值不是另一份可编辑或保存的业务真源。
 assertRevisionManifest(manifest,row)
 const nodes=await readContentSnapshotNodes(host,snapshot)
 const assertCurrent=()=>{assertCandidate();snapshot.assertCurrent();nodes.assertCurrent()}
 assertCurrent()
 const payloads=(nodes.dataViewKey?host.runtime.resolveView(nodes.dataViewKey)?.rows:[])?.map(member=>{
  const nodeId=member['nodeId'],payload=member['payload']
  if(typeof nodeId!=='string')throw Error('CONTENT_CANDIDATE_NODE_REQUIRED')
  assertContentNodeVersionPayload(payload,nodeId)
  return payload
 })
 if(!payloads)throw Error('CONTENT_CANDIDATE_NODE_REQUIRED')
 const templateRefs:unknown=Object.getOwnPropertyDescriptor(manifest,'templateRefs')?.value
 assertRevisionTemplateBindings(templateRefs,payloads)
 const requirementPins:unknown=Object.getOwnPropertyDescriptor(manifest,'requirementPins')?.value
 const responses:unknown=Object.getOwnPropertyDescriptor(manifest,'responses')?.value
 assertRevisionResponseAnchors(responses,requirementPins,payloads)
 assertRevisionResponseText(responses,payloads.map(payload=>payload.nodeId))
 assertCurrent()
 const verifiedExpansions=new WeakSet<object>()
 const readCalculationTemplates=(nodeIds:readonly string[])=>{
  assertCurrent()
  return readCalculationTableTemplateRefs(templateRefs,payloads,nodes.readCalculationTableIds(nodeIds))
 }
 const readContentRulesHash:ContentCandidateBinding['readContentRulesHash']=async(nodeIds,readTemplate)=>{
  assertCurrent()
  const scope=readContentDocumentScope(payloads,nodeIds)
  const bindings=readRevisionTemplateBindings(templateRefs,payloads),templates=new Map<string,FixedRulesTemplate>()
  for(const documentId of new Set(scope.map(item=>item.documentId))){
   const ref=bindings.get(documentId)
   if(!ref)throw Error('CONTENT_RULES_TEMPLATE_REQUIRED')
   const template=await readTemplate(ref)
   assertCurrent()
   if(template.documentId!==ref.documentId||template.key!==ref.key||template.version!==ref.version||template.hash!==ref.hash)
    throw Error('CONTENT_RULES_TEMPLATE_MISMATCH')
   template.assertCurrent()
   templates.set(documentId,template)
  }
  const assertRules=()=>{assertCurrent();for(const template of templates.values())template.assertCurrent()}
  assertRules()
  const byNode=new Map(payloads.map(node=>[node.nodeId,node]))
  const rules=scope.map(item=>{
   const source=templates.get(item.documentId)
   if(!source)throw Error('CONTENT_RULES_TEMPLATE_REQUIRED')
   return {...item,...resolveTemplateContentRules(byNode.get(item.nodeId),source.classes,source.defaultDeliverable)}
  })
  const documents=[...templates].map(([documentId,template])=>({documentId,restrictions:template.restrictions}))
  const contentRulesHash=await hashContentRules({scope,nodes:rules,documents})
  assertRules()
  return Object.freeze({contentRulesHash,assertCurrent:assertRules})
 }
 const resolveCalculationGenerators:ContentCandidateBinding['resolveCalculationGenerators']=async(nodeIds,readTemplate)=>{
  const selected=readCalculationTemplates(nodeIds),byNodeId=new Map(payloads.map(node=>[node.nodeId,node]))
  const templates=new Map<string,FixedCalculationTemplate>()
  const tables:Array<Readonly<{nodeId:string;generatorKey:string}>>=[]
  for(const {nodeId,template} of selected){
   const identity=JSON.stringify([template.documentId,template.key,template.version,template.hash])
   let source=templates.get(identity)
   if(!source){
    source=await readTemplate(template)
    assertCurrent()
    if(source.documentId!==template.documentId||source.key!==template.key||source.version!==template.version||source.hash!==template.hash)
     throw Error('CONTENT_CALCULATION_TEMPLATE_MISMATCH')
    templates.set(identity,source)
   }
   source.assertCurrent()
   const generatorKey=resolveCalculationTableGenerator(byNodeId.get(nodeId),source.classes)
   if(generatorKey===null)throw Error('CONTENT_CALCULATION_GENERATOR_REQUIRED')
   tables.push(Object.freeze({nodeId,generatorKey}))
  }
  const assertInputs=()=>{assertCurrent();for(const source of templates.values())source.assertCurrent()}
  assertInputs()
  return Object.freeze({tables:Object.freeze(tables),assertCurrent:assertInputs})
 }
 const hashNodeCalculationInputs:ContentCandidateBinding['hashNodeCalculationInputs']=async(nodeIds,tables,sources)=>{
  const {readTemplate,readGenerator=readBuiltInCalculationGenerator,assertInputsCurrent}=sources
  assertCurrent();assertInputsCurrent()
  const resolution=await resolveCalculationGenerators(nodeIds,readTemplate)
  const proofs=new Set<()=>void>(),generatorVersions=new Map<string,string>()
  for(const {nodeId,generatorKey} of resolution.tables){
   const generator=readGenerator(generatorKey)
   if(generator?.key!==generatorKey||!snapshotReferenceIdentity(generator.version))throw Error('CONTENT_CALCULATION_GENERATOR_VERSION')
   proofs.add(()=>generator.assertCurrent())
   generatorVersions.set(nodeId,generator.version)
  }
  const assertInputs=()=>{resolution.assertCurrent();assertInputsCurrent();for(const proof of proofs)proof()}
  assertInputs()
  const result=await hashCalculationInputs({expectedNodeIds:[...generatorVersions.keys()],tables,generatorVersions})
  assertInputs()
  return Object.freeze({...result,assertCurrent:assertInputs})
 }
 const expandAttachmentIndex:ContentCandidateBinding['expandAttachmentIndex']=async(nodeId,source,readTemplate)=>{
  assertCurrent();source.assertCurrent()
  const entries:unknown=structuredClone(source.entries)
  const resolution=await resolveCalculationGenerators([nodeId],readTemplate)
  const {key,version}=ATTACHMENT_INDEX_GENERATOR
  if(resolution.tables[0]?.generatorKey!==key)throw Error('CONTENT_CALCULATION_GENERATOR_REQUIRED')
  const assertInputs=()=>{resolution.assertCurrent();source.assertCurrent()}
  assertInputs()
  const digest=await hashCalculationInputs({expectedNodeIds:[nodeId],tables:[{nodeId,generatorVersion:version,
   formInstructionRefs:[],requirementVersions:[],confirmedResponses:[],factVersions:[],resourceVersions:entries}]})
  const inputHash=digest.tables[0]?.inputHash
  if(!inputHash)throw Error('CONTENT_CALCULATION_INPUT_SCOPE')
  const table=expandBuiltInCalculationTable({placeholder:payloads.find(node=>node.nodeId===nodeId),
   generatorKey:key,generatorVersion:version,inputHash,nodeIds:new Set(payloads.map(node=>node.nodeId)),entries,assertCurrent:assertInputs})
  const readComputed=(target:Readonly<{nodeId:string;inputHash:string}>)=>{
   assertInputs()
   if(target.nodeId!==table.nodeId||target.inputHash!==table.inputHash)throw Error('CONTENT_COMPUTED_RESULT_MISMATCH')
   return table
  }
  const computedGet=(input:unknown)=>{
   const error='CONTENT_COMPUTED_QUERY_SCOPE'
   const query=snapshotReferenceFields(input,['projectId','revisionId','nodeId','inputHash'],error)
   const {nodeId:requestedNodeId,inputHash:requestedHash}=query
   if(query['projectId']!==host.projectId||query['revisionId']!==candidateRevisionId||
    !snapshotReferenceIdentity(requestedNodeId)||typeof requestedHash!=='string'||!/^[a-f0-9]{64}$/u.test(requestedHash))throw Error(error)
   const result=readComputed({nodeId:requestedNodeId,inputHash:requestedHash})
   return Object.freeze({nodeId:result.nodeId,inputHash:result.inputHash,data:result.data})
  }
  const expansion=Object.freeze({table,calculationInputsHash:digest.calculationInputsHash,assertCurrent:assertInputs,readComputed,computedGet,computedGetTool,
   createComputedQueryRoot:(assertAllowed:()=>void)=>new ComputedQueryRoot(computedGet,assertAllowed)})
  verifiedExpansions.add(expansion)
  return expansion
 }
 const readEffectiveFacts=async(scope:ReviewScope,assertConsumer?:()=>void,baseline?:ReviewBaseline):Promise<EffectiveFactsWithDisplays>=>{
  const assertContext=()=>{assertCurrent();assertConsumer?.()}
  assertContext()
  const baselineId=row['baselineId']
  if(typeof baselineId!=='string')throw Error('CONTENT_CANDIDATE_BASELINE_REQUIRED')
  const answered=scope.responses.filter((target):target is IndependentResponseFactTarget=>target.responseId!==null)
  const responseOccurrences=readIndependentResponseFactOccurrences(responses,answered)
  const usedFactIds=[...nodes.readFactIds(scope.nodeIds),...responseOccurrences.map(item=>item.factId)]
  const selectedNodeIds=new Set(scope.nodeIds)
  const readHost={...host,assertCurrent:assertContext}
  const result=baseline?await readEffectiveFactsFromBaseline(readHost,usedFactIds,baseline):
   await readEffectiveFactDependencies(readHost,{baselineId,stageRef:row['stageRef'],usedFactIds})
  result.assertCurrent()
  const nodeDisplayRefs=projectFactDisplayOccurrences(payloads.filter(node=>selectedNodeIds.has(node.nodeId)),result.displayHashes)
  const responseDisplayRefs=projectResponseFactDisplayOccurrences(responseOccurrences,result.displayHashes)
  return Object.freeze({...result,nodeDisplayRefs,responseDisplayRefs})
 }
 const readFixedFact=async(factSelection:Readonly<{factId:string;version?:number}>,assertConsumer?:()=>void):Promise<ContentCandidateFactBinding>=>{
  const assertContext=()=>{assertCurrent();assertConsumer?.()}
  assertContext()
  const baselineId=row['baselineId']
  if(typeof baselineId!=='string')throw Error('CONTENT_CANDIDATE_BASELINE_REQUIRED')
  const fact=await readContentBaselineFact({...host,assertCurrent:assertContext},{...factSelection,baselineId,stageRef:row['stageRef']})
  const assertFact=()=>{assertContext();fact.assertCurrent()}
  assertFact()
  return Object.freeze({...fact,requiresRevisionMatchCheck:false,assertCurrent:assertFact})
 }
 const readScopedRequirementPins=async(assertConsumer?:()=>void,nodeIds?:readonly string[],baseline?:ReviewBaseline)=>{
  const assertContext=()=>{assertCurrent();assertConsumer?.()}
  assertContext()
  const baselineId=row['baselineId']
  if(typeof baselineId!=='string')throw Error('CONTENT_CANDIDATE_BASELINE_REQUIRED')
  const selected=new Set(nodeIds??payloads.map(node=>node.nodeId))
  const scopedNodes=payloads.filter(node=>selected.has(node.nodeId))
  if(selected.size!==scopedNodes.length||nodeIds!==undefined&&selected.size!==nodeIds.length)
   throw Error('CONTENT_CANDIDATE_REQUIREMENT_SCOPE')
  const pins:RevisionRequirementPin[]=[]
  visitSnapshotReferences(requirementPins,item=>{
   const {chapterId,lineageId,version}=snapshotReferenceFields(item,['chapterId','lineageId','version'],'CONTENT_CANDIDATE_REQUIREMENT_PIN')
   if(typeof chapterId!=='string'||typeof lineageId!=='string'||typeof version!=='string')
    throw Error('CONTENT_CANDIDATE_REQUIREMENT_PIN')
   if(selected.has(chapterId))pins.push({chapterId,lineageId,version})
  },'CONTENT_CANDIDATE_REQUIREMENT_PIN')
  baseline?.assertCurrent()
  const report=baseline?{
   baselineDataViewKey:baseline.dataViewKey,issues:assessBaselineRequirementPins(baseline.requirementVersions,pins,scopedNodes),
   requiresUseCheck:true as const,assertCurrent:baseline.assertCurrent,
  }:await readContentBaselineRequirementPins({...host,assertCurrent:assertContext},
    {baselineId,stageRef:row['stageRef'],pins,nodes:scopedNodes})
  const assertReport=()=>{assertContext();report.assertCurrent()}
  assertReport()
  return {pins,report:Object.freeze({...report,requiresRevisionMatchCheck:false as const,assertCurrent:assertReport})}
 }
 const readRequirementPinIssues:ContentCandidateBinding['readRequirementPinIssues']=async(assertConsumer,nodeIds)=>
  (await readScopedRequirementPins(assertConsumer,nodeIds)).report
 const readRequirementBindingHash=async(nodeIds:readonly string[],assertConsumer?:()=>void,baseline?:ReviewBaseline):Promise<RequirementBindingDigest>=>{
  const {pins,report}=await readScopedRequirementPins(assertConsumer,nodeIds,baseline)
  const originals=await readEffectiveRequirementVersions({...host,assertCurrent:report.assertCurrent},pins)
  originals.assertCurrent()
  const key=(pin:Pick<RevisionRequirementPin,'lineageId'|'version'>)=>JSON.stringify([pin.lineageId,pin.version])
  const pinKey=(pin:RevisionRequirementPin)=>JSON.stringify([pin.chapterId,pin.lineageId,pin.version])
  const contents=new Map(originals.records.map(record=>[key(record),record.requirementContentHash]))
  const issues=new Map(report.issues.map(issue=>[pinKey(issue),issue]))
  const records=pins.map(pin=>{
   const issue=issues.get(pinKey(pin))
   return {...pin,selectedVersion:issue===undefined?pin.version:issue.reason==='VERSION_CHANGED'?issue.selectedVersion:null,
    requirementContentHash:contents.get(key(pin))}
  })
  const requirementBindingHash=await hashRequirementBindings(pins,records)
  originals.assertCurrent()
  return Object.freeze({requirementBindingHash,requiresUseCheck:true,assertCurrent:originals.assertCurrent})
 }
 const readReviewDependencies:ContentCandidateBinding['readReviewDependencies']=async(scope,assertConsumer)=>{
  const assertContext=()=>{assertCurrent();assertConsumer?.()}
  assertContext()
  const baselineId=row['baselineId']
  if(typeof baselineId!=='string')throw Error('CONTENT_CANDIDATE_BASELINE_REQUIRED')
  const captured=structuredClone(scope)
  const responseHash=await hashScopedResponses(manifest,captured.nodeIds,captured.responses)
  assertContext()
  const baseline=await readContentReviewBaseline({...host,assertCurrent:assertContext},{baselineId,stageRef:row['stageRef']})
  const facts=await readEffectiveFacts(captured,assertConsumer,baseline)
  const requirements=await readRequirementBindingHash(captured.nodeIds,assertConsumer,baseline)
  const responseDependencyHash=await hashEffectiveResponseDependencies(responseHash,facts.responseDisplayRefs)
  const assertDependencies=()=>{facts.assertCurrent();requirements.assertCurrent()}
  assertDependencies()
  return Object.freeze({facts,requirements,responseDependencyHash,assertCurrent:assertDependencies})
 }
 const readSubtreeReviewDependencies:ContentCandidateBinding['readSubtreeReviewDependencies']=async(nodeId,responseTargets,assertConsumer)=>{
  assertCurrent();assertConsumer?.()
  const subtreeHash=nodes.subtreeHashes.find(item=>item.nodeId===nodeId)?.subtreeHash
  if(subtreeHash===undefined)throw Error('CONTENT_REVIEW_SUBTREE_REQUIRED')
  const {nodeIds}=resolveContentTargetScope({projectId:host.projectId,basisNodes:payloads,responses:[],
   scope:{schemaVersion:2,projectId:host.projectId,targets:[{kind:'NODE',nodeId,extent:'SUBTREE'}]}})
  const dependencies=await readReviewDependencies({nodeIds,responses:responseTargets},assertConsumer)
  dependencies.assertCurrent()
  return Object.freeze({...dependencies,subtreeHash,nodeIds:Object.freeze([...nodeIds])})
 }
 const readQualificationHash:ContentCandidateBinding['readQualificationHash']=async(reviewIds,assertConsumer)=>{
  const assertContext=()=>{assertCurrent();assertConsumer?.()}
  assertContext()
  const reviews:unknown=Object.getOwnPropertyDescriptor(manifest,'qualificationReviews')?.value
  const qualificationHash=await hashQualificationReviews(reviews,reviewIds)
  assertContext()
  return Object.freeze({qualificationHash,requiresUseCheck:true,assertCurrent:assertContext})
 }
 const readSubtreeEffectiveHash:ContentCandidateBinding['readSubtreeEffectiveHash']=async(nodeId,responseTargets,sources,assertConsumer)=>{
  const dependencies=await readSubtreeReviewDependencies(nodeId,responseTargets,assertConsumer)
  const {nodeIds}=dependencies,selected=new Set(nodeIds)
  const supplement=await sources.readSupplement(nodeIds)
  const calculations=[...supplement.calculations]
  if(calculations.some(item=>!verifiedExpansions.has(item)))throw Error('CONTENT_REVIEW_CALCULATION_SOURCE')
  const assertSupplement=()=>{
   dependencies.assertCurrent();supplement.assertCurrent()
   for(const calculation of calculations)calculation.assertCurrent()
  }
  assertSupplement()
  const displayRefs:unknown[]=[...dependencies.facts.nodeDisplayRefs]
  const calculationTables=nodes.readCalculationTableIds(nodeIds)
  const calculationInputsHash=await hashCalculationInputSet(calculationTables,calculations.map(item=>item.table))
  assertSupplement()
  const expected=new Set(payloads.filter(node=>selected.has(node.nodeId)).flatMap(node=>
   readContentSupplementalDisplayPositions(node).map(occurrence=>JSON.stringify([node.nodeId,occurrence]))))
  for(const {table} of calculations)for(const occurrence of readContentSupplementalDisplayPositions(table.presentationNode))
   expected.add(JSON.stringify([table.nodeId,occurrence]))
  visitSnapshotReferences(supplement.displayRefs,item=>{
   const ref=snapshotReferenceFields(item,['nodeId','occurrence','displayHash'],'CONTENT_REVIEW_DISPLAY_SCOPE')
   const {nodeId:owner,occurrence}=ref
   if(typeof owner!=='string'||!expected.delete(JSON.stringify([owner,occurrence])))throw Error('CONTENT_REVIEW_DISPLAY_SCOPE')
   displayRefs.push(ref)
  },'CONTENT_REVIEW_DISPLAY_SCOPE')
  if(expected.size)throw Error('CONTENT_REVIEW_DISPLAY_INCOMPLETE')
  const qualification=await readQualificationHash(supplement.qualificationIds,assertSupplement)
  const rules=await readContentRulesHash(nodeIds,sources.readTemplate)
  const assertEffective=()=>{qualification.assertCurrent();rules.assertCurrent()}
  assertEffective()
  const effectiveHash=await hashContentEffective({
   subtreeHash:dependencies.subtreeHash,displayRefs,factDependencyHash:dependencies.facts.factDependencyHash,
   requirementBindingHash:dependencies.requirements.requirementBindingHash,responseDependencyHash:dependencies.responseDependencyHash,
   qualificationHash:qualification.qualificationHash,contentRulesHash:rules.contentRulesHash,
   calculationInputsHash,
  })
  assertEffective()
  return Object.freeze({effectiveHash,requiresUseCheck:true,assertCurrent:assertEffective})
 }
 const readFixedRequirement=async(pin:RevisionRequirementPin,assertConsumer?:()=>void):Promise<ContentCandidateRequirementBinding>=>{
  const assertContext=()=>{assertCurrent();assertConsumer?.()}
  assertContext()
  const baselineId=row['baselineId']
  if(typeof baselineId!=='string')throw Error('CONTENT_CANDIDATE_BASELINE_REQUIRED')
  const {chapterId,lineageId,version}=pin
  const matched=Array.isArray(requirementPins)&&requirementPins.some((item:unknown)=>{
   const originalPin=snapshotReferenceFields(item,['chapterId','lineageId','version'],'CONTENT_CANDIDATE_REQUIREMENT_PIN')
   return originalPin['chapterId']===chapterId&&originalPin['lineageId']===lineageId&&originalPin['version']===version
  })
  if(!matched)throw Error('CONTENT_CANDIDATE_REQUIREMENT_PIN')
  const result=await readContentBaselineRequirement({...host,assertCurrent:assertContext},{baselineId,stageRef:row['stageRef'],lineageId,version})
  result.assertCurrent()
  return Object.freeze({...result,requiresRevisionMatchCheck:false})
 }
 const readFixedTenderRecord=async(reference:unknown,assertConsumer?:()=>void)=>{
  const assertContext=()=>{assertCurrent();assertConsumer?.()}
  assertContext()
  const fixedReference=readTenderRecordReference(reference)
  const baselineId=row['baselineId']
  if(typeof baselineId!=='string')throw Error('CONTENT_CANDIDATE_BASELINE_REQUIRED')
  const baseline=await readContentBaselineTenderRecord({...host,assertCurrent:assertContext},{baselineId,stageRef:row['stageRef']},fixedReference)
  return readContentTenderRecord({...host,assertCurrent:baseline.assertCurrent},fixedReference)
 }
 const readPreviewVersions=async(assertConsumer?:()=>void):Promise<PreviewVersionSession>=>{
  const assertContext=()=>{assertCurrent();assertConsumer?.()}
  const basisRevision=await readContentRevisionBasis({...host,assertCurrent:assertContext},revisions)
  const assertRevisions=()=>{assertContext();basisRevision.assertCurrent()}
  const readVersion=async(revisionKey:string|null,role:ContentSnapshotRole):Promise<PreviewVersion|null>=>{
   assertRevisions()
   if(revisionKey===null)return null
   const view=host.runtime.resolveView(revisionKey),revisionRow=view?.rows[0],hash=revisionRow?.['snapshotHash']
   if(!view||!revisionRow||typeof hash!=='string')throw Error('CONTENT_CANDIDATE_SNAPSHOT_REQUIRED')
   const assertRevisionRow=view.captureReadRow(revisionRow,['projectId','snapshotHash','baselineId','stageRef','templateRefs'])
   const versionHost={...host,assertCurrent:()=>{assertRevisions();assertRevisionRow()}}
   const index=await readContentSnapshotIndex(versionHost,{snapshotHash:hash},role)
   assertRevisionManifest(host.runtime.resolveView(index.dataViewKey)?.rows[0]?.['manifest'],revisionRow)
   const members=await readContentSnapshotNodes(versionHost,index)
   return Object.freeze({snapshot:index,nodes:members})
  }
  const [basis,head]=await Promise.all([readVersion(basisRevision.dataViewKey,'basis'),readVersion(revisions.headDataViewKey,'head')])
  const assertPreview=()=>{assertRevisions();basis?.nodes.assertCurrent();head?.nodes.assertCurrent()}
  assertPreview()
  const versions={basis,head,candidate:Object.freeze({snapshot,nodes}),assertCurrent:assertPreview}
  const captureSelection=(input:CandidateNodeSelection)=>captureNodeSelection(input,input.role==='candidate'?versions.candidate:head,assertPreview)
  return Object.freeze({...versions,
   async verifyRootHashes(contract:string){
    const verify=(revisionDataViewKey:string,snapshotIndex:ContentSnapshotIndexBinding)=>verifyReadableRevisionRoot({
     host:{...host,assertCurrent:assertPreview},revisionDataViewKey,snapshot:snapshotIndex,contract,
    })
    const [candidateRoot,basisRoot,headRoot]=await Promise.all([
     verify(revisions.candidateDataViewKey,snapshot),
     basis&&basisRevision.dataViewKey?verify(basisRevision.dataViewKey,basis.snapshot):null,
     head&&revisions.headDataViewKey?verify(revisions.headDataViewKey,head.snapshot):null,
    ])
    const assertRoots=()=>{candidateRoot.assertCurrent();basisRoot?.assertCurrent();headRoot?.assertCurrent()}
    assertRoots()
    return Object.freeze({candidate:candidateRoot,basis:basisRoot,head:headRoot,assertCurrent:assertRoots})
   },
   previewText:(changes:unknown)=>previewTextFromVersions(versions,changes),
   captureNodeTextSelection:captureSelection,
   previewNodeTextChange:async(change:NodeTextChange)=>{
    assertPreview()
    const assertTargetScope=candidate.captureReadRow(row,['targetScope'])
    const {operation}=change
    const [target,source]=await Promise.all([
     captureSelection({...change.target,role:'head',mode:operation==='insert'?'INSERTION':'TEXT'}),
     change.operation==='delete'?null:captureSelection({...change.source,role:'candidate',mode:'TEXT'}),
    ])
    assertTargetScope()
    return previewTextFromVersions(versions,[{operation,targetRef:target.reference,...(source?{sourceRef:source.reference}:{})}])
   },
  })
 }
 const readNodes=(version:PreviewVersion|null)=>{
   const key=version?.nodes.dataViewKey
   if(!key)return []
   const view=host.runtime.resolveView(key)
   if(!view)throw Error('CONTENT_CANDIDATE_NODE_REQUIRED')
   return view.rows.map(member=>member['payload'])
 }
 const readManifest=(version:PreviewVersion|null)=>version===null?null:
   host.runtime.resolveView(version.snapshot.dataViewKey)?.rows[0]?.['manifest']
 const previewScope=async(input:PreviewScopeInput,assertConsumer?:()=>void):Promise<CandidateScopePreview>=>{
  assertCurrent();assertConsumer?.()
  const assertTargetScope=candidate.captureReadRow(row,['targetScope'])
  const {declaredAddedNodeIds}=structuredClone(input)
  const versions=await readPreviewVersions(assertConsumer)
  const assertPreview=()=>{versions.assertCurrent();assertTargetScope()}
  assertPreview()
  const result=previewScopedRevisionChanges({projectId:host.projectId,basis:readNodes(versions.basis),
   current:readNodes(versions.head),candidate:readNodes(versions.candidate),targetScope:row['targetScope'],declaredAddedNodeIds},
  {basis:readManifest(versions.basis),current:readManifest(versions.head),candidate:readManifest(versions.candidate)})
  assertPreview()
  return Object.freeze({...result,assertCurrent:assertPreview})
 }
 const previewTextFromVersions=async(versions:PreviewVersions,changes:unknown):Promise<TextPreviewBinding>=>{
  versions.assertCurrent()
  if(expectedHead===null)throw Error('CONTENT_TEXT_HEAD_REQUIRED')
  const assertTargetScope=candidate.captureReadRow(row,['targetScope'])
  const capturedChanges=structuredClone(changes)
  const assertPreview=()=>{versions.assertCurrent();assertTargetScope()}
  assertPreview()
  const readResponses=(version:PreviewVersion|null)=>{
   const error='CONTENT_TEXT_RESPONSE_SNAPSHOT',values:ContentResponseTextSnapshot[]=[]
   const versionManifest=snapshotReferenceRecord(readManifest(version),error)
   visitSnapshotReferences(versionManifest['responses'],value=>{
    const response=snapshotReferenceRecord(value,error)
    if(Object.hasOwn(response,'chapterId'))return
    const {id,assignmentId,statement,data}=response
    if(typeof id!=='string'||typeof assignmentId!=='string'||typeof statement!=='string')throw Error(error)
    values.push({projectId:host.projectId,responseId:id,assignmentId,statement,data:snapshotReferenceRecord(data,error)})
   },error)
   return values
  }
  const result=await previewContentTextSnapshot({projectId:host.projectId,candidateRevisionId,
   expectedHead,targetScope:row['targetScope'],changes:capturedChanges,
   candidateNodes:readNodes(versions.candidate),currentNodes:readNodes(versions.head),
   candidateResponses:readResponses(versions.candidate),currentResponses:readResponses(versions.head)})
  assertPreview()
  return Object.freeze({...result,assertCurrent:assertPreview})
 }
 const captureNodeSelection=async(input:CandidateNodeSelection,version:PreviewVersion|null,assertContext:()=>void):Promise<TextSelectionBinding>=>{
  const {role,nodeId,path,start,end,mode}=input
  assertContext()
  const revisionId=role==='candidate'?candidateRevisionId:expectedHead
  if(revisionId===null)throw Error('CONTENT_TEXT_HEAD_REQUIRED')
  const key=version?.nodes.dataViewKey
  if(!key)throw Error('CONTENT_CANDIDATE_NODE_REQUIRED')
  const assertSelection=()=>{assertContext();version.nodes.assertCurrent()}
  assertSelection()
  const selected=host.runtime.resolveView(key)?.rows.find(member=>member['nodeId']===nodeId)
  if(!selected)throw Error('CONTENT_CANDIDATE_NODE_REQUIRED')
  const result=await captureContentTextSpan({projectId:host.projectId,revisionId,owner:{kind:'NODE',nodeId},
   object:selected['payload'],path,start,end,mode})
  assertSelection()
  return Object.freeze({...result,assertCurrent:assertSelection})
 }
 const previewText=async(changes:unknown,assertConsumer?:()=>void)=>{
  const capturedChanges=structuredClone(changes)
  if(expectedHead===null)throw Error('CONTENT_TEXT_HEAD_REQUIRED')
  return (await readPreviewVersions(assertConsumer)).previewText(capturedChanges)
 }
 const captureNodeTextSelection=async(input:CandidateNodeSelection,assertConsumer?:()=>void)=>{
  const capturedInput={...input}
  if(capturedInput.role==='head')return (await readPreviewVersions(assertConsumer)).captureNodeTextSelection(capturedInput)
  return captureNodeSelection(capturedInput,{snapshot,nodes},()=>{assertCurrent();assertConsumer?.()})
 }
 return Object.freeze({runtime:host.runtime,readFixedFact,
  readEffectiveFacts:(scope:ReviewScope,assertConsumer?:()=>void)=>readEffectiveFacts(scope,assertConsumer),
  hashNodeCalculationInputs,readCalculationTemplates,resolveCalculationGenerators,expandAttachmentIndex,
  readNodeEffectiveFacts:(nodeIds:readonly string[],assertConsumer?:()=>void)=>readEffectiveFacts({nodeIds,responses:[]},assertConsumer),
  readFixedRequirement,readRequirementPinIssues,
  readRequirementBindingHash:(nodeIds:readonly string[],assertConsumer?:()=>void)=>readRequirementBindingHash(nodeIds,assertConsumer),
  readReviewDependencies,readSubtreeReviewDependencies,readSubtreeEffectiveHash,readQualificationHash,readContentRulesHash,readFixedTenderRecord,readPreviewVersions,previewScope,previewText,captureNodeTextSelection,revisions,snapshot,nodes,revisionMatchVerified:true,templateBindingsVerified:true,requirementBindingsVerified:true,
  verifyRootHash:(contract:string)=>verifyReadableRevisionRoot({host:{...host,assertCurrent},revisionDataViewKey:revisions.candidateDataViewKey,snapshot,contract}),
  responseAnchorsVerified:true,responseTextVerified:true,requiresResponseReferenceChecks:true,requiresResponsePayloadChecks:true,
  requiresTemplateResourceChecks:true,requiresRequirementVersionChecks:true,
  requiresBusinessSectionChecks:true,assertCurrent})
}
