import {expect,it,vi} from 'vitest'
import rule from '@/views/features/application/smart-bid/authoring/page18/rule.json'
import script from '@/views/features/application/smart-bid/authoring/page18/script.js?raw'
import {compileFunctions} from '../../../../../../packages/spark-component/src/page/createSandbox'
import type {PageContext} from '../../../../../../packages/spark-component/src/page/context/types'

it('binds the original directory and never displays a superseded row response',async()=>{
 const first=Promise.withResolvers<{guide:string;assertCurrent:()=>void}>()
 const showAlert=vi.fn(async()=>{}),showMessage=vi.fn()
 const dataViewKey='S@KnowledgeGuide@effectiveDirectory'
 const assertCurrent=vi.fn()
 const readGuide=vi.fn((key:string)=>key==='first'?first.promise:Promise.resolve({guide:'新指南',assertCurrent}))
 const invokeHostCommand=vi.fn(async()=>({dataViewKey,count:2,reachable:2,assertCurrent,readGuide}))
 const resolveView=vi.fn(()=>({getPkKey:(row:{id:string})=>row.id}))
 const functions=compileFunctions(script,{$route:{query:{directoryRef:'DIR'}},
  $page:{invokeHostCommand,resolveView,showAlert,showMessage}} as unknown as PageContext)
 const {__init__,bindDirectory,readGuide:click,bindDirectoryStatus}=functions
 if(!__init__||!bindDirectory||!click||!bindDirectoryStatus)throw Error('TEST_PAGE18_HANDLERS_REQUIRED')
 expect(rule[0]?.children[0]?.props.onRowClick).toBe('readGuide')
 await __init__()
 expect(invokeHostCommand).toHaveBeenCalledExactlyOnceWith('content.operation.discover',{directoryRef:'DIR'})
 expect(bindDirectory()).toEqual({dataViewKey})
 const pending=click({id:'first'})
 await click({id:'second'})
 first.resolve({guide:'迟到指南',assertCurrent})
 await pending
 expect(showAlert).toHaveBeenCalledExactlyOnceWith('新指南','动作指南')
 assertCurrent.mockImplementation(()=>{throw Error('REPLACED_RESULT')})
 expect(bindDirectory()).toEqual({visible:false})
 expect(bindDirectoryStatus()).toEqual({error:'目录查询已失效'})
 await click({id:'third'})
 expect(readGuide).toHaveBeenCalledTimes(2)
 expect(showMessage).not.toHaveBeenCalled()
})
