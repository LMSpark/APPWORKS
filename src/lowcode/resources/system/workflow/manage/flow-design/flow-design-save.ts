/**
 * @module app:lowcode/resources/system/workflow/manage/flow-design/flow-design-save
 * 职责：编排当前设计工作区DataView的图变更、取消和保存。
 * 边界：无HTTP/文件上传旁路、无第二份图草稿；数据库和文件分别消费原owner回执。
 */
import {RequestState,type DataView} from '@spark-appworks/spark-data'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {FLOW_DESIGN_SCENARIO_ID,assertFlowDesignTarget} from '../flow-design-client'
import {captureFlowDesignModel} from '../flow-design-file-context'
import {buildFlowDesignGraphLayout,serializeFlowDesignGraphJson,type FlowDesignLayoutOverride} from '../flow-design-graph-projection'
import {FLOW_DESIGN_DOCUMENT_TABLE} from './flow-design-document-resource'

export type SaveFlowDesignCommand=Readonly<{runtime:PageRuntime;flowModelId:string;assertCurrent?:()=>void}>
/** 只定位当前工作区，不装载未展示数据或收集其他空间的草稿。 */
export function flowDesignWorkspaceViews(command:SaveFlowDesignCommand):DataView[]{
 const id=assertFlowDesignTarget(command),dataSet=command.runtime.getDataSet(FLOW_DESIGN_SCENARIO_ID)
 if(!dataSet)throw Error('流程设计场景尚未装配')
 const file=dataSet.getView(FLOW_DESIGN_DOCUMENT_TABLE,`document-${id}`)
 const views=[file,...['WFM_FLOW_MODLE','WFM_FLOW_NODE','WFM_NODE_REALATION','WFM_WORKFORM'].map(name=>dataSet.getView(name))]
 if(views.some(view=>!view||view.destroyed||view.dataSet!==dataSet))throw Error('FLOW_DESIGN_WORKSPACE: 设计工作区未完整打开')
 const known=views.filter((view):view is DataView=>view!==undefined)
 const auth=dataSet.getView('FunctionNodeAuth','nodeAuth')
 if(auth&&!auth.destroyed&&auth.queryContext['FLOWID']===id)known.push(auth)
 return known
}
function dirty(view:DataView):boolean{return view.hasUnconfirmedSave||view.hasEditingChanges()||view.dirtyTracking.hasPendingChanges()}
/** 同一DataView脏状态供关闭与导航守卫消费。 */
export function hasFlowDesignChanges(command:SaveFlowDesignCommand):boolean{return flowDesignWorkspaceViews(command).some(dirty)}
function context(command:SaveFlowDesignCommand){
 const views=flowDesignWorkspaceViews(command),[document,modelView,nodeView,edgeView]=views
 if(!document||!modelView||!nodeView||!edgeView)throw Error('FLOW_DESIGN_WORKSPACE: 缺少设计视图')
 const dataSet=modelView.dataSet
 if(!dataSet)throw Error('FLOW_DESIGN_WORKSPACE: 原实例已释放')
 const original=captureFlowDesignModel(dataSet,command.flowModelId,'fileTarget'),modelRow=modelView.rows[0]
 if(modelRow?.['rowid'] !== command.flowModelId||modelRow['sysid']!==original.row['sysid'])throw Error('FLOW_DESIGN_TARGET: 编辑模型与文件目标不一致')
 for(const view of [nodeView,edgeView]){
  view.captureReadResult()()
  if(view.queryContext['FLOWID']!==command.flowModelId||view.countReported===false||view.rows.length+view.dirtyTracking.pendingDeleteIds.size-view.dirtyTracking.pendingCreateIds.size!==view.total)throw Error('FLOW_DESIGN_WORKSPACE: 图定义未完整读取或归属已变化')
  for(const row of view.rows){
   if(view.fieldAccess(row,'FLOWID').read!=='visible'||row['FLOWID']!==command.flowModelId)throw Error('FLOW_DESIGN_WORKSPACE: 图记录不属于目标流程')
  }
 }
 for(const view of views.filter(candidate=>['WFM_WORKFORM','FunctionNodeAuth'].includes(candidate.tableName)&&dirty(candidate))){
  view.captureReadResult()()
  if(view.queryContext['FLOWID']!==command.flowModelId)throw Error('FLOW_DESIGN_WORKSPACE: 关联工作区不属于目标流程')
  const field=view.tableName==='WFM_WORKFORM'?'FlowID':'pageID'
  const rows=[...view.rows,...[...view.dirtyTracking.pendingDeleteIds].map(key=>view.dirtyTracking.getPendingDeleteSnapshot(key)).filter((row):row is NonNullable<typeof row>=>row!==undefined)]
  for(const row of rows){const key=view.getPkKey(row),edited=key===undefined?row:view.getEditingRow(key)??row
   if(view.fieldAccess(row,field).read!=='visible'||edited[field]!==command.flowModelId)throw Error('FLOW_DESIGN_WORKSPACE: 关联记录归属不符')
  }
 }
 document.captureReadResult()()
 if(document.queryContext['flowModelId']!==command.flowModelId)throw Error('FLOW_DESIGN_WORKSPACE: 原文件目标不符')
 const documentRow=document.rows[0],key=documentRow&&document.getPkKey(documentRow),editing=key!==undefined?document.getEditingRow(key):undefined
 const text=String(editing?.['content']??documentRow?.['content']??'')
 return {dataSet,views,document,nodeView,edgeView,text}
}
/** 根据原文件和当前DataView编辑覆盖即时投影；不维护页面布局副本。 */
export function flowDesignGraphLayout(command:SaveFlowDesignCommand){
 const [document,,nodeView,edgeView]=flowDesignWorkspaceViews(command)
 if(!document||!nodeView||!edgeView)throw Error('流程设计视图缺失')
 const row=document.rows[0],key=row&&document.getPkKey(row),text=String((key!==undefined?document.getEditingRow(key):undefined)?.['content']??row?.['content']??'')
 return buildFlowDesignGraphLayout({nodeView,edgeView,documentText:text})
}
/** 单次图交互把布局写回原文件DataView，新增身份由文件owner准备。 */
export async function stageFlowDesignGraph(command:SaveFlowDesignCommand&Readonly<{layoutOverride?:FlowDesignLayoutOverride}>):Promise<void>{
 const current=context(command)
 if(current.views.some(view=>view.hasUnconfirmedSave||view.mutating))throw Error('FLOW_DESIGN_WORKSPACE: 请先核验原提交')
 const text=serializeFlowDesignGraphJson({nodeView:current.nodeView,edgeView:current.edgeView,documentText:current.text,...(command.layoutOverride?{layoutOverride:command.layoutOverride}:{})})
 if(text===current.text)return
 const row=current.document.rows[0],key=row&&current.document.getPkKey(row)
 if(key===undefined)await current.document.addRow({content:text})
 else current.document.updateEditingValue(key,'content',text)
 command.assertCurrent?.()
}
/** 显式取消只还原本工作区；任何未决或在途结果都不得借取消清空。 */
export function cancelFlowDesignChanges(command:SaveFlowDesignCommand):void{
 const views=flowDesignWorkspaceViews(command)
 if(views.some(view=>view.hasUnconfirmedSave||view.mutating||view.requestState===RequestState.Loading))throw Error('FLOW_DESIGN_WORKSPACE: 原保存结果未确认，不能取消')
 const active=views.filter(dirty),checks=active.map(view=>view.captureReadResult())
 for(const check of checks)check()
 command.assertCurrent?.()
 for(const view of active)view.discardPendingChanges()
}
/** 返回是否完全干净；未知结果本轮仅核验，剩余草稿须再次显式保存。 */
export async function saveFlowDesignInfo(command:SaveFlowDesignCommand):Promise<Readonly<{complete:boolean}>>{
 command.assertCurrent?.()
 const current=context(command),dataSet=current.dataSet,recovering=current.views.some(view=>view.hasUnconfirmedSave)
 if(!recovering){
  if(dirty(current.nodeView)||dirty(current.edgeView)||dirty(current.document)){
   await stageFlowDesignGraph(command)
  }
 }
 command.assertCurrent?.()
 const result=await dataSet.saveChanges({views:current.views.map(view=>({tableName:view.tableName,viewId:view.viewId}))})
 command.assertCurrent?.()
 if(!result.success)throw result.error??Error(result.message??'流程设计保存失败')
 return {complete:!current.views.some(dirty)}
}
