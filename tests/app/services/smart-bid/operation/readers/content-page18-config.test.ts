import {expect,it,vi} from 'vitest'
import type {SparkNode} from '@spark-appworks/spark-data'
import rule from '@/views/features/application/smart-bid/authoring/page18/rule.json'
import script from '@/views/features/application/smart-bid/authoring/page18/script.js?raw'
import {executeActionDescriptor} from '../../../../../../packages/spark-component/src/page/actions/action-executor'
import {nodeToActionDescriptor} from '../../../../../../packages/spark-component/src/page/actions/node-to-descriptor'
import type {ActionExecutionContext} from '../../../../../../packages/spark-component/src/page/actions/action-types'
import {isRecord} from '@spark-appworks/spark-utils'

function isSparkNode(value:unknown):value is SparkNode{
 return isRecord(value)&&typeof value['type']==='string'
}

function buttons(nodes:unknown):SparkNode[] {
 if(!Array.isArray(nodes))return []
 return nodes.filter(isSparkNode).flatMap(node=>{
  const toolbar=isRecord(node.props?.['toolbar'])?node.props['toolbar']:undefined
  const actions=isRecord(node.props?.['actions'])?node.props['actions']:undefined
  const actionNodes=[
   ...(Array.isArray(toolbar?.['children'])?toolbar['children']:[]),
   ...(Array.isArray(actions?.['children'])?actions['children']:[]),
  ]
  const directChildren=Array.isArray(node.children)?node.children:[]
  const childNodes=[...directChildren,...actionNodes].filter(
   (child):child is SparkNode=>typeof child==='object'&&child!==null&&'type'in child,
  )
  return [...(node.type==='r-button'?[node]:[]),...buttons(childNodes)]
 })
}

function descriptor(label:string) {
 const node=buttons(rule).find(item=>item.props?.['label']===label)
 if(!node)throw Error(`TEST_BUTTON_REQUIRED: ${label}`)
 const result=nodeToActionDescriptor(node)
 if(!result)throw Error(`TEST_DESCRIPTOR_REQUIRED: ${label}`)
 return result
}

function context(invokeHostCommand:NonNullable<ActionExecutionContext['invokeHostCommand']>,
 query:Readonly<Record<string,unknown>>):ActionExecutionContext {
 return {
  getDataSet:()=>null,
  resolveView:()=>null,
  getDataSource:()=>null,
  getPageService:()=>null,
  invokeHostCommand,
  getRouteQuery:()=>query,
  getRouter:()=>null,
 }
}

it('keeps page 18 zero-script and binds its directory through the standard DataView action chain',()=>{
 expect(script.trim()).toBe('')
 const table=rule[0]?.children?.[0]
 expect(table).toMatchObject({type:'r-table',props:{
  dataViewKey:'KnowledgeGuide@effectiveDirectory',autoColumns:false,showPagination:false,
 }})
 expect(buttons(rule).map(node=>node.props?.['label'])).toEqual(expect.arrayContaining([
  '读取操作目录','查看指南','派发当前操作','重查原试次','查看原实发 JSON','查看已核候选 JSON','查看返工交接',
 ]))
})

it('parses strict route JSON and dispatches through the PageRuntime host command owner',async()=>{
 const assertCurrent=vi.fn()
 const invokeHostCommand=vi.fn(async()=>({assertCurrent,outcome:{state:'ACTION_APPLIED'}}))
 const query={
  operationId:'39',requestKey:'Q',operationPrompt:'采用候选',operationInputs:'{"revisionId":"REV"}',
 }
 await executeActionDescriptor(descriptor('派发当前操作'),context(invokeHostCommand,query))
 expect(invokeHostCommand).toHaveBeenCalledExactlyOnceWith('content.operation.dispatch',{
  operationId:'39',requestKey:'Q',prompt:'采用候选',inputs:{revisionId:'REV'},
 })
 expect(assertCurrent).toHaveBeenCalledOnce()
 query.operationInputs='{'
 await executeActionDescriptor(descriptor('派发当前操作'),context(invokeHostCommand,query))
 expect(invokeHostCommand).toHaveBeenCalledTimes(1)
})

it('does not hide missing original evidence or nested method owners',async()=>{
 const invokeHostCommand=vi.fn(async()=>({state:'DISPATCH_RECORDED',assertCurrent:()=>{}}))
 const query={
  runId:'RUN',attemptRef:'TRY',requestKey:'Q',targetDigest:'a'.repeat(64),configurationLockHash:'b'.repeat(64),
 }
 await expect(executeActionDescriptor(descriptor('查看原实发 JSON'),context(invokeHostCommand,query)))
  .resolves.toBeUndefined()
 expect(invokeHostCommand).toHaveBeenCalledWith('content.operation.readDispatch',query)
})
