import {describe,expect,it} from 'vitest'
import {buildWorkflowQueryOutput} from '@/lowcode/resources/structured-config/workflow-definition/output/query-output'

const field={rowid:'F1',dataSetId:'W1',dataModelId:'M1',type:'dataModel',Name:'name',AsName:'',FieldType:'varchar',description:'名称',IsOutput:1}
const original=[
 {rowid:'ITEMS',pid:null,Name:'items',Description:'数据项',FieldType:'Array',isParent:true,keep:{custom:true}},
 {rowid:'COUNT',pid:null,Name:'Count',Description:'数据总数',FieldType:'int',isParent:false},
 {rowid:'F1',pid:'ITEMS',Name:'name',Description:'名称',FieldType:'varchar',isParent:false,custom:'keep'},
]
describe('workflow query output identity and field projection',()=>{
 it('migrates a verified fork field identity while preserving existing roots and unknown leaf members',()=>{
  const next={...field,rowid:'NEW1',dataModelId:'M2',AsName:'title'}
  const transition={fromModelId:'M1',fields:[field],removedIds:[],fieldIds:[{from:'F1',to:'NEW1'}]}
  expect(buildWorkflowQueryOutput({workflowId:'W1',modelId:'M2',fields:[next],original,transition})).toEqual([original[0],original[1],{...original[2],rowid:'NEW1',Name:'title'}])
  expect(original[2]?.rowid).toBe('F1')
 })
 it('drops only explicitly removed verified old fields and keeps the original roots',()=>{
  expect(buildWorkflowQueryOutput({workflowId:'W1',modelId:'M1',fields:[],original,transition:{fromModelId:'M1',fields:[field],removedIds:['F1'],fieldIds:[]}})).toEqual(original.slice(0,2))
 })
 it.each([
  {fromModelId:'OTHER',fields:[field],removedIds:[],fieldIds:[{from:'F1',to:'NEW1'}]},
  {fromModelId:'M1',fields:[field],removedIds:[],fieldIds:[]},
  {fromModelId:'M1',fields:[field],removedIds:[],fieldIds:[{from:'UNKNOWN',to:'NEW1'}]},
  {fromModelId:'M1',fields:[field],removedIds:['F1'],fieldIds:[{from:'F1',to:'NEW1'}]},
  {fromModelId:'M1',fields:[field],removedIds:[],fieldIds:[{from:'F1',to:'new:0'}]},
  {fromModelId:'M1',fields:[field],removedIds:[],fieldIds:[{from:'F1',to:'NEW1'},{from:'F1',to:'NEW1'}]},
 ])('rejects incomplete or ambiguous transition identities instead of guessing',transition=>{
  expect(()=>buildWorkflowQueryOutput({workflowId:'W1',modelId:'M2',fields:[{...field,rowid:'NEW1',dataModelId:'M2'}],original,transition})).toThrow()
 })
 it('preserves root and field identities and unknown members while projecting aliases and output choices',()=>{
  const fields=[{...field,AsName:'title',description:'新说明'}, {...field,rowid:'F2',Name:'notOutput',IsOutput:0},
   {...field,rowid:'P1',type:'inputParams',Name:'request',IsOutput:1}]
  const result=buildWorkflowQueryOutput({workflowId:'W1',modelId:'M1',fields,original})
  expect(result).toEqual([original[0],original[1],{...original[2],Name:'title',Description:'新说明'}])
  expect(original[2]?.Name).toBe('name')
 })
 it('removes a known field from the output when explicitly disabled, preserving roots',()=>{
  expect(buildWorkflowQueryOutput({workflowId:'W1',modelId:'M1',fields:[{...field,IsOutput:0}],original})).toEqual(original.slice(0,2))
 })
 it.each([
  [{...field,dataSetId:'OTHER'}], [{...field,dataModelId:'OTHER'}], [field,{...field}],
  [field,{...field,rowid:'F2',Name:'other',AsName:'name'}], [{...field,FieldType:''}], [{...field,IsOutput:'yes'}],
  [{...field,IsPKey:1,IsOutput:0}],
  [{...field,rowid:'new:0'}],
 ].map(fields=>({fields})))('rejects invalid ownership, identity, names or output flags',({fields})=>{
  expect(()=>buildWorkflowQueryOutput({workflowId:'W1',modelId:'M1',fields})).toThrow()
 })
 it.each([
  [...original,{rowid:'CUSTOM',pid:null,Name:'unknown',FieldType:'int',isParent:false}],
  original.map(row=>row.rowid==='F1'?{...row,pid:'MISSING'}:row),
  original.map(row=>row.rowid==='COUNT'?{...row,rowid:'ITEMS'}:row),
 ].map(mapping=>({mapping})))('refuses to silently discard unsupported or corrupt existing mapping entries',({mapping})=>{
  expect(()=>buildWorkflowQueryOutput({workflowId:'W1',modelId:'M1',fields:[field],original:mapping})).toThrow()
 })
 it('creates roots once for a new node and retains them on subsequent generation',()=>{
  const first=buildWorkflowQueryOutput({workflowId:'W1',modelId:'M1',fields:[field]})
  const second=buildWorkflowQueryOutput({workflowId:'W1',modelId:'M1',fields:[field],original:first})
  expect(second).toEqual(first)
  expect(first).toHaveLength(3)
  expect(first[2]?.['rowid']).toBe('F1')
  expect(first[2]?.['pid']).toBe(first[0]?.['rowid'])
 })
})
