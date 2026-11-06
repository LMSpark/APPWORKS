import {describe,expect,it} from 'vitest'
import {compileLogicViewOutputFields} from '@/lowcode/resources/structured-config/logic-view/output/publication-plan'
import type {PageDataSpaceModelSourcePrepared} from '@/lowcode/data-space/model-source/lowcode-data-space-source-catalog'

const source:PageDataSpaceModelSourcePrepared={
 source:{type:'table',id:'T',name:'Orders',description:'订单',dbid:'DB',databaseName:'Database',providerId:''},
 model:{Type:'数据库表',MetaName:'Orders',description:'订单',DbId:'DB',DbName:'Database',JoinType:'',ForeignKeyFields:'',JoinFilter:'',PId:''},
 fields:[['id','int',1],['name','varchar',0]].map(([Name,FieldType,IsPKey])=>({Name:String(Name),FieldType:String(FieldType),IsPKey:Number(IsPKey),description:'',type:'dataModel',IsOutput:1,AsName:'',ValueFun:'',Expression:'',allowAIAdd:0,OrderType:'',Order:0,Group:0})),
}
const node=()=>({Name:'Orders',MetaName:'Orders',Type:'数据库表',DbId:'DB',OutputType:'Table',PrimaryKeyFields:'id',Fields:[
 {Name:'id',AsName:'order_id',Description:'订单号',FieldType:'int',IsPKey:1,IsOutput:1},
 {Name:'name',Description:'名称',FieldType:'varchar',IsPKey:0,IsOutput:1},
 {Name:'hidden',FieldType:'varchar',IsOutput:0}],inputParams:[{Name:'arg',IsOutput:1}],Filter:{field:'hidden',value:'keep'},ChildTables:[]})
describe('logical-view output publication semantics',()=>{
 it.each(['empty','zero','false'])('rejects %s output instead of interpreting backend default projection as zero columns',kind=>{
  const input:Record<string,unknown>=node()
  input['Fields']=kind==='empty'?[]:(input['Fields'] as Array<Record<string,unknown>>).map(field=>({...field,IsOutput:kind==='zero'?0:false}))
  expect(()=>compileLogicViewOutputFields({design:[input],source})).toThrow('输出')
 })
 it('projects only selected data fields with explicit aliases and source-verified types and primary key',()=>{
  const input=node(),before=structuredClone(input)
  expect(compileLogicViewOutputFields({design:[input],source})).toEqual([
   {enname:'order_id',cnname:'订单号',description:'订单号',DataType:'int',IsPKey:1},
   {enname:'name',cnname:'名称',description:'名称',DataType:'varchar',IsPKey:0},
  ])
  expect(input).toEqual(before)
 })
 it.each(['multiple-roots','children','hierarchy','different-source','computed','value-override','wrong-type','fake-primary','duplicate','missing-name','blank-alias','missing-output-flag'])(
  'rejects %s before producing a misleading published schema',kind=>{
   const input:Record<string,unknown>=node(),fields=input['Fields'] as Array<Record<string,unknown>>
   if(kind==='children')input['ChildTables']=[node()]
   if(kind==='hierarchy')input['OutputType']='HierarchyData'
   if(kind==='different-source')input['DbId']='OTHER'
   if(kind==='computed')fields[0]!['ValueFun']={Type:'GetConstValue',Value:0}
   if(kind==='value-override')fields[0]!['Value']=0
   if(kind==='wrong-type')fields[0]!['FieldType']='varchar'
   if(kind==='fake-primary')fields[1]!['IsPKey']=1
   if(kind==='duplicate')fields[1]!['AsName']='ORDER_ID'
   if(kind==='missing-name')fields[0]!['Name']=''
   if(kind==='blank-alias')fields[0]!['AsName']='  '
   if(kind==='missing-output-flag')delete fields[0]!['IsOutput']
   expect(()=>compileLogicViewOutputFields({design:kind==='multiple-roots'?[input,node()]:[input],source})).toThrow()
  })
 it('rejects an unproven key and preserves explicitly non-key output fields',()=>{
  const input=node();input.Fields[0]!.IsPKey=0
  expect(compileLogicViewOutputFields({design:[input],source})[0]?.IsPKey).toBe(0)
  input.Fields[0]!.IsPKey=1;input.PrimaryKeyFields='name'
  expect(()=>compileLogicViewOutputFields({design:[input],source})).toThrow('主键')
 })
})
