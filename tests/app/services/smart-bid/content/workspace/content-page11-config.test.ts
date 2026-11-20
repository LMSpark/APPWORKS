import {expect,it,vi} from 'vitest'
import {DataSet,type SparkNode} from '@spark-appworks/spark-data'
import rule from '@/views/features/application/smart-bid/authoring/page11/rule.json'
import script from '@/views/features/application/smart-bid/authoring/page11/script.js?raw'
import {executeActionDescriptor} from '../../../../../../packages/spark-component/src/page/actions/action-executor'
import {nodeToActionDescriptor} from '../../../../../../packages/spark-component/src/page/actions/node-to-descriptor'
import type {ActionExecutionContext} from '../../../../../../packages/spark-component/src/page/actions/action-types'
import {isRecord} from '@spark-appworks/spark-utils'

function isSparkNode(value:unknown):value is SparkNode{
 return isRecord(value)&&typeof value['type']==='string'
}

function buttons(nodes:unknown):SparkNode[]{
 if(!Array.isArray(nodes))return []
 return nodes.filter(isSparkNode).flatMap(node=>{
  const children=Array.isArray(node.children)?node.children:[]
  return [...(node.type==='r-button'?[node]:[]),...buttons(children)]
 })
}

function descriptor(label:string){
 const node=buttons(rule).find(item=>item.props?.['label']===label)
 if(!node)throw Error(`TEST_BUTTON_REQUIRED: ${label}`)
 const result=nodeToActionDescriptor(node)
 if(!result)throw Error(`TEST_DESCRIPTOR_REQUIRED: ${label}`)
 return result
}

function context(overrides:Partial<ActionExecutionContext>={}):ActionExecutionContext{
 return {
  getDataSet:()=>null,
  resolveView:()=>null,
  getDataSource:()=>null,
  getPageService:()=>null,
  getRouter:()=>null,
  ...overrides,
 }
}

it('uses declarative DataView bindings instead of page script handlers',()=>{
 expect(script.trim()).toBe('')
 expect(rule[0]).toMatchObject({
  type:'r-section',
  props:{title:'标书正文编制'},
 })
 const form=rule[0]?.children?.[1]
 expect(form).toMatchObject({
  type:'r-form',
  props:{
   dataViewKey:'D3BBA1F0780056C837AC35E9825CAD5A@WorkingDraft@personalDraft',
   dataMember:'currentRow',
  },
 })
 expect(buttons(rule).map(node=>node.props?.['label'])).toEqual(expect.arrayContaining([
  '取消本次草稿编辑','查看分册策划依据','预演候选变更','重查原保存结果',
 ]))
})

it('dispatches the original-save lookup through the standard host-command action',async()=>{
 const assertCurrent=vi.fn(),showAlert=vi.fn(async()=>{})
 const invokeHostCommand=vi.fn(async()=>({state:'SAVED',draftVersion:'V2',assertCurrent}))
 const query={
  saveRequestKey:'Q',saveRequestDigest:'a'.repeat(64),saveContentDigest:'b'.repeat(64),
  saveExpectedDraftVersion:'V1',
 }
 await executeActionDescriptor(descriptor('重查原保存结果'),context({
  invokeHostCommand,getRouteQuery:()=>query,getPageService:()=>({showAlert}) as never,
 }))
 expect(invokeHostCommand).toHaveBeenCalledExactlyOnceWith('content.authoring.readOriginalSave',{
  requestKey:'Q',requestDigest:query.saveRequestDigest,contentDigest:query.saveContentDigest,
  expectedDraftVersion:'V1',
 })
 expect(assertCurrent).toHaveBeenCalledOnce()
 expect(showAlert).toHaveBeenCalledWith(expect.any(String),'原保存结果',{})
})

it('routes cancellation through the standard DataView discard action',async()=>{
 const dataSet=DataSet.fromJson({scenarioId:'D3BBA1F0780056C837AC35E9825CAD5A',tables:{WorkingDraft:{
  tableName:'WorkingDraft',columns:[{name:'id',isPrimaryKey:true}],views:{
   default:{},personalDraft:{rows:[{id:'D'}]},
  },
 }}})
 const view=dataSet.getView('WorkingDraft','personalDraft')
 if(!view)throw Error('TEST_WORKING_DRAFT_VIEW_REQUIRED')
 view.setCurrentRow(view.rows[0]!)
 vi.spyOn(view,'hasEditingChanges').mockReturnValue(true)
 const discardPendingChanges=vi.spyOn(view,'discardPendingChanges').mockReturnValue(1)
 const action=descriptor('取消本次草稿编辑')
 await executeActionDescriptor(action,context({
  resolveView:key=>key==='D3BBA1F0780056C837AC35E9825CAD5A@WorkingDraft@personalDraft'?view:null,
  getPageService:()=>({showMessage:vi.fn()}) as never,
 }))
 expect(discardPendingChanges).toHaveBeenCalledExactlyOnceWith(['D'])
 dataSet.destroy()
})
