import {expect,it,vi} from 'vitest'
import rule from '@/views/features/application/smart-bid/authoring/page11/rule.json'
import script from '@/views/features/application/smart-bid/authoring/page11/script.js?raw'
import {compileFunctions} from '../../../../../../packages/spark-component/src/page/createSandbox'
import type {PageContext} from '../../../../../../packages/spark-component/src/page/context/types'
import {DataSet} from '@spark-appworks/spark-data'
import {DataSpaceQueryTable} from '../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'

function fixture(user='U',primaryKey='id'){
 const row={[primaryKey]:'D',projectId:'P',userId:user,draft:{nodes:[],responseChanges:[]}}
 const proof=vi.fn(),resultProof=vi.fn(),view={dataTable:{modelBinding:{modelName:'WorkingDraft'}},queryContext:{projectId:'P',currentUserId:'U'},
  primaryKey,rows:[row],getPkKey:(item:typeof row)=>item[primaryKey],getEditingRow:vi.fn(()=>row),captureReadRow:vi.fn(()=>proof),captureReadResult:vi.fn(()=>resultProof)}
 const resolveView=vi.fn(()=>view)
 const query={projectId:'P',draftId:'D'}
 const functions=compileFunctions(script,{$route:{query},$page:{resolveView,
  invokeHostCommand:async()=>({assertCurrent:()=>{}})}} as unknown as PageContext)
 return {row,view,proof,resultProof,functions,resolveView,query}
}
it('does not reuse the original proof for another draft in the same view',()=>{
 const f=fixture()
 expect(f.functions['bindOriginalDraft']!()).toEqual({contextRowId:'D'})
 f.query.draftId='OTHER'
 expect(f.functions['bindOriginalDraft']!()).toEqual({visible:false})
 expect(f.view.captureReadResult).toHaveBeenCalledTimes(1)
})
it('expresses the draft structure with standard children and binds its original row',()=>{
 const f=fixture()
 expect(rule[0]?.type).toBe('r-section')
 expect(f.functions['bindOriginalDraft']!()).toEqual({contextRowId:'D'})
 expect(f.functions['bindContentOutline']!()).toEqual({outlineRootValue:'P'})
 expect(f.resolveView).toHaveBeenCalledWith('D3BBA1F0780056C837AC35E9825CAD5A@WorkingDraft@personalDraft')
 expect(f.view.captureReadRow).toHaveBeenCalledWith(f.row,['id','projectId','userId','draft'])
 expect(f.proof).toHaveBeenCalled()
})
it('uses the original DataView primary key for both proof and draft identity display',()=>{
 const f=fixture('U','draftId')
 expect(f.functions['bindOriginalDraft']!()).toEqual({contextRowId:'D'})
 expect(f.functions['bindDraftIdentity']!()).toEqual({field:'draftId'})
 expect(f.view.captureReadRow).toHaveBeenCalledWith(f.row,['draftId','projectId','userId','draft'])
})
it('keeps selected content attached to the original node when local rows move',()=>{
 const f=fixture()
 Object.assign(f.row.draft,{nodes:[{nodeId:'A'},{nodeId:'B'}]})
 f.functions['selectContentNode']!([0])
 Object.assign(f.row.draft,{nodes:[{nodeId:'B'},{nodeId:'A'}]})
 expect(f.functions['bindSelectedNode']!()).toEqual({valuePath:['nodes',1]})
 Object.assign(f.row.draft,{nodes:[{nodeId:'B'}]})
 expect(f.functions['bindSelectedNode']!()).toEqual({visible:false})
})
it('reopens without carrying the previous draft proof or node selection',async()=>{
 const f=fixture()
 Object.assign(f.row.draft,{nodes:[{nodeId:'A'}]})
 f.functions['selectContentNode']!([0])
 expect(f.functions['bindSelectedNode']!()).toEqual({valuePath:['nodes',0]})
 f.resultProof.mockImplementation(()=>{throw Error('PREVIOUS_DRAFT_PROOF')})
 f.view.captureReadResult.mockReturnValueOnce(vi.fn())
 await f.functions['__init__']!()
 expect(f.functions['bindOriginalDraft']!()).toEqual({contextRowId:'D'})
 expect(f.view.captureReadResult).toHaveBeenCalledTimes(2)
 expect(f.functions['bindSelectedNode']!()).toEqual({visible:false})
})
it('hides data when the original authenticated draft or its read proof is unavailable',()=>{
 const wrong=fixture('OTHER')
 expect(wrong.functions['bindOriginalDraft']!()).toEqual({visible:false})
 const f=fixture();f.proof.mockImplementation(()=>{throw Error('STALE')})
 expect(f.functions['bindContentOutline']!()).toEqual({visible:false})
})
it('explains missing edit integration without enabling edit actions',async()=>{
 const functions=compileFunctions(script,{$route:{query:{projectId:'P',draftId:'D'}},
  $page:{invokeHostCommand:async()=>{throw Error('PAGE_HOST_COMMAND_UNAVAILABLE')},resolveView:()=>undefined}} as unknown as PageContext)
 const {__init__,bindEditorStatus,bindOriginalDraft,bindCancel}=functions
 if(!__init__||!bindEditorStatus||!bindOriginalDraft||!bindCancel)throw Error('TEST_PAGE11_HANDLERS_REQUIRED')
 await __init__()
 expect(bindEditorStatus()).toEqual({error:'正文编制未接入当前页面实例'})
 expect(bindOriginalDraft()).toEqual({visible:false})
 expect(bindCancel()).toEqual({visible:false,disabled:true})
})
it('passes exact candidate and original-form inputs to preview and renders the scope issues',async()=>{
 const assertCurrent=vi.fn(),showAlert=vi.fn(async(_text:string,_title:string)=>{}),showMessage=vi.fn()
 const showConfirm=vi.fn(async()=>false)
 const previewCandidate=vi.fn(async()=>({scopeCheckPassed:false,changedNodeIds:['C'],addedNodeIds:['D'],responseChanges:[],
  comparison:{nodes:[{nodeId:'C',conflicts:['changed'],deletionReferenceCheck:'REFERENCED',referencedBy:['H']}],
   siblings:[{parentId:'P',status:'CONFLICT'}]},responseComparison:[{assignmentId:'A',delta:'DIVERGED'}],
  originalFormBasisCheck:{},violations:[{ownerId:'D',code:'UNDECLARED_ADDITION'}],assertCurrent}))
 const query={candidateRevisionId:'CANDIDATE',candidateExpectedHead:'HEAD',candidateAddedNodeId:['D','CHAPTER'],
  candidateFormDocumentId:'D',formTemplateRef:'FORM',formTemplateVersion:'V1'}
 const {__init__,openCandidatePreview}=compileFunctions(script,{$route:{query},
  $page:{invokeHostCommand:async()=>({previewCandidate}),showAlert,showMessage,showConfirm}} as unknown as PageContext)
 if(!__init__||!openCandidatePreview)throw Error('TEST_PAGE11_PREVIEW_REQUIRED')
 await __init__()
 await openCandidatePreview()
 expect(previewCandidate).toHaveBeenCalledExactlyOnceWith({candidateRevisionId:'CANDIDATE',expectedHead:'HEAD'},
  {declaredAddedNodeIds:['D','CHAPTER'],originalFormTemplate:{documentId:'D',templateRef:'FORM',templateVersion:'V1'}})
 expect(showAlert).toHaveBeenCalledWith(expect.stringContaining('D · 新增节点未声明'),'候选变更预演')
 expect(showAlert.mock.lastCall?.[0]).toContain('节点冲突 C')
 expect(showAlert.mock.lastCall?.[0]).toContain('删除仍有引用的节点 C · 引用方 H')
 expect(showAlert.mock.lastCall?.[0]).toContain('同级顺序冲突 · 父节点 P')
 expect(showAlert.mock.lastCall?.[0]).toContain('答复冲突 · 任务 A')
 assertCurrent.mockImplementation(()=>{throw Error('STALE')})
 await openCandidatePreview()
 expect(showAlert).toHaveBeenCalledTimes(1)
 expect(showMessage).toHaveBeenCalledWith('候选变更无法预演','warning')
})
it('shows the original save receipt without modifying the current editor',async()=>{
 const assertCurrent=vi.fn(),assertComparison=vi.fn(),resolveView=vi.fn()
 const receipt={state:'SAVED',draftVersion:'V2',receiptRef:'RC',assertCurrent,
  comparison:{currentState:'NEWER_EDITS',localChanges:false,assertCurrent:assertComparison}}
 let resolveReceipt:()=>void=()=>{throw Error('TEST_RECEIPT_NOT_INITIALIZED')}
 const pending=new Promise<typeof receipt>(resolve=>{resolveReceipt=()=>resolve(receipt)})
 const readOriginalSave=vi.fn(()=>pending)
 const invokeHostCommand=vi.fn(async()=>({readOriginalSave}))
 const query={projectId:'P',draftId:'D',saveRequestKey:'Q',saveRequestDigest:'a'.repeat(64),
  saveContentDigest:'b'.repeat(64),saveExpectedDraftVersion:null}
 const {__init__,bindOriginalSave}=compileFunctions(script,{$route:{query},
  $page:{invokeHostCommand,resolveView}} as unknown as PageContext)
 if(!__init__||!bindOriginalSave)throw Error('TEST_PAGE11_HANDLERS_REQUIRED')
 const initialization=__init__()
 expect(bindOriginalSave()).toEqual({status:'正在核验原保存结果'})
 resolveReceipt()
 await initialization
 expect(invokeHostCommand).toHaveBeenCalledExactlyOnceWith('content.authoring.connect')
 expect(readOriginalSave).toHaveBeenCalledExactlyOnceWith({requestKey:'Q',requestDigest:query.saveRequestDigest,
  contentDigest:query.saveContentDigest,expectedDraftVersion:null})
 expect(bindOriginalSave()).toEqual({status:'原请求已保存草稿版 V2，回执 RC。当前草稿与原保存内容不同。'})
 receipt.comparison.localChanges=true
 expect(bindOriginalSave()).toEqual({status:'原请求已保存草稿版 V2，回执 RC。当前编辑仍有本地未保存改动。'})
 assertComparison.mockImplementation(()=>{throw Error('DRAFT_CHANGED')})
 expect(bindOriginalSave()).toEqual({status:'原请求已保存草稿版 V2，回执 RC'})
 assertCurrent.mockImplementation(()=>{throw Error('STALE')})
 expect(bindOriginalSave()).toEqual({error:'原保存查询已失效'})
 query.saveRequestKey='OTHER'
 expect(bindOriginalSave()).toEqual({visible:false})
 expect(resolveView).not.toHaveBeenCalled()
})
it('prepares the selected independent response from the saved draft and original batch',async()=>{
 const assertCurrent=vi.fn(),showAlert=vi.fn(async()=>{}),showMessage=vi.fn()
 const prepareDraftCandidate=vi.fn(async()=>({draftId:'D',draftVersion:'V1',baseRevisionId:null,
  baselineId:'B',requestDigest:'a'.repeat(64),requiresResponseUseCheck:true,requiresFactUseCheck:true,
  responseVersions:[{responseId:'RESPONSE'}],factVersions:[{factId:'PRICE',version:2}],assertCurrent}))
 const query:Record<string,string|null>={projectId:'P',draftId:'D',draftCandidateRequestKey:'Q',candidateTargetKind:'RESPONSE',candidateAssignmentId:'ASSIGNMENT',
  candidateBasisResponseId:null,candidateFirstBatchId:'BATCH'}
 const session={prepareDraftCandidate,assertCurrent,canEditDraft:true,canLeave:false,
  cancel:vi.fn(()=>{throw Error('CONTENT_AUTHORING_STALE')})}
 const {__init__,openDraftCandidate,bindEditorStatus,cancelDraft,bindCancel}=compileFunctions(script,{$route:{query},$page:{
  invokeHostCommand:async()=>session,showAlert,showMessage,
 }} as unknown as PageContext)
 if(!__init__||!openDraftCandidate||!cancelDraft||!bindCancel)throw Error('TEST_CANDIDATE_PREPARATION_REQUIRED')
 await __init__()
 expect(bindEditorStatus?.()).toEqual({status:'本页可暂存编辑。正式保存尚不可用，离页前可取消本次编辑。'})
 session.canEditDraft=false
 expect(bindEditorStatus?.()).toEqual({status:'当前草稿仅可查看。'})
 await openDraftCandidate()
 expect(prepareDraftCandidate).toHaveBeenCalledExactlyOnceWith({requestKey:'Q',firstBatchId:'BATCH',
  targetScope:{schemaVersion:2,projectId:'P',targets:[{kind:'RESPONSE',assignmentId:'ASSIGNMENT',responseId:null}]}})
 expect(showAlert).toHaveBeenCalledWith(expect.stringContaining('候选登记待办理'),'候选生成输入')
 expect(showAlert).toHaveBeenCalledWith(expect.stringContaining('独立答复待核复核决定与当前准用：RESPONSE'),'候选生成输入')
 expect(showAlert).toHaveBeenCalledWith(expect.stringContaining('冻结事实待核当前准用：PRICE（版本 2）'),'候选生成输入')
 delete query['candidateTargetKind']
 query['candidateBatchScopeIndex']='1'
 await openDraftCandidate()
 expect(prepareDraftCandidate).toHaveBeenLastCalledWith({requestKey:'Q',firstBatchId:'BATCH',targetScopeIndex:1})
 assertCurrent.mockImplementation(()=>{throw Error('STALE')})
 await openDraftCandidate()
 expect(showAlert).toHaveBeenCalledTimes(2)
 expect(showMessage).toHaveBeenCalledTimes(1)
 assertCurrent.mockReset()
 const pending=openDraftCandidate()
 query['candidateBatchScopeIndex']='2'
 await openDraftCandidate()
 await pending
 expect(prepareDraftCandidate).toHaveBeenCalledTimes(4)
 expect(showAlert).toHaveBeenCalledTimes(2)
 await openDraftCandidate()
 expect(prepareDraftCandidate).toHaveBeenLastCalledWith({requestKey:'Q',firstBatchId:'BATCH',targetScopeIndex:2})
 expect(showAlert).toHaveBeenCalledTimes(3)
 prepareDraftCandidate.mockRejectedValueOnce(Error('CONTENT_DRAFT_FIRST_HEAD_CHANGED'))
 await openDraftCandidate()
 expect(showMessage).toHaveBeenLastCalledWith('项目已有采用的正文，请基于当前正文版本重新发起候选','warning')
 prepareDraftCandidate.mockRejectedValueOnce(Error('CONTENT_CANDIDATE_DRAFT_UNSAVED'))
 await openDraftCandidate()
 expect(showMessage).toHaveBeenLastCalledWith('当前草稿还有未保存的改动，请处理改动后再核对候选输入','warning')
 expect(showAlert).toHaveBeenCalledTimes(3)
 const previousDraft=openDraftCandidate()
 query['draftId']='OTHER'
 await previousDraft
 expect(showAlert).toHaveBeenCalledTimes(3)
 expect(showMessage).toHaveBeenCalledTimes(3)
 cancelDraft()
 expect(showMessage).toHaveBeenLastCalledWith('当前草稿无法取消，未保存内容仍保留','warning')
 expect(bindCancel()).toEqual({visible:true,disabled:false})
})
it('withdraws original form and comparison results when the selected template changes',async()=>{
 const query={projectId:'P',draftId:'D',formTemplateRef:'T',formTemplateVersion:'V2',previousFormTemplateVersion:'V1'}
 const showAlert=vi.fn(async()=>{}),showMessage=vi.fn()
 const readOriginalForm=vi.fn(async()=>{
  query.formTemplateVersion='V3'
  return {state:'PENDING',assertCurrent:()=>{}}
 })
 const compareOriginalForms=vi.fn(async()=>{
  query.previousFormTemplateVersion='V2'
  throw Error('OLD_COMPARISON')
 })
 const {__init__,openOriginalForm,openOriginalFormComparison}=compileFunctions(script,{$route:{query},
  $page:{invokeHostCommand:async()=>({readOriginalForm,compareOriginalForms}),showAlert,showMessage}} as unknown as PageContext)
 if(!__init__||!openOriginalForm||!openOriginalFormComparison)throw Error('TEST_ORIGINAL_FORM_REQUIRED')
 await __init__()
 await openOriginalForm()
 await openOriginalFormComparison()
 expect(readOriginalForm).toHaveBeenCalledWith({templateRef:'T',templateVersion:'V2'})
 expect(compareOriginalForms).toHaveBeenCalledWith({templateRef:'T',previousVersion:'V1',currentVersion:'V3'})
 expect(showAlert).not.toHaveBeenCalled()
 expect(showMessage).not.toHaveBeenCalled()
})
it('shows a later project head without changing the original adoption revision',async()=>{
 const showAlert=vi.fn(async()=>{}),showMessage=vi.fn()
 const readOriginalAdoption=vi.fn(async()=>({recordFound:true,adoptionRef:'A',mergeRevisionId:'R1',
  commitCheckRef:null,assertCurrent:()=>{}}))
 const readCurrentHead=vi.fn(async()=>({headRevisionId:'R2',assertCurrent:()=>{}}))
 const query={
  adoptionCandidateRevisionId:'C',adoptionRequestKey:'K',adoptionRequestDigest:'DIGEST',adoptionPreviewRef:'PV',
 }
 const {__init__,openOriginalAdoption}=compileFunctions(script,{$route:{query},
  $page:{invokeHostCommand:async()=>({readOriginalAdoption,readCurrentHead}),showAlert,showMessage}} as unknown as PageContext)
 if(!__init__||!openOriginalAdoption)throw Error('TEST_ORIGINAL_ADOPTION_REQUIRED')
 await __init__()
 await openOriginalAdoption()
 expect(showAlert).toHaveBeenCalledWith('原采用记录 A · 修订 R1\n提交核验引用待补\n原办理终态待核\n项目当前头 R2','原采用回查')
 readCurrentHead.mockRejectedValueOnce(Error('HEAD_UNAVAILABLE'))
 await openOriginalAdoption()
 expect(showAlert).toHaveBeenLastCalledWith(expect.stringContaining('项目当前头待核'),'原采用回查')
 readCurrentHead.mockImplementationOnce(async()=>{
  query.adoptionRequestKey='OTHER'
  return {headRevisionId:'R2',assertCurrent:()=>{}}
 })
 await openOriginalAdoption()
 expect(showAlert).toHaveBeenCalledTimes(2)
 expect(showMessage).not.toHaveBeenCalled()
})
it('withdraws the binding when the original query is replaced instead of recapturing a new proof',()=>{
 const f=fixture()
 expect(f.functions['bindOriginalDraft']!()).toEqual({contextRowId:'D'})
 f.resultProof.mockImplementation(()=>{throw Error('REPLACED_RESULT')})
 expect(f.functions['bindContentOutline']!()).toEqual({visible:false})
 expect(f.view.captureReadResult).toHaveBeenCalledTimes(1)
})
it('only adds undeclared nodes after confirmation against a current preview',async()=>{
 const proof=vi.fn(),showAlert=vi.fn(async()=>{}),showMessage=vi.fn()
 const initial={scopeCheckPassed:false,changedNodeIds:[],addedNodeIds:['D'],responseChanges:[],
  comparison:{nodes:[],siblings:[]},responseComparison:[],violations:[{ownerId:'D',code:'UNDECLARED_ADDITION'}],assertCurrent:proof}
 const previewCandidate=vi.fn(async()=>initial)
 previewCandidate.mockResolvedValueOnce(initial).mockResolvedValueOnce({...initial,scopeCheckPassed:true,violations:[]})
 const showConfirm=vi.fn(async()=>true)
 const query={candidateRevisionId:'C',projectId:'P',draftId:'D'}
 const {__init__,openCandidatePreview}=compileFunctions(script,{$route:{query},
  $page:{invokeHostCommand:async()=>({previewCandidate}),showAlert,showMessage,showConfirm}} as unknown as PageContext)
 if(!__init__||!openCandidatePreview)throw Error('TEST_PAGE11_PREVIEW_REQUIRED')
 await __init__()
 await openCandidatePreview()
 expect(previewCandidate).toHaveBeenNthCalledWith(1,{candidateRevisionId:'C',expectedHead:null},{declaredAddedNodeIds:[]})
 expect(previewCandidate).toHaveBeenNthCalledWith(2,{candidateRevisionId:'C',expectedHead:null},{declaredAddedNodeIds:['D']})
 expect(showAlert).toHaveBeenCalledWith(expect.stringContaining('变更范围已核'),'候选变更预演')
 showConfirm.mockImplementationOnce(async()=>{proof.mockImplementation(()=>{throw Error('STALE')});return true})
 await openCandidatePreview()
 expect(previewCandidate).toHaveBeenCalledTimes(3)
 expect(showMessage).toHaveBeenCalledWith('候选变更无法预演','warning')
 proof.mockImplementation(()=>{})
 showConfirm.mockImplementationOnce(async()=>{query.candidateRevisionId='OTHER';return true})
 await openCandidatePreview()
 expect(previewCandidate).toHaveBeenCalledTimes(4)
 expect(showAlert).toHaveBeenCalledTimes(1)
 for(const key of ['projectId','draftId'] as const){
  showConfirm.mockImplementationOnce(async()=>{query[key]='OTHER';return true})
  await openCandidatePreview()
 }
 expect(previewCandidate).toHaveBeenCalledTimes(6)
 expect(showAlert).toHaveBeenCalledTimes(1)
 expect(showMessage).toHaveBeenCalledTimes(1)
})
it.each([false,true])('keeps the original query proof when the draft already has an edit overlay (%s), then withdraws after refresh',async edited=>{
 const scenarioId='D3BBA1F0780056C837AC35E9825CAD5A'
 const ds=DataSet.fromJson({scenarioId,tables:{WorkingDraft:{modelBinding:{modelId:'M',modelName:'WorkingDraft'},
  columns:[{name:'id',type:'string',isPrimaryKey:true},{name:'projectId',type:'string'},{name:'userId',type:'string'},{name:'draft',type:'object'}],
  views:{default:{},personalDraft:{commitMode:'staged'}}}}})
 const view=ds.getView('WorkingDraft','personalDraft')!,table=new DataSpaceQueryTable({scenarioId,metaName:'WorkingDraft'})
 const row={id:'D',projectId:'P',userId:'U',draft:{nodes:[],responseChanges:[]}}
 const query=vi.fn(async()=>new DataSpaceQueryContext({identity:table.identity,scope:'q',readScope:()=> 'q',snapshot:table.applyResult({Result:{primaryKeyField:'id',data:{Count:1,
  Items:[{...row,lingma_sys_params:{r:[],e:['draft'],h:[],m:[],d:false}}]}}})}))
 const save=vi.fn(async()=>{throw Error('UNEXPECTED_SAVE')})
 view.queryContext={projectId:'P',currentUserId:'U'};view.bindQueryExecutor({executeQuery:query,save})
 try{
  await view.refresh()
  if(edited)view.updateEditingValue('D','draft',{nodes:[],responseChanges:[{id:'local-response'}]})
  const functions=compileFunctions(script,{$route:{query:{projectId:'P',draftId:'D'}},$page:{resolveView:()=>view}} as unknown as PageContext)
  expect(functions['bindOriginalDraft']!()).toEqual({contextRowId:'D'})
  expect(functions['bindContentOutline']!()).toEqual({outlineRootValue:'P'})
  expect(query).toHaveBeenCalledTimes(1);expect(view.hasEditingChanges()).toBe(edited)
  if(edited){
   await expect(view.refresh()).rejects.toThrow('DATA_VIEW_UNSAVED_CHANGES')
   expect(functions['bindOriginalDraft']!()).toEqual({contextRowId:'D'})
   view.discardEditingRows(['D'])
  }
  await view.refresh()
  expect(functions['bindOriginalDraft']!()).toEqual({visible:false})
  expect(save).not.toHaveBeenCalled();expect(view.rows[0]?.['draft']).toEqual(row.draft)
 }finally{ds.destroy()}
})
