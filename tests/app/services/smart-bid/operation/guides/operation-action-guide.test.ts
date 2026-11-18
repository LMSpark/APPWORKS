import {expect,it,vi} from 'vitest'
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
