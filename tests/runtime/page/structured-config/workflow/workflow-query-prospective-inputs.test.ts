import {afterEach,describe,expect,it} from 'vitest'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {workflowQueryInputPresentation,workflowQuerySharedInputPresentation,validateWorkflowQueryInputChanges} from '@/lowcode/resources/structured-config/workflow-definition/query-inputs'
import {workflowSourceEditFixture} from './workflow-source-edit.fixture'
const pages:PageRuntime[]=[]
afterEach(()=>pages.splice(0).forEach(page=>page.dispose()))
const fixture=()=>workflowSourceEditFixture(pages)
describe('formal prospective workflow query inputs',()=>{
 it('uses the target ancestors and isolated fields without rebinding the node or changing the old shared-model intersection',async()=>{
  const f=await fixture()
  expect(workflowQuerySharedInputPresentation(f.ds,'W','QUERY').inputs).toEqual([])
  const state=workflowQuerySharedInputPresentation(f.ds,'W','QUERY',f.projection)
  expect(state.inputs).toEqual([{value:'START.code',label:'开始 · 编码'}]);expect(state.columns.map(column=>column.name)).toEqual(['isolated'])
  expect(()=>validateWorkflowQueryInputChanges(f.ds,'W','QUERY',{values:[JSON.stringify({Type:'GetInputParam',ParamName:'START.code'})]},f.projection)).not.toThrow()
  expect(f.nodes.rows.find(row=>row['rowid']==='QUERY')?.['node_config']).toBe('MODEL');expect(f.nodes.hasEditingChanges()).toBe(false);expect(f.http.saves).toHaveLength(0)
 })
 it('rejects changed source binding, existing CRUD consumers and an independent rebind draft',async()=>{
  const f=await fixture()
  expect(()=>workflowQueryInputPresentation(f.ds,'W','QUERY',{...f.projection,fromModelId:'OTHER'})).toThrow('归属')
  Object.assign(f.http.records['Base_WorkflowNodeDefinition']![2]!,{node_type:'add',node_config:'',dataOperateModId:'FORK'});await f.nodes.refresh()
  expect(()=>workflowQuerySharedInputPresentation(f.ds,'W','QUERY',f.projection)).toThrow('消费者')
  f.http.records['Base_WorkflowNodeDefinition']![2]!['dataOperateModId']='';await f.nodes.refresh();f.nodes.updateEditingValue('QUERY','node_config','FORK')
  expect(()=>workflowQueryInputPresentation(f.ds,'W','QUERY',f.projection)).toThrow('改绑');expect(f.nodes.getEditingRow('QUERY')?.['node_config']).toBe('FORK');expect(f.http.saves).toHaveLength(0)
 })
 it('rejects another instance, mixed field ranges and incomplete results',async()=>{
  const f=await fixture(),other=await fixture()
  expect(()=>workflowQueryInputPresentation(f.ds,'W','QUERY',{...f.projection,models:other.projection.models})).toThrow('视图')
  f.projection.fields.queryContext={dataSpaceId:'W',modelIds:['MODEL','FORK']};await f.projection.fields.refresh()
  expect(()=>workflowQueryInputPresentation(f.ds,'W','QUERY',f.projection)).toThrow('字段归属')
  f.projection.fields.queryContext={dataSpaceId:'W',modelIds:['FORK']};await f.projection.fields.refresh();f.projection.fields.total++
  expect(()=>workflowQueryInputPresentation(f.ds,'W','QUERY',f.projection)).toThrow('完整')
 })
 it('rejects an empty wrong-model query and an additional filter that hides fields of the target model',async()=>{
  const f=await fixture()
  f.projection.fields.queryContext={dataSpaceId:'W',modelIds:['MISSING']};await f.projection.fields.refresh();expect(f.projection.fields.rows).toHaveLength(0)
  expect(()=>workflowQueryInputPresentation(f.ds,'W','QUERY',f.projection)).toThrow('范围')
  f.projection.fields.queryContext={dataSpaceId:'W',modelIds:['FORK']};f.projection.fields.filterExpression={field:'Name',operator:'eq',value:'hidden'};await f.projection.fields.refresh()
  expect(()=>workflowQueryInputPresentation(f.ds,'W','QUERY',f.projection)).toThrow('范围')
 })
})
