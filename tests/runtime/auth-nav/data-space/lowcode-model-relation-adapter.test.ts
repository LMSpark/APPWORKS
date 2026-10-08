import { describe, expect, it } from 'vitest'
import { DataViewFilter } from '@spark-appworks/spark-data'
import type { DataSpaceDesignApi } from '@spark-appworks/spark-lowcode-api'
import { LowcodeModelRelationAdapter } from '../../../../src/lowcode/data-space/lowcode-model-relation-adapter'
type Model = Awaited<ReturnType<DataSpaceDesignApi['readModel']>>
function model(id:string,fields:readonly [string,string][]):Model {
 return {id,metaName:id,name:id,sourceName:id,sourceId:'DB',sourceType:'table',primaryKey:fields[0]?.[1] ?? '',businessMain:true,raw:{},fields:fields.map(([name,canonicalName],i)=>({id:`${id}:${name}`,modelId:id,name,canonicalName,type:'string',primaryKey:i===0,description:'',output:true,computed:false,order:0,orderType:'',raw:{}}))}
}
const bindings = new Map([['Parents',model('P',[['id','parentKey'],['tenantId','tenant']])],['Children',model('C',[['parentId','parentRef'],['tenantKey','tenantRef']])]])
function relation(dependencyType='selectedRows',filter=DataViewFilter.group({logic:"and",filters:[
 DataViewFilter.condition({field:'ChildTable.parentId',operator:'eq',value:{Type:'GetTableField',Field:'ParentTable.id'}}).toJSON(),
 DataViewFilter.condition({field:'ChildTable.tenantKey',operator:'eq',value:{Type:'GetTableField',Field:'ParentTable.tenantId'}}).toJSON(),
]})):Awaited<ReturnType<DataSpaceDesignApi['readRelations']>>[number] {
 return {sourceRelationId:'R',dataSpaceId:'S',parentModelId:'P',childModelId:'C',parentResourceName:'ParentTable',childResourceName:'ChildTable',filterExpression:filter,dependencyType,cascadeDelete:true}
}
describe('formal model relation assembly',()=>{
 it('keeps stable table names and maps formal Name to output AsName without resource guesses',()=>{
  const result=new LowcodeModelRelationAdapter().adapt([relation()],bindings)
  expect(result.diagnostics).toEqual([])
  expect(result.resourceRelations[0]?.filterExpression).toEqual({logic:'and',filters:[
   {field:'parentRef',operator:'eq',value:{Type:'GetTableField',Field:'parentKey'}},
   {field:'tenantRef',operator:'eq',value:{Type:'GetTableField',Field:'tenant'}},
  ]})
  expect(result.resourceRelations[0]?.cascadeDelete).toBe(true)
 })
 it('preserves full relation filters with OR, non-equality, constants, and parent references',()=>{
  const filter = DataViewFilter.group({logic:'and',filters:[
   DataViewFilter.group({logic:'or',filters:[
    DataViewFilter.condition({field:'ChildTable.parentId',operator:'eq',value:{Type:'GetTableField',Field:'ParentTable.id'}}).toJSON(),
    DataViewFilter.condition({field:'ChildTable.tenantKey',operator:'gte',value:{Type:'GetConstValue',Value:0}}).toJSON(),
   ]}).toJSON(),
  ]})
  const result = new LowcodeModelRelationAdapter().adapt([relation('selectedRows',filter)],bindings)
  expect(result.diagnostics).toEqual([])
  expect(result.resourceRelations[0]?.filterExpression).toEqual({logic:'and',filters:[
   {logic:'or',filters:[
    {field:'parentRef',operator:'eq',value:{Type:'GetTableField',Field:'parentKey'}},
    {field:'tenantRef',operator:'gte',value:{Type:'GetConstValue',Value:0}},
   ]},
  ]})
 })
 it('retains the complete AND/OR expression rather than partial mappings',()=>{
  const filter=DataViewFilter.group({logic:"and",filters:[DataViewFilter.condition({field:'parentId',operator:'eq',value:{Type:'GetTableField',Field:'id'}}).toJSON(),DataViewFilter.group({logic:"or",filters:[DataViewFilter.condition({field:'parentId',operator:'eq',value:{Type:'GetTableField',Field:'id'}}).toJSON()]}).toJSON()]})
  const result=new LowcodeModelRelationAdapter().adapt([relation('currentRow',filter)],bindings)
  expect(result.resourceRelations[0]?.filterExpression).toMatchObject({logic:'and',filters:[{field:'parentRef'},{logic:'or'}]});expect(result.diagnostics).toEqual([])
 })
 it('rejects an unknown selected-model field instead of guessing a physical column',()=>{
  const filter=DataViewFilter.condition({field:'physicalFk',operator:'eq',value:{Type:'GetTableField',Field:'id'}})
  const result = new LowcodeModelRelationAdapter().adapt([relation('currentRow',filter)],bindings)
  expect(result.resourceRelations).toEqual([])
  expect(result.diagnostics).toEqual(['正式关系字段未解析: R'])
 })
 it('preserves structural relations when the legacy dependency type is unknown',()=>{
  const result = new LowcodeModelRelationAdapter().adapt([relation('refresh')],bindings)
  expect(result.resourceRelations).toHaveLength(1)
  expect(result.diagnostics).toEqual([])
 })
 it('maps known structured function table and field references to stable table names',()=>{
  const filter=DataViewFilter.condition({field:'parentId',operator:'eq',value:{Type:'GetRefData',RefTableName:'ParentTable',RefFieldName:'id',FkFieldName:'tenantId'}})
  const result=new LowcodeModelRelationAdapter().adapt([relation('currentRow',filter)],bindings)
  expect(result.resourceRelations[0]?.filterExpression).toEqual({field:'parentRef',operator:'eq',value:{Type:'GetRefData',RefTableName:'Parents',RefFieldName:'parentKey',FkFieldName:'tenant'}})
 })
 it('maps a uniquely bound third model formal name and non-output field to its stable table name',()=>{
  const lookupBase=model('LOOKUP',[['id','lookupKey'],['hiddenCode','privateCode']])
  const lookup={...lookupBase,sourceName:'LookupRows',fields:lookupBase.fields.map(field=>field.name==='hiddenCode'?{...field,output:false}:field)}
  const fullBindings=new Map([...bindings,['StableLookup',lookup]])
  const filter=DataViewFilter.condition({field:'ChildTable.parentId',operator:'eq',value:{Type:'GetRefData',RefTableName:'LOOKUP',RefFieldName:'hiddenCode',FkFieldName:'hiddenCode'}})
  const result=new LowcodeModelRelationAdapter().adapt([relation('currentRow',filter)],fullBindings)
  expect(result.resourceRelations[0]?.filterExpression).toEqual({field:'parentRef',operator:'eq',value:{Type:'GetRefData',RefTableName:'StableLookup',RefFieldName:'privateCode',FkFieldName:'privateCode'}})
  expect(result.diagnostics).toEqual([])
 })
 it('preserves a composite filter while mapping an ancestor GetTableField by registered model identity',()=>{
  const fullBindings=new Map([...bindings,['StableAncestor',model('ANCESTOR',[['id','ancestorKey']])]])
  const filter=DataViewFilter.group({logic:'and',filters:[
   DataViewFilter.condition({field:'ChildTable.parentId',operator:'eq',value:{Type:'GetTableField',Field:'ParentTable.id'}}).toJSON(),
   DataViewFilter.group({logic:'or',filters:[
    DataViewFilter.condition({field:'ChildTable.tenantKey',operator:'gte',value:{Type:'GetTableField',Field:'ANCESTOR.id'}}).toJSON(),
    DataViewFilter.condition({field:'ChildTable.tenantKey',operator:'eq',value:{Type:'GetConstValue',Value:'ANCESTOR.id'}}).toJSON(),
   ]}).toJSON(),
  ]})
  const before=filter.toJSON()
  const result=new LowcodeModelRelationAdapter().adapt([relation('currentRow',filter)],fullBindings)
  expect(result.diagnostics).toEqual([])
  expect(result.resourceRelations[0]?.filterExpression).toEqual({logic:'and',filters:[
   {field:'parentRef',operator:'eq',value:{Type:'GetTableField',Field:'parentKey'}},
   {logic:'or',filters:[
    {field:'tenantRef',operator:'gte',value:{Type:'GetTableField',Field:'StableAncestor.ancestorKey'}},
    {field:'tenantRef',operator:'eq',value:{Type:'GetConstValue',Value:'ANCESTOR.id'}},
   ]},
  ]})
  expect(filter.toJSON()).toEqual(before)
 })
 it('uses a unique registered Name ahead of a stable key while preserving external collision and ambiguity diagnostics',()=>{
  const filter=DataViewFilter.condition({field:'ChildTable.parentId',operator:'eq',value:{Type:'GetTableField',Field:'External.id'}})
  const external=new LowcodeModelRelationAdapter().adapt([relation('currentRow',filter)],bindings)
  expect(external.diagnostics).toEqual([])
  expect(external.resourceRelations[0]?.filterExpression).toEqual({field:'parentRef',operator:'eq',value:{Type:'GetTableField',Field:'External.id'}})
  const collision=DataViewFilter.condition({field:'ChildTable.parentId',operator:'eq',value:{Type:'GetTableField',Field:'Parents.id'}})
  const colliding=new LowcodeModelRelationAdapter().adapt([relation('currentRow',collision)],bindings)
  expect(colliding.resourceRelations).toEqual([])
  expect(colliding.diagnostics).toContain('正式关系引用身份冲突: Parents')
  const ambiguous=new LowcodeModelRelationAdapter().adapt([relation('currentRow',DataViewFilter.condition({field:'ChildTable.parentId',operator:'eq',value:{Type:'GetTableField',Field:'ANCESTOR.id'}}))],
   new Map([...bindings,['AncestorA',model('ANCESTOR',[['id','a']])],['AncestorB',model('ANCESTOR',[['id','b']])]]))
  expect(ambiguous.resourceRelations).toEqual([])
  expect(ambiguous.diagnostics).toContain('正式关系模型引用不唯一: ANCESTOR')
  const identityCollision=new LowcodeModelRelationAdapter().adapt([relation('currentRow',DataViewFilter.condition({field:'ChildTable.parentId',operator:'eq',value:{Type:'GetTableField',Field:'ANCESTOR.id'}}))],
   new Map([...bindings,['ANCESTOR',model('OTHER',[['id','otherKey']])],['StableAncestor',model('ANCESTOR',[['id','ancestorKey']])]]))
  expect(identityCollision.diagnostics).toEqual([])
  expect(identityCollision.resourceRelations[0]?.filterExpression).toEqual({field:'parentRef',operator:'eq',value:{Type:'GetTableField',Field:'StableAncestor.ancestorKey'}})
  const unknownField=new LowcodeModelRelationAdapter().adapt([relation('currentRow',DataViewFilter.condition({field:'ChildTable.parentId',operator:'eq',value:{Type:'GetTableField',Field:'ANCESTOR.missing'}}))],
   new Map([...bindings,['StableAncestor',model('ANCESTOR',[['id','ancestorKey']])]]))
  expect(unknownField.resourceRelations).toEqual([])
  expect(unknownField.diagnostics).toContain('正式关系字段未唯一解析: R:missing')
  expect(filter.toJSON()).toEqual({field:'ChildTable.parentId',operator:'eq',value:{Type:'GetTableField',Field:'External.id'}})
 })
 it('does not treat a physical source name as a formal model or stable table alias',()=>{
  const lookup={...model('LOOKUP',[['id','lookupKey']]),sourceName:'LookupRows'}
  const fullBindings=new Map([...bindings,['StableLookup',lookup]])
  const filter=DataViewFilter.condition({field:'ChildTable.parentId',operator:'eq',value:{Type:'GetRefData',RefTableName:'LookupRows',RefFieldName:'physicalId'}})
  const result=new LowcodeModelRelationAdapter().adapt([relation('currentRow',filter)],fullBindings)
  expect(result.resourceRelations[0]?.filterExpression).toEqual({field:'parentRef',operator:'eq',value:{Type:'GetRefData',RefTableName:'LookupRows',RefFieldName:'physicalId'}})
  expect(result.diagnostics).toEqual([])
 })
 it('rejects a formal reference that collides with a stable table name without changing its source filter',()=>{
  const filter=DataViewFilter.condition({field:'ChildTable.parentId',operator:'eq',value:{Type:'GetRefData',RefTableName:'Parents',RefFieldName:'externalId'}})
  const result=new LowcodeModelRelationAdapter().adapt([relation('currentRow',filter)],bindings)
  expect(result.resourceRelations).toEqual([])
  expect(result.diagnostics).toContain('正式关系引用身份冲突: Parents')
  expect(filter.toJSON()).toEqual({field:'ChildTable.parentId',operator:'eq',value:{Type:'GetRefData',RefTableName:'Parents',RefFieldName:'externalId'}})
 })
 it('diagnoses an ambiguous formal reference instead of selecting the first binding',()=>{
  const duplicate=model('LOOKUP',[['id','otherId']])
  const fullBindings=new Map([...bindings,['StableLookupA',model('LOOKUP',[['id','lookupA']])],['StableLookupB',duplicate]])
  const filter=DataViewFilter.condition({field:'ChildTable.parentId',operator:'eq',value:{Type:'GetRefData',RefTableName:'LOOKUP',RefFieldName:'id'}})
  const result=new LowcodeModelRelationAdapter().adapt([relation('currentRow',filter)],fullBindings)
  expect(result.resourceRelations).toEqual([])
  expect(result.diagnostics).toContain('正式关系模型引用不唯一: LOOKUP')
 })
 it.each([0,false,null])('preserves explicit constant value %s',value=>{
  const filter=DataViewFilter.condition({field:'ChildTable.parentId',operator:'eq',value:{Type:'GetConstValue',Value:value}})
  const result=new LowcodeModelRelationAdapter().adapt([relation('currentRow',filter)],bindings)
  expect(result.resourceRelations[0]?.filterExpression).toEqual({field:'parentRef',operator:'eq',value:{Type:'GetConstValue',Value:value}})
  expect(result.diagnostics).toEqual([])
 })
})
