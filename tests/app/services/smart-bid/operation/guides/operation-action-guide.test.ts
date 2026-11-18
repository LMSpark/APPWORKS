import {expect,it,vi} from 'vitest'
import {ClassModelRuntime,createClassModelDocumentFromRuntimeApiMetadata} from '@spark-appworks/spark-ai/class-model'
import {hashCanonicalSnapshotText} from '@/services/smart-bid/content/revision-snapshot-hash'
import {readOperationActionGuide} from '@/services/smart-bid/operation/guides/operation-action-guide'

it('reads the exact reachable ClassModel action and rejects guide drift',async()=>{
 const guide='### 核路线候选'
 const guideDigest=await hashCanonicalSnapshotText(guide)
 const source={rootKind:'CraftRoot',kind:'OperationRoute',actionName:'verify',guideRef:'RELEASE-1',guideDigest,assertCurrent:()=>{}}
 const executeTool=vi.fn(async(toolName:string)=>toolName==='model_query'?
  {ok:true,data:{rootKind:'CraftRoot',models:[{kind:'OperationRoute',methods:[{name:'verify'}]}]}}:
  {ok:true,data:guide})
 expect(await readOperationActionGuide({executeTool},source)).toMatchObject({guideRef:'RELEASE-1',guide,guideDigest})
 expect(executeTool.mock.calls.map(call=>call[0])).toEqual(['model_query','model_action_guide'])
 await expect(readOperationActionGuide({executeTool},{...source,actionName:'other'})).rejects.toThrow('OPERATION_ACTION_GUIDE_UNREACHABLE')
 await expect(readOperationActionGuide({executeTool},{...source,guideDigest:'0'.repeat(64)})).rejects.toThrow('OPERATION_ACTION_GUIDE_VERSION')
})

it('matches the ClassModelRuntime method projection under the registered root',async()=>{
 const document=createClassModelDocumentFromRuntimeApiMetadata({module:{schemaVersion:1,rootApi:{
  kind:'OperationRoute',name:'OperationRoute',description:'核路线',actions:[{
   name:'verify',methodName:'verify',description:'核路线候选',paramsSchema:{type:'object',properties:{},additionalProperties:false},
  }],
 }}})
 const execute=vi.fn(()=>{throw Error('SCRIPT_MUST_NOT_RUN')})
 const runtime=new ClassModelRuntime({document,scriptExecutor:execute})
 const published=await runtime.executeTool('model_action_guide',{kind:'OperationRoute',actionName:'verify'})
 expect(published.ok).toBe(true)
 if(typeof published.data!=='string')throw Error('EXPECTED_ACTION_GUIDE')
 const guideDigest=await hashCanonicalSnapshotText(published.data)
 const source={rootKind:'OperationRoute',kind:'OperationRoute',actionName:'verify',guideRef:'FIXED-GUIDE',guideDigest,assertCurrent:()=>{}}
 expect(await readOperationActionGuide(runtime,source)).toMatchObject({guide:published.data,guideDigest})
 await expect(readOperationActionGuide(runtime,{...source,rootKind:'OtherRoot'})).rejects.toThrow('OPERATION_ACTION_GUIDE_UNREACHABLE')
 expect(execute).not.toHaveBeenCalled()
})
