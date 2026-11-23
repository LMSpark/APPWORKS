import {expect,it} from 'vitest'
import {responseScenarioViews} from '@/views/features/application/smart-bid/response/model/response-scenario-views'
import {DataSet} from '@spark-appworks/spark-data'
import {readRegisteredApprovedPriceDetail} from '@/views/features/application/smart-bid/response/model/price-sheet-reader'
import {DataSpaceQueryContext} from '@spark-appworks/spark-data'
import {DataSpaceQueryTable} from '@spark-appworks/spark-data'

it('recalculates the authorized original pricing row and refuses a hidden line list',async()=>{
 const row={id:'ID',scopeRef:'LOT',detailRef:'DETAIL',pricingVersion:'V1',currency:'CNY',precision:2,rounding:'HALF_UP',
  lines:[{lineRef:'A',quantity:'3',unitPrice:'0.335',reportedAmount:'1.01',unit:'项',sourceRef:'SOURCE'}]}
 const scenarioViews=responseScenarioViews({ApprovedPrice:'id',BidSecurity:'id',PriceSheet:'id',ResponseAssignment:'id'})
 const ds=DataSet.fromJson({scenarioId:'S',tables:{PriceSheet:{modelBinding:{modelName:'PriceSheet',modelId:'M'},
  columns:Object.keys(row).map(name=>({name,isPrimaryKey:name==='id'})),
  views:{default:{},...scenarioViews.PriceSheet},
 }}})
 try{
  const view=ds.getView('PriceSheet','selectedPriceSheet')
  if(!view)throw Error('TEST_VIEW_REQUIRED')
  let hidden:string[]=[],pricingVersion='V1'
  const table=new DataSpaceQueryTable({scenarioId:'S',metaName:'PriceSheet'})
  view.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
   identity:table.identity,scope:'sheet',readScope:()=> 'sheet',snapshot:table.applyResult({Result:{primaryKeyField:'id',
    data:{Count:1,Items:[{...row,pricingVersion,lingma_sys_params:{r:[],e:[],h:hidden,m:[],d:false}}]}}}),
  })})
  const assertCurrent=()=>{}
  const host={scenarioId:'S',runtime:{resolveView:(key:string)=>key==='S@PriceSheet@selectedPriceSheet'?view:undefined},assertCurrent}
  const approval={scopeRef:'LOT',detailRef:'DETAIL',pricingVersion:'V1',approvalRef:'A',version:'APPROVAL-V1',
   value:'1.01',unit:'CNY',assertCurrent}
  const result=await readRegisteredApprovedPriceDetail(host,approval)
  expect(result).toMatchObject({state:'READ',detail:{matchesApproval:true},calculation:{total:'1.01'}})
  expect(view.queryContext).toMatchObject({scopeRef:'LOT',detailRef:'DETAIL',pricingVersion:'V1'})
  pricingVersion='V2'
  await expect(readRegisteredApprovedPriceDetail(host,approval)).rejects.toThrow('ORIGINAL_REGISTRATION_VIEW_REQUIRED')
  expect(()=>result.assertCurrent()).toThrow()
  pricingVersion='V1'
  hidden=['lines']
  await expect(readRegisteredApprovedPriceDetail(host,approval)).rejects.toThrow()
 }finally{ds.destroy()}
})
