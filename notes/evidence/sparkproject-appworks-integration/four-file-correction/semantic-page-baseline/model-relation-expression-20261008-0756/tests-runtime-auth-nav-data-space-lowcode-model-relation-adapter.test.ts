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
  expect(result.resourceRelations).toMatchObject([{fieldMappings:[{parentResourceField:'parentKey',childResourceField:'parentRef'},{parentResourceField:'tenant',childResourceField:'tenantRef'}]}])
  expect(result.resourceRelations[0]?.cascadeDelete).toBe(true)
 })
 it('does not retain partial AND mappings when a nested OR is unsupported',()=>{
  const filter=DataViewFilter.group({logic:"and",filters:[DataViewFilter.condition({field:'parentId',operator:'eq',value:{Type:'GetTableField',Field:'id'}}).toJSON(),DataViewFilter.group({logic:"or",filters:[DataViewFilter.condition({field:'parentId',operator:'eq',value:{Type:'GetTableField',Field:'id'}}).toJSON()]}).toJSON()]})
  const result=new LowcodeModelRelationAdapter().adapt([relation('currentRow',filter)],bindings)
  expect(result.resourceRelations).toEqual([]);expect(result.diagnostics).toHaveLength(1)
 })
 it('rejects an unknown selected-model field instead of guessing a physical column',()=>{
  const filter=DataViewFilter.condition({field:'physicalFk',operator:'eq',value:{Type:'GetTableField',Field:'id'}})
  expect(()=>new LowcodeModelRelationAdapter().adapt([relation('currentRow',filter)],bindings)).toThrow(/正式关系字段/)
 })
 it('preserves structural relations when the legacy dependency type is unknown',()=>{
  const result = new LowcodeModelRelationAdapter().adapt([relation('refresh')],bindings)
  expect(result.resourceRelations).toHaveLength(1)
  expect(result.diagnostics).toEqual([])
 })
})
