import {describe,expect,it} from 'vitest'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {fixture} from './flow-design-data.fixture'
import {prepareFlowDesignViews} from '@/lowcode/resources/system/workflow/manage'
describe('prepareFlowDesignViews',()=>{
 it('returns full bindings from the selected formal model and the same file DataView',async()=>{
  const {runtime,ds}=await fixture(true,false),result=await prepareFlowDesignViews(runtime,'FM-1')
  expect(result.modelTitle).toBe('Flow 1')
  expect(ds.getView('WFM_FLOW_MODLE')!.rows.map(row=>row['rowid'])).toEqual(['FM-1'])
  expect(runtime.resolveView(result.documentViewKey)).toBe(ds.getView('FlowDesignDocument','document-FM-1'))
  expect(result.graphLayout.nodePositions['N1']).toEqual({x:7,y:9})
  expect(runtime.resolveView(result.workFormViewKey)?.rows.map(row=>row['rowid'])).toEqual(['WF1'])
 })
 it('rejects missing design dataset',async()=>{
  const runtime={getDataSet:()=>undefined} as unknown as PageRuntime
  await expect(prepareFlowDesignViews(runtime,'x')).rejects.toThrow('设计场景')
 })
})
