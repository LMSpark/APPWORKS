import {expect,it} from 'vitest'
import {prepareBidVolumePlan,verifyBidVolumePlanPlacement} from '@/services/smart-bid/content/references/response/bid-volume-plan'

const scope={projectId:'P',baselineId:'B'}
const volume={kind:'DOCUMENT' as const,obligationRef:'DOC',targetRef:'SECTION',documentId:'NEW-VOLUME',disclosureRefs:['PUBLIC']}
const independent={kind:'INDEPENDENT' as const,obligationRef:'PORTAL',targetRef:'FIELD',disclosureRefs:[]}
const source={...scope,assertCurrent:()=>{},obligations:[
 {kind:'DOCUMENT' as const,obligationRef:'DOC',required:true,allowedDisclosureRefs:['PUBLIC']},
 {kind:'INDEPENDENT' as const,obligationRef:'PORTAL',required:true,allowedDisclosureRefs:[]},
]}

it('plans a new volume before assignment and preserves an independent obligation separately',()=>{
 expect(prepareBidVolumePlan({...scope,destinations:[volume,independent]},source)).toMatchObject({
  documentIds:['NEW-VOLUME'],destinations:[volume,independent],
 })
 expect(()=>prepareBidVolumePlan({...scope,destinations:[volume]},source)).toThrow('BID_VOLUME_PLAN_INCOMPLETE')
 expect(()=>prepareBidVolumePlan({...scope,destinations:[{...volume,disclosureRefs:['PRIVATE']},independent]},source))
  .toThrow('BID_VOLUME_PLAN_DESTINATION')
 expect(prepareBidVolumePlan({...scope,destinations:[independent]},{...source,obligations:source.obligations.slice(1)}).documentIds)
  .toEqual([])
})

it('verifies the actual candidate placement and rejects the same chapter under another volume',()=>{
 const plan=prepareBidVolumePlan({...scope,destinations:[volume,independent]},source)
 const nodes=[{nodeId:'NEW-VOLUME',parentId:'P',type:'document',index:0},{nodeId:'OTHER',parentId:'P',type:'document',index:1},
  {nodeId:'SECTION',parentId:'NEW-VOLUME',type:'chapter',index:0},{nodeId:'TITLE',parentId:'SECTION',type:'heading',index:0},
  {nodeId:'STAY',parentId:'NEW-VOLUME',type:'chapter',index:1},{nodeId:'STAY-TITLE',parentId:'STAY',type:'heading',index:0},
  {nodeId:'OTHER-SECTION',parentId:'OTHER',type:'chapter',index:0},{nodeId:'OTHER-TITLE',parentId:'OTHER-SECTION',type:'heading',index:0}]
 const tree={...scope,nodes,assertCurrent:()=>{}}
 expect(verifyBidVolumePlanPlacement(plan,tree).documentIds).toEqual(['NEW-VOLUME'])
 expect(()=>verifyBidVolumePlanPlacement(plan,{...tree,nodes:nodes.map(node=>
  node.nodeId==='SECTION'?{...node,parentId:'OTHER',index:1}:node.nodeId==='STAY'?{...node,index:0}:node)}))
  .toThrow('BID_VOLUME_PLAN_PLACEMENT')
})
