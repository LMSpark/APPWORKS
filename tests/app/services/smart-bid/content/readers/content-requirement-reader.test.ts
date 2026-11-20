import {expect,it,vi} from 'vitest'
import {DataSet,parseDataViewKey} from '@spark-appworks/spark-data'
import {readContentRequirement,readEffectiveRequirementVersions} from '@/views/features/application/smart-bid/authoring/model/content-requirement-reader'
import {DataSpaceQueryTable} from '../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/protocol/data-space-query-table'
import {DataSpaceQueryContext} from '../../../../../../packages/spark-lowcode-api/src/platform/data-space/runtime/query/data-space-query-context'

async function fixture(options:{count?:number|null;wrong?:string;hidden?:string}={}){
 const record={id:'REQ',projectId:'P',lineageId:'L',version:'002',kind:'FORMAT',text:'原件文字',score:null,
  sourceSpan:null,supportingSpans:[],sourceRecord:null,parseQuality:'TEXT_ONLY',checks:[],constraint:null,applicability:{},status:'ADOPTED'}
 const scope={logic:'and' as const,filters:['projectId','lineageId','version'].map(field=>({field,operator:'eq' as const,value:{Type:'GetInputParam',ParamName:field}}))}
 const ds=DataSet.fromJson({scenarioId:'S',tables:{Requirement:{modelBinding:{modelId:'M',modelName:'Requirement'},
  columns:Object.keys(record).map(name=>({name,isPrimaryKey:name==='id'})),
  views:{default:{},selectedRequirement:{commitMode:'staged',scopeFilter:scope},
   effectiveRequirementVersions:{commitMode:'staged',scopeFilter:scope.filters[0]!,
    queryConfig:{autoQuery:false,allPages:true,pagination:'paged'}}}}}})
 const view=ds.getView('Requirement','selectedRequirement')!,table=new DataSpaceQueryTable({scenarioId:'S',metaName:'Requirement'})
 const save=vi.fn(async()=>{throw Error('UNEXPECTED_WRITE')})
 const query=vi.fn(async()=>new DataSpaceQueryContext({identity:table.identity,scope:'q',readScope:()=> 'q',snapshot:table.applyResult({Result:{primaryKeyField:'id',data:{
  ...(options.count===null?{}:{Count:options.count??1}),Items:[{...record,...(options.wrong?{[options.wrong]:'OTHER'}:{}),lingma_sys_params:{r:[],e:[],h:options.hidden?[options.hidden]:[],m:[],d:false}}],
 }}})}))
 view.bindQueryExecutor({executeQuery:query,save})
 const effective=ds.getView('Requirement','effectiveRequirementVersions')!
 effective.bindQueryExecutor({executeQuery:query,save})
 let current=true
 const host={scenarioId:'S',projectId:'P',runtime:{resolveView:(key:string)=>{const k=parseDataViewKey(key);return k?ds.getView(k.tableName,k.viewId):undefined}},assertCurrent:()=>{if(!current)throw Error('HOST_STALE')}}
 return {ds,host,view,effective,save,query,expire:()=>{current=false}}
}

const requested={lineageId:'L',version:'002'}
it('batch reads only exact project versions and retains the original result proof',async()=>{
 const f=await fixture()
 try{
  const result=await readEffectiveRequirementVersions(f.host,[requested,requested])
  expect(f.query).toHaveBeenCalledTimes(1)
  expect(f.effective.filterExpression).toMatchObject({logic:'or',filters:[{logic:'and',filters:[
   {field:'lineageId',operator:'eq',value:'L'},{field:'version',operator:'eq',value:'002'},
  ]}]})
  expect(result.records).toEqual([{...requested,requirementContentHash:expect.stringMatching(/^[a-f0-9]{64}$/)}])
  await expect(readEffectiveRequirementVersions(f.host,[{lineageId:'L',version:'003'}])).rejects.toThrow('CONTENT_EFFECTIVE_REQUIREMENT_INCOMPLETE')
  expect(()=>result.assertCurrent()).toThrow()
  expect(f.save).not.toHaveBeenCalled()
 }finally{f.ds.destroy()}
})
it('reads the exact version string and preserves original text, without granting use',async()=>{
 const f=await fixture()
 try{
  const result=await readContentRequirement(f.host,requested)
  expect(result.dataViewKey).toBe('S@Requirement@selectedRequirement')
  expect(f.view.queryContext).toMatchObject({projectId:'P',...requested})
  expect(f.view.rows[0]?.['text']).toBe('原件文字')
  expect(result.requiresUseCheck).toBe(true)
  expect(result.requiresBaselineMembershipCheck).toBe(true)
  expect(result.requirementContentHash).toMatch(/^[a-f0-9]{64}$/)
  result.assertCurrent()
  await f.view.refresh()
  expect(()=>result.assertCurrent()).toThrow('DATA_VIEW_READ_RESULT')
  expect(f.save).not.toHaveBeenCalled()
 }finally{f.ds.destroy()}
})
it('changes the content digest when original text changes at the same identity',async()=>{
 const f=await fixture(),changed=await fixture({wrong:'text'})
 try{
  const [first,second]=await Promise.all([readContentRequirement(f.host,requested),readContentRequirement(changed.host,requested)])
  expect(first.requirementContentHash).not.toBe(second.requirementContentHash)
 }finally{f.ds.destroy();changed.ds.destroy()}
})
it.each([{wrong:'version',error:'CONTENT_REQUIREMENT_UNAVAILABLE'},{count:2,error:'CONTENT_REQUIREMENT_NOT_UNIQUE'},{hidden:'sourceRecord',error:'DATA_VIEW_READ_ROW'}])('rejects the wrong, ambiguous or unreadable original %j',async options=>{
 const f=await fixture(options)
 try{await expect(readContentRequirement(f.host,requested)).rejects.toThrow(options.error);expect(f.save).not.toHaveBeenCalled()}finally{f.ds.destroy()}
})
