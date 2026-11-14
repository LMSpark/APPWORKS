import {describe,expect,it} from 'vitest'
import {buildWorkflowOperationOutput,workflowOperationOutputFields,workflowOperationOutputText} from '@/lowcode/resources/structured-config/workflow-definition/output/operation-output'

const model={rowid:'M',dataSetId:'W',Type:'数据库表',requestType:'add',DbId:'DB',DbName:'database',MetaName:'Business'}
const physical=[{Name:'rowid',FieldType:'varchar',IsPKey:1},{Name:'ReportID',FieldType:'varchar',IsPKey:0},{Name:'flowstate',FieldType:'int',IsPKey:0},{Name:'lingma_sys_ent',FieldType:'varchar',IsPKey:1}]
const fields=physical.map((field,index)=>({...field,rowid:`F${index}`,dataSetId:'W',dataModelId:'M',type:'inputParams',IsOutput:0,description:field.Name,AsName:'not-a-runtime-alias'}))
const input={workflowId:'W',modelId:'M',operation:'add' as const,model,fields,physical}
describe('SQL operation output uses formal field identities and actual flat rows',()=>{
 it('publishes business physical fields using exact names and formal IDs, retaining input flags',()=>{
  expect(buildWorkflowOperationOutput(input)).toEqual(fields.slice(0,3).map(field=>({rowid:field.rowid,pid:null,Name:field.Name,Description:field.description,FieldType:field.FieldType,isParent:false})))
  expect(fields.every(field=>field.IsOutput===0)).toBe(true)
 })
 it('publishes only the unique business PK for delete, even when other input constants exist',()=>{
  expect(buildWorkflowOperationOutput({...input,operation:'delete',model:{...model,requestType:'delete'}})).toEqual([{rowid:'F0',pid:null,Name:'rowid',Description:'rowid',FieldType:'varchar',isParent:false}])
 })
 it('preserves existing leaf extension members without introducing roots or regenerating IDs',()=>{
  const first=buildWorkflowOperationOutput(input);first[0]!['custom']={keep:true}
  expect(buildWorkflowOperationOutput({...input,original:first})).toEqual(first)
  expect(workflowOperationOutputFields(JSON.stringify(first))).toEqual(first)
 })
 it('retains original formatting and leaf order when only physical field enumeration order differs',()=>{
  const output=buildWorkflowOperationOutput(input),original=JSON.stringify([...output].reverse(),null,2)
  expect(workflowOperationOutputText({output,original})).toBe(original)
 })
 it.each([
  {model:{...model,dataSetId:'OTHER'}}, {model:{...model,Type:'接口'}}, {model:{...model,requestType:'edit'}},
  {fields:fields.slice(1)}, {fields:[...fields,fields[0]!]}, {fields:fields.map(row=>row.Name==='ReportID'?{...row,Name:'reportid'}:row)},
  {fields:fields.map(row=>row.Name==='flowstate'?{...row,FieldType:'varchar'}:row)}, {fields:fields.map(row=>({...row,IsOutput:1}))},
  {fields:fields.map(row=>({...row,dataModelId:'OTHER'}))}, {fields:fields.map(row=>({...row,rowid:'new:0'}))},
  {physical:physical.map(row=>({...row,IsPKey:0}))}, {physical:physical.map(row=>({...row,IsPKey:1}))},
 ])('rejects unproven model, field or physical identities (%j)',change=>{
  expect(()=>buildWorkflowOperationOutput({...input,...change})).toThrow()
 })
 it.each([
  [{rowid:'ROOT',pid:null,Name:'mapListAdd',FieldType:'Array',isParent:true}],
  [{rowid:'F0',pid:'ROOT',Name:'rowid',FieldType:'varchar',isParent:false}],
  [{rowid:'F0',pid:null,Name:'rowid',FieldType:'varchar',isParent:false},{rowid:'F0',pid:null,Name:'other',FieldType:'int',isParent:false}],
  [{rowid:'F0',pid:null,Name:'nested.name',FieldType:'varchar',isParent:false}],
 ].map(mapping=>({mapping})))('rejects unsupported trees and ambiguous leaves rather than converting them',({mapping})=>{
  expect(()=>workflowOperationOutputFields(mapping)).toThrow()
 })
 it('rejects an orphan original leaf instead of silently dropping it',()=>{
  expect(()=>buildWorkflowOperationOutput({...input,original:[{rowid:'OLD',pid:null,Name:'old',FieldType:'int',isParent:false}]})).toThrow()
 })
})
