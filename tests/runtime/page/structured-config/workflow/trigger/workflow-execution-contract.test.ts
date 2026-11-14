import {afterEach,expect,it,vi} from 'vitest'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {workflowSourceEditFixture} from '../workflow-source-edit.fixture'
import {WorkflowExecutionContract} from '@/lowcode/resources/structured-config/workflow-definition/execution/execution-contract'
const pages:PageRuntime[]=[]
afterEach(()=>pages.splice(0).forEach(page=>page.dispose()))
it('accepts same-value native refreshes without replacing the first definition contract',async()=>{
 const f=await workflowSourceEditFixture(pages),original=f.nodes.rows[0]
 const contract=new WorkflowExecutionContract({dataSet:f.ds,workflowId:'W',guard:()=>undefined})
 await f.nodes.refresh();expect(f.nodes.rows[0]).not.toBe(original)
 expect(()=>contract.assertCurrent()).not.toThrow()
 const count=Object.values(f.ds.tables).reduce((total,table)=>total+table.viewList.length,0)
 await contract.refresh()
 expect(Object.values(f.ds.tables).reduce((total,table)=>total+table.viewList.length,0)).toBe(count)
 expect(f.http.saves).toEqual([])
})
it.each([false,true])('rejects a changed operation target without accepting a new baseline, refreshed=%s',async refreshed=>{
 const f=await workflowSourceEditFixture(pages),contract=new WorkflowExecutionContract({dataSet:f.ds,workflowId:'W',guard:()=>undefined})
 f.http.records['Base_WorkflowNodeDefinition']!.find(row=>row['rowid']==='QUERY')!['dataOperateModId']='OTHER'
 if(refreshed){await f.nodes.refresh();expect(()=>contract.assertCurrent()).toThrow('正式执行定义已变化')}
 else await expect(contract.refresh()).rejects.toThrow('正式执行定义已变化')
 expect(f.http.saves).toEqual([])
})
it('compares every captured source and preserves the first source contract after a rejected pass',async()=>{
 const f=await workflowSourceEditFixture(pages),contract=new WorkflowExecutionContract({dataSet:f.ds,workflowId:'W',guard:()=>undefined})
 const initial=contract.begin('capture');initial.acceptSource('target:MODEL','original');initial.acceptSource('fields:MODEL','original-fields');initial.finish()
 const changed=contract.begin('verify');expect(()=>changed.acceptSource('target:MODEL','changed')).toThrow('执行来源')
 const missing=contract.begin('verify');missing.acceptSource('target:MODEL','original');expect(()=>missing.finish()).toThrow('执行来源')
 const extra=contract.begin('verify');expect(()=>extra.acceptSource('target:FOREIGN','original')).toThrow('执行来源')
 const retry=contract.begin('verify');retry.acceptSource('target:MODEL','original');retry.acceptSource('fields:MODEL','original-fields');expect(()=>retry.finish()).not.toThrow()
})
it('does not promote an interrupted opening pass into a ready execution contract',async()=>{
 const f=await workflowSourceEditFixture(pages),contract=new WorkflowExecutionContract({dataSet:f.ds,workflowId:'W',guard:()=>undefined})
 contract.begin('capture').acceptSource('target:MODEL','partial')
 expect(()=>contract.begin('verify')).toThrow('首轮')
})

it('keeps the opening contract active through native node validation',async()=>{
 const f=await workflowSourceEditFixture(pages),contract=new WorkflowExecutionContract({dataSet:f.ds,workflowId:'W',guard:()=>undefined}),pass=contract.begin('capture')
 const checked=vi.spyOn(pass,'assertCurrent')
 const {WorkflowExecutionContext}=await import('@/lowcode/resources/structured-config/workflow-definition/execution/execution-context')
 const context=new WorkflowExecutionContext(f.ds,'W',()=>undefined,pass)
 try{await context.validateNode('QUERY');expect(checked).toHaveBeenCalled();pass.finish()}finally{context.dispose()}
})
