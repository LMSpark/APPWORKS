import {expect,it,vi} from 'vitest'
import rule from '@/views/features/application/smart-bid/authoring/page18/rule.json'
import script from '@/views/features/application/smart-bid/authoring/page18/script.js?raw'
import {compileFunctions} from '../../../../../../packages/spark-component/src/page/createSandbox'
import type {PageContext} from '../../../../../../packages/spark-component/src/page/context/types'

it('rechecks the same original dispatch without starting another attempt',async()=>{
 const query={projectId:'P',runId:'RUN',attemptRef:'TRY',requestKey:'Q',targetDigest:'a'.repeat(64),
  configurationLockHash:'b'.repeat(64),directoryRef:'DIR'}
 const showAlert=vi.fn(async()=>{})
 const invokeHostCommand=vi.fn()
  .mockResolvedValueOnce({state:'UNKNOWN',assertCurrent:()=>{}})
  .mockResolvedValueOnce({dataViewKey:'GUIDES',assertCurrent:()=>{},readGuide:async()=>({guide:'原指南',assertCurrent:()=>{}})})
  .mockResolvedValueOnce({state:'DISPATCH_RECORDED',dispatchRef:'ORIGINAL',actualInputDigest:'DIGEST',assertCurrent:()=>{}})
 const {__init__,bindOriginalDispatch,refreshOriginalDispatch,bindOriginalVerification,bindRework,readGuide}=compileFunctions(script,
  {$route:{query},$page:{invokeHostCommand,showAlert,resolveView:()=>({getPkKey:()=> 'ROW'})}} as unknown as PageContext)
 if(!__init__||!bindOriginalDispatch||!refreshOriginalDispatch||!bindOriginalVerification||!bindRework||!readGuide)
  throw Error('TEST_DISPATCH_HANDLERS_REQUIRED')
 await __init__()
 expect(bindOriginalDispatch()).toEqual({status:'原试次实发结果未知'})
 const refresh=refreshOriginalDispatch()
 expect(bindOriginalDispatch()).toEqual({status:'正在回查原试次'})
 expect(bindOriginalVerification()).toEqual({status:'正在回查原试次'})
 expect(bindRework()).toEqual({disabled:true})
 const guide=readGuide({id:'ROW'})
 await refreshOriginalDispatch()
 await refresh
 await guide
 expect(bindOriginalDispatch()).toEqual({status:'实发记录 ORIGINAL，输入摘要 DIGEST'})
 expect(showAlert).toHaveBeenCalledWith('原指南','动作指南')
 expect(invokeHostCommand).toHaveBeenCalledTimes(3)
 expect(invokeHostCommand.mock.calls[2]).toEqual(invokeHostCommand.mock.calls[0])
})

it('binds the original directory and never displays a superseded row response',async()=>{
 type GuideResponse={guide:string;assertCurrent:()=>void}
 let resolveFirst!:(value:GuideResponse)=>void
 const first=new Promise<GuideResponse>(resolve=>{resolveFirst=resolve})
 const showAlert=vi.fn(async()=>{}),showMessage=vi.fn()
 const dataViewKey='S@KnowledgeGuide@effectiveDirectory'
 const assertCurrent=vi.fn()
 const readGuide=vi.fn((key:string)=>key==='first'?first:Promise.resolve({guide:'新指南',assertCurrent}))
 const invokeHostCommand=vi.fn(async()=>({dataViewKey,count:2,reachable:2,assertCurrent,readGuide}))
 const resolveView=vi.fn(()=>({getPkKey:(row:{id:string})=>row.id}))
 const query={directoryRef:'DIR'}
 const functions=compileFunctions(script,{$route:{query},
  $page:{invokeHostCommand,resolveView,showAlert,showMessage}} as unknown as PageContext)
 const {__init__,bindDirectory,readGuide:click,bindDirectoryStatus}=functions
 if(!__init__||!bindDirectory||!click||!bindDirectoryStatus)throw Error('TEST_PAGE18_HANDLERS_REQUIRED')
 const tableProps=rule[0]?.children?.[0]?.props
 expect(tableProps&&'onRowClick' in tableProps?tableProps.onRowClick:undefined).toBe('readGuide')
 await __init__()
 expect(invokeHostCommand).toHaveBeenCalledExactlyOnceWith('content.operation.discover',{directoryRef:'DIR'})
 expect(bindDirectory()).toEqual({dataViewKey})
 const pending=click({id:'first'})
 await click({id:'second'})
 resolveFirst({guide:'迟到指南',assertCurrent})
 await pending
 expect(showAlert).toHaveBeenCalledExactlyOnceWith('新指南','动作指南')
 assertCurrent.mockImplementation(()=>{throw Error('REPLACED_RESULT')})
 expect(bindDirectory()).toEqual({visible:false})
 expect(bindDirectoryStatus()).toEqual({error:'目录查询已失效'})
 await click({id:'third'})
 expect(readGuide).toHaveBeenCalledTimes(2)
 assertCurrent.mockReset()
 const oldDirectory=click({id:'fourth'})
 query.directoryRef='OTHER'
 await oldDirectory
 expect(bindDirectory()).toEqual({visible:false})
 expect(bindDirectoryStatus()).toEqual({visible:false})
 expect(showAlert).toHaveBeenCalledTimes(1)
 expect(showMessage).not.toHaveBeenCalled()
})

it('withdraws dispatch, verification and input details after the selected attempt changes',async()=>{
 const query={projectId:'P',runId:'R',attemptRef:'A',requestKey:'Q',targetDigest:'DIGEST',configurationLockHash:'LOCK'}
 const assertCurrent=vi.fn(),showAlert=vi.fn(),showMessage=vi.fn()
 const readActualInput=vi.fn(async()=>{query.attemptRef='OTHER';return '{}'})
 const invokeHostCommand=vi.fn(async()=>({state:'DISPATCH_RECORDED',dispatchRef:'REC',actualInputDigest:'DIGEST',assertCurrent,
  verification:{state:'VERIFIED_CANDIDATE',receiptRef:'RC',candidateDigest:'CANDIDATE_DIGEST',assertCurrent,
   actualRequirementReads:[{lineageId:'CLAUSE',version:'V1'}],
   readCandidate:async()=>'{"nodes":[]}'},readActualInput}))
 const {__init__,bindOriginalDispatch,bindOriginalVerification,openActualInput,openVerifiedCandidate}=compileFunctions(script,{$route:{query},
  $page:{invokeHostCommand,showAlert,showMessage}} as unknown as PageContext)
 if(!__init__||!bindOriginalDispatch||!bindOriginalVerification||!openActualInput||!openVerifiedCandidate)throw Error('TEST_PAGE18_HANDLERS_REQUIRED')
 await __init__()
 expect(bindOriginalDispatch()).toMatchObject({status:expect.stringContaining('REC')})
 expect(bindOriginalVerification()).toEqual({status:'候选核验通过，回执 RC，候选摘要 CANDIDATE_DIGEST，实发条款 CLAUSE（V1）'})
 await openVerifiedCandidate()
 expect(showAlert).toHaveBeenCalledWith('{\n  "nodes": []\n}','已核候选 JSON')
 await openActualInput()
 expect(bindOriginalDispatch()).toEqual({visible:false})
 expect(bindOriginalVerification()).toEqual({visible:false})
 await openVerifiedCandidate()
 expect(showAlert).toHaveBeenCalledTimes(1)
 expect(showMessage).not.toHaveBeenCalled()
})

it('prepares rework from the route attempt and a confirmed reason',async()=>{
 const assertCurrent=vi.fn(),showAlert=vi.fn(async()=>{}),showMessage=vi.fn()
 const query={runId:'R',attemptRef:'A',requestKey:'Q',configurationLockHash:'LOCK'}
 const showPrompt=vi.fn<()=>Promise<string|null>>().mockResolvedValueOnce(null).mockResolvedValueOnce('撤回结果未知')
 const invokeHostCommand=vi.fn(async()=>({assertCurrent,handoffs:[{callRef:'CALL',destination:'ORIGINAL_CALL'}],
  originalOperations:[{callRef:'CALL',destination:'52',ownerRef:'REP'}],reusable:[]}))
 const {prepareRework,bindRework}=compileFunctions(script,{$route:{query},
  $page:{showPrompt,invokeHostCommand,showAlert,showMessage}} as unknown as PageContext)
 if(!prepareRework||!bindRework)throw Error('TEST_PAGE18_HANDLERS_REQUIRED')
 expect(bindRework()).toEqual({disabled:false})
 await prepareRework()
 expect(invokeHostCommand).not.toHaveBeenCalled()
 await prepareRework()
 expect(invokeHostCommand).toHaveBeenCalledExactlyOnceWith('content.operation.prepareRework',
  {runId:'R',attemptRef:'A',requestKey:'Q',reason:'撤回结果未知'})
 expect(assertCurrent).toHaveBeenCalledOnce()
 expect(showAlert).toHaveBeenCalledExactlyOnceWith('调用 CALL → ORIGINAL_CALL\n原办理 CALL → 52（REP）','返工交接预览')
 showPrompt.mockImplementationOnce(async()=>{query.attemptRef='OTHER';return '只属于原试次'})
 await prepareRework()
 expect(invokeHostCommand).toHaveBeenCalledTimes(1)
 showPrompt.mockImplementationOnce(async()=>{query.configurationLockHash='NEW_LOCK';return '只属于原冻结配置'})
 await prepareRework()
 expect(invokeHostCommand).toHaveBeenCalledTimes(1)
 showPrompt.mockResolvedValueOnce('当前试次返工')
 invokeHostCommand.mockImplementationOnce(async()=>{query.runId='OTHER';throw Error('OLD_REWORK')})
 await prepareRework()
 expect(showAlert).toHaveBeenCalledTimes(1)
 expect(showMessage).not.toHaveBeenCalled()
})
