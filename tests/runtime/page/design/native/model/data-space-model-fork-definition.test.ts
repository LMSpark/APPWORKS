import {describe,expect,it} from 'vitest'
import {LowcodeDataSpaceModelForkDefinition} from '@/lowcode/data-space/model-source/model/lowcode-data-space-model-fork-definition'
const model={rowid:'M1',dataSetId:'S',Name:'Orders',MetaName:'Orders',Type:'数据库表',Filter:JSON.stringify({Type:'cond',Field:'Orders.id',Operator:'equal',ValueFun:{Type:'GetInputParam',ParamName:'N.id'}}),JoinFilter:JSON.stringify({Type:'cond',Field:'Orders.id',Operator:'equal',ValueFun:{Type:'GetConstValue',Value:'Orders.id'}}),lingma_sys_key:'secret',createtime:'old',custom:'keep'}
const fields=[{rowid:'F1',dataSetId:'S',dataModelId:'M1',Name:'id',AsName:'alias',type:'dataModel',FieldType:'varchar',IsOutput:1,IsPKey:1,ValueFun:JSON.stringify({Type:'GetRefData',RefTableName:'Orders',RefFieldName:'id',FkFieldName:'id'}),custom:0},
 {rowid:'F2',dataSetId:'S',dataModelId:'M1',Name:'computed',type:'dataModel',FieldType:'计算字段',ValueFun:JSON.stringify({Type:'GetTableField',Field:'Orders.id'}),Expression:'MASK_RULE',lingma_sys_params:{e:['ValueFun']}}]
describe('formal model fork definition projection',()=>{
 it('leaves system-maintained workflow and report values for the new record while keeping same-named business field definitions',()=>{
  const source={...model,Filter:'',JoinFilter:'',flowstate:2,wfid:'OLD_INSTANCE',ReportID:'OLD_REPORT',description:'business description'},own=[{...fields[0],Name:'flowstate',ValueFun:''}]
  const result=LowcodeDataSpaceModelForkDefinition.prepare({dataSpaceId:'S',modelId:'M1',name:'Fork',models:[source],model:source,fields:own})
  for(const key of ['flowstate','wfid','ReportID'])expect(result.model).not.toHaveProperty(key)
  expect(result.model['description']).toBe('business description');expect(result.fields[0]?.['Name']).toBe('flowstate')
 })
 it('rejects target qualifier overlap before introducing an ambiguous copied reference',()=>{
  const source={...model,Name:'A',MetaName:'Physical',Filter:'',JoinFilter:''},own=[{...fields[0],Name:'B.x',ValueFun:JSON.stringify({Type:'GetTableField',Field:'A.B.x'})}]
  expect(()=>LowcodeDataSpaceModelForkDefinition.prepare({dataSpaceId:'S',modelId:'M1',name:'Fork',models:[source,{rowid:'M2',dataSetId:'S',Name:'Fork.B'}],model:source,fields:own})).toThrow('重叠')
 })
 it('does not turn a registered self reference into another complete local field name',()=>{
  const source={...model,Name:'A',Filter:'',JoinFilter:''},own=[{...fields[0],ValueFun:JSON.stringify({Type:'GetTableField',Field:'A.id'})},{...fields[1],Name:'Fork.id',ValueFun:''}]
  expect(()=>LowcodeDataSpaceModelForkDefinition.prepare({dataSpaceId:'S',modelId:'M1',name:'Fork',models:[source],model:source,fields:own})).toThrow('本地字段')
 })
 it('refuses overlapping registered qualifiers when the other model field scope has not been read',()=>{
  const source={...model,Name:'A',MetaName:'Physical',Filter:'',JoinFilter:''},own=[{...fields[0],Name:'B.x',ValueFun:JSON.stringify({Type:'GetTableField',Field:'A.B.x'})}]
  expect(()=>LowcodeDataSpaceModelForkDefinition.prepare({dataSpaceId:'S',modelId:'M1',name:'Fork',models:[source,{rowid:'M2',dataSetId:'S',Name:'A.B'}],model:source,fields:own})).toThrow('重叠')
 })
 it('copies readable business definitions with new registered self references and no old identity or query credentials',()=>{
  const result=LowcodeDataSpaceModelForkDefinition.prepare({dataSpaceId:'S',modelId:'M1',name:'Fork',models:[model],model,fields})
  expect(result.sourceFieldIds).toEqual(['F1','F2'])
  expect(result.model).toMatchObject({MetaName:'Orders',custom:'keep',Filter:expect.stringContaining('Fork.id'),JoinFilter:model.JoinFilter})
  expect(result.model).not.toHaveProperty('rowid');expect(result.model).not.toHaveProperty('Name');expect(result.model).not.toHaveProperty('lingma_sys_key');expect(result.model).not.toHaveProperty('createtime')
  expect(result.fields[0]).toMatchObject({AsName:'alias',ValueFun:fields[0]!.ValueFun,custom:0})
  expect(result.fields[1]).toMatchObject({FieldType:'计算字段',ValueFun:JSON.stringify({Type:'GetTableField',Field:'Fork.id'}),Expression:'MASK_RULE'})
  expect(JSON.stringify(result)).not.toContain('lingma_sys_');expect(result.fields[0]).not.toHaveProperty('dataModelId')
  expect(fields[1]!.ValueFun).toContain('Orders.id')
 })
 it('diagnoses opaque self references before creating any definitions',()=>{
  expect(()=>LowcodeDataSpaceModelForkDefinition.prepare({dataSpaceId:'S',modelId:'M1',name:'Fork',models:[model],model:{...model,RequestComplete:'use(Orders)'},fields})).toThrow('尚不能可靠改写')
 })
 it('rejects foreign, duplicate and unresolved model or field identities',()=>{
  for(const invalid of [[{...fields[0],dataSetId:'OTHER'}],[fields[0]!,fields[0]!]])expect(()=>LowcodeDataSpaceModelForkDefinition.prepare({dataSpaceId:'S',modelId:'M1',name:'Fork',models:[model],model,fields:invalid})).toThrow()
 })
})
