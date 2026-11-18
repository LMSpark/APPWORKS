import {expect,it,vi} from 'vitest'
import rule from '@/views/features/application/smart-bid/authoring/page11/rule.json'
import script from '@/views/features/application/smart-bid/authoring/page11/script.js?raw'
import {compileFunctions} from '../../../../../../packages/spark-component/src/page/createSandbox'
import type {PageContext} from '../../../../../../packages/spark-component/src/page/context/types'
import {DataSet} from '@spark-appworks/spark-data'
import {DataSpaceQueryTable} from '../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'

function fixture(user='U'){
 const row={id:'D',projectId:'P',userId:user,draft:{nodes:[],responseChanges:[]}}
 const proof=vi.fn(),resultProof=vi.fn(),view={dataTable:{modelBinding:{modelName:'WorkingDraft'}},queryContext:{projectId:'P',currentUserId:'U'},
  rows:[row],getPkKey:(item:typeof row)=>item.id,getEditingRow:vi.fn(()=>row),captureReadRow:vi.fn(()=>proof),captureReadResult:vi.fn(()=>resultProof)}
 const resolveView=vi.fn(()=>view)
 const functions=compileFunctions(script,{$route:{query:{projectId:'P',draftId:'D'}},$page:{resolveView}} as unknown as PageContext)
 return {row,view,proof,resultProof,functions,resolveView}
}
it('expresses the draft structure with standard children and binds its original row',()=>{
 const f=fixture()
 expect(rule[0]?.type).toBe('r-section')
 expect(f.functions['bindOriginalDraft']!()).toEqual({contextRowId:'D'})
 expect(f.functions['bindContentOutline']!()).toEqual({outlineRootValue:'P'})
 expect(f.resolveView).toHaveBeenCalledWith('D3BBA1F0780056C837AC35E9825CAD5A@WorkingDraft@personalDraft')
 expect(f.view.captureReadRow).toHaveBeenCalledWith(f.row,['id','projectId','userId','draft'])
 expect(f.proof).toHaveBeenCalled()
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
 const previewCandidate=vi.fn(async()=>({scopeCheckPassed:false,changedNodeIds:['C'],addedNodeIds:['D'],responseChanges:[],
  comparison:{nodes:[{nodeId:'C',conflicts:['changed'],deletionReferenceCheck:'REFERENCED',referencedBy:['H']}],
   siblings:[{parentId:'P',status:'CONFLICT'}]},responseComparison:[{assignmentId:'A',delta:'DIVERGED'}],
  originalFormBasisCheck:{},violations:[{ownerId:'D',code:'UNDECLARED_ADDITION'}],assertCurrent}))
 const query={candidateRevisionId:'CANDIDATE',candidateExpectedHead:'HEAD',candidateAddedNodeId:['D','CHAPTER'],
  candidateFormDocumentId:'D',formTemplateRef:'FORM',formTemplateVersion:'V1'}
 const {__init__,openCandidatePreview}=compileFunctions(script,{$route:{query},
  $page:{invokeHostCommand:async()=>({previewCandidate}),showAlert,showMessage}} as unknown as PageContext)
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
  comparison:{currentState:'NEWER_EDITS',assertCurrent:assertComparison}}
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
 assertComparison.mockImplementation(()=>{throw Error('DRAFT_CHANGED')})
 expect(bindOriginalSave()).toEqual({status:'原请求已保存草稿版 V2，回执 RC'})
 assertCurrent.mockImplementation(()=>{throw Error('STALE')})
 expect(bindOriginalSave()).toEqual({error:'原保存查询已失效'})
 expect(resolveView).not.toHaveBeenCalled()
})
it('withdraws the binding when the original query is replaced instead of recapturing a new proof',()=>{
 const f=fixture()
 expect(f.functions['bindOriginalDraft']!()).toEqual({contextRowId:'D'})
 f.resultProof.mockImplementation(()=>{throw Error('REPLACED_RESULT')})
 expect(f.functions['bindContentOutline']!()).toEqual({visible:false})
 expect(f.view.captureReadResult).toHaveBeenCalledTimes(1)
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
