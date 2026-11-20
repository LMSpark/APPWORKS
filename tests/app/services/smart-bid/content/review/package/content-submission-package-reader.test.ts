import {expect,it,vi} from 'vitest'
import {DataSet} from '@spark-appworks/spark-data'
import {readRegisteredSubmissionZipSource} from '@/views/features/application/smart-bid/authoring/model/review/package/content-submission-package-reader'
import {DataSpaceQueryTable} from '../../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'

it('only opens the resource version of the exact original packing request',async()=>{
 const hash='a'.repeat(64),position='商务/函.pdf'
 const row={id:'PKG',projectId:'P',packingRequestRef:'PACK',format:'ZIP',packageHash:hash,resourceVersionId:'ATTACH',
  selectionId:'SET',selectionVersion:'V1',selectionHash:hash,requiredPositions:[position],
  packed:[{position,fileVersionId:'F1',fileHash:hash}]}
 const filters=[['id','packageId'],['projectId','projectId'],['packingRequestRef','packingRequestRef']].map(([field,ParamName])=>
  ({field:field!,operator:'eq' as const,value:{Type:'GetInputParam',ParamName}}))
 const ds=DataSet.fromJson({scenarioId:'S',tables:{SubmissionPackage:{
  modelBinding:{modelId:'M',modelName:'SubmissionPackage'},columns:Object.keys(row).map(name=>({name,isPrimaryKey:name==='id'})),
  views:{default:{},originalPackedZip:{commitMode:'staged',queryConfig:{autoQuery:false},scopeFilter:{logic:'and',filters}}},
 }}})
 const view=ds.getView('SubmissionPackage','originalPackedZip')!,table=new DataSpaceQueryTable({scenarioId:'S',metaName:'SubmissionPackage'})
 view.bindQueryExecutor({save:async()=>{throw Error('NO_WRITE')},executeQuery:async()=>new DataSpaceQueryContext({
  identity:table.identity,scope:'q',readScope:()=> 'q',snapshot:table.applyResult({Result:{primaryKeyField:'id',
   data:{Count:1,Items:[{...row,lingma_sys_params:{r:[],e:[],h:[],m:[],d:false}}]}}}),
 })})
 const host={runtime:{resolveView:(key:string)=>key==='S@SubmissionPackage@originalPackedZip'?view:undefined},
  scenarioId:'S',projectId:'P',assertCurrent:()=>{}}
 const open=vi.fn(async()=>({projectId:'P',resourceVersionId:'ATTACH',bytes:new ArrayBuffer(1),assertCurrent:()=>{}}))
 try{
  const source=await readRegisteredSubmissionZipSource(host,{packageId:'PKG',packingRequestRef:'PACK'},open)
  expect(source.requiredPositions).toEqual([position])
  expect(source.packed).toEqual(row.packed)
  await source.reopen()
  expect(open).toHaveBeenCalledWith({projectId:'P',packageId:'PKG',packingRequestRef:'PACK',resourceVersionId:'ATTACH'})
  await expect(readRegisteredSubmissionZipSource(host,{packageId:'PKG',packingRequestRef:'OTHER'},open))
   .rejects.toThrow('SUBMISSION_ORIGINAL_PACKAGE_SCOPE')
  await expect(source.reopen()).rejects.toThrow()
  expect(open).toHaveBeenCalledOnce()
 }finally{ds.destroy()}
})
