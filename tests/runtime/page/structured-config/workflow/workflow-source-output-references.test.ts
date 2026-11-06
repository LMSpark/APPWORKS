import {afterEach,describe,expect,it} from 'vitest'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {DataViewFilter,DataViewFilterCodec} from '@spark-appworks/spark-data'
import {assertWorkflowFieldStructureChanges} from '@/lowcode/resources/structured-config/workflow-definition/query-field-references'
import {workflowSourceEditFixture} from './workflow-source-edit.fixture'
const pages:PageRuntime[]=[]
afterEach(()=>pages.splice(0).forEach(page=>page.dispose()))
describe('single-node source output references',()=>{
 async function fixture(param:string){
  const f=await workflowSourceEditFixture(pages),field=f.ds.getView('Base_DataModel_Field')!.readSnapshot().rows[0]!
  f.http.records['Base_DataModel']![1]!['Filter']=DataViewFilterCodec.serializeStored(DataViewFilter.condition({field:'isolated',operator:'eq',value:{Type:'GetInputParam',ParamName:param}}))
  f.http.records['Base_DataModel_Field']![0]!['ValueFun']=JSON.stringify({Type:'GetTableField',TableName:'physical',FieldName:'code'})
  return{...f,changes:[{before:field}]}
 }
 it('preserves references to another consumer of the old model and physical source definitions',async()=>{
  const f=await fixture('SECOND.code')
  await expect(assertWorkflowFieldStructureChanges({dataSet:f.ds,workflowId:'W',nodeId:'QUERY',changes:f.changes,options:{scope:'node-output'}})).resolves.toBeUndefined()
  expect(f.http.saves).toHaveLength(0)
 })
 it('still blocks an actual reference to the changed target output',async()=>{
  const f=await fixture('QUERY.code')
  await expect(assertWorkflowFieldStructureChanges({dataSet:f.ds,workflowId:'W',nodeId:'QUERY',changes:f.changes,options:{scope:'node-output'}})).rejects.toThrow('字段仍被引用')
  expect(f.http.saves).toHaveLength(0)
 })
 it('checks node output parameters in another model JoinFilter through the same formal projection',async()=>{
  const f=await fixture('SECOND.code')
  f.http.records['Base_DataModel']![1]!['JoinFilter']=DataViewFilterCodec.serializeStored(DataViewFilter.condition({field:'isolated',operator:'eq',value:{Type:'GetInputParam',ParamName:'QUERY.code'}}))
  await expect(assertWorkflowFieldStructureChanges({dataSet:f.ds,workflowId:'W',nodeId:'QUERY',changes:f.changes,options:{scope:'node-output'}})).rejects.toThrow('JoinFilter')
  expect(f.http.saves).toHaveLength(0)
 })
})
