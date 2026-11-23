/**
 * @module app:lowcode/resources/system/workflow/manage/flow-design-file-context
 * 职责：从本次正式模型和导航查询捕获设计文件目标及原读取证明。
 * 边界：不猜目标、不复制行或权限；只有已确认空sysid/空导航结果才使用SysForm。
 */
import {RequestState,type DataSet} from '@spark-appworks/spark-data'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {FLOW_DESIGN_SCENARIO_ID,assertFlowDesignTarget} from './flow-design-client'

export type FlowDesignFileContext=Readonly<{customPath:string;applicationId:string}>
export type ResolveFlowDesignFileContextCommand=Readonly<{runtime:PageRuntime;flowModelId:string;modelRow?:Record<string,unknown>;assertCurrent?:()=>void}>
/** 当前唯一正式模型行的指定定位字段，不接纳外部副本或编辑覆盖。 */
export function captureFlowDesignModel(dataSet:DataSet,flowModelId:string,viewId='default'){
 const id=assertFlowDesignTarget({flowModelId}),view=dataSet.getView('WFM_FLOW_MODLE',viewId)
 if(!view||view.destroyed||view.dataSet!==dataSet||view.dataTable?.modelBinding?.modelName!=='WFM_FLOW_MODLE'||view.queryContext['rowid']!==id)throw Error('FLOW_DESIGN_TARGET: 原模型视图身份不符')
 const query=view.captureReadResult(),row=view.rows[0]
 if(view.rows.length!==1||view.total!==1||view.countReported===false||!row||view.getPkKey(row)!==id)throw Error('FLOW_DESIGN_TARGET: 未返回唯一正式目标模型')
 const proof=view.captureReadRow(row,['rowid','sysid'])
 if(typeof row['sysid']==='string'&&row['sysid']!==row['sysid'].trim())throw Error('FLOW_DESIGN_TARGET: 正式sysid包含无效空白')
 if(typeof row['sysid']!=='string'&&row['sysid']!==null)throw Error('FLOW_DESIGN_TARGET: 正式sysid缺失或无效')
 const assertCurrent=()=>{query();proof();if(dataSet.getView('WFM_FLOW_MODLE',viewId)!==view)throw Error('FLOW_DESIGN_TARGET: 原模型实例已替换')}
 assertCurrent();return {view,row,assertCurrent}
}
/** 捕获已就绪的完整文件定位；调用者在每个异步边界重核原证明。 */
export function captureFlowDesignFileContext(dataSet:DataSet,flowModelId:string):FlowDesignFileContext&Readonly<{assertCurrent:()=>void}>{
 const model=captureFlowDesignModel(dataSet,flowModelId,'fileTarget'),applicationId=String(model.row['sysid']??'').trim()
 const editor=dataSet.getView('WFM_FLOW_MODLE'),edited=editor?.rows[0]
 const key=edited&&editor.getPkKey(edited),overlay=key!==undefined?editor?.getEditingRow(key):undefined
 if(edited?.['rowid'] !== flowModelId||String(overlay?.['sysid']??edited['sysid']??'').trim()!==applicationId)throw Error('FLOW_DESIGN_TARGET: 编辑目标与原文件定位不一致')
 if(!applicationId)return {customPath:'SysForm',applicationId,assertCurrent:model.assertCurrent}
 const nav=dataSet.getView('Base_NavigationInfo')
 if(!nav||nav.destroyed||nav.queryContext['rowid']!==applicationId)throw Error('FLOW_DESIGN_TARGET: 文件所属导航查询未就绪')
 const query=nav.captureReadResult()
 if(nav.countReported===false||nav.rows.length!==nav.total||nav.rows.length>1)throw Error('FLOW_DESIGN_TARGET: 文件所属导航结果不唯一或不完整')
 let folder='',rowProof:(()=>void)|undefined
 const row=nav.rows[0]
 if(row){
  if(nav.getPkKey(row)!==applicationId)throw Error('FLOW_DESIGN_TARGET: 导航不属于原模型')
  const field=['folderName','FOLDERNAME'].find(name=>nav.getColumn(name)&&nav.fieldAccess(row,name).read==='visible'&&typeof row[name]==='string')
  if(!field)throw Error('FLOW_DESIGN_TARGET: 正式导航目录不可读或缺失')
  rowProof=nav.captureReadRow(row,['rowid',field]);folder=String(row[field])
  if(folder!==folder.trim())throw Error('FLOW_DESIGN_TARGET: 正式目录包含无效空白')
 }
 const customPath=folder||'SysForm'
 if(customPath.split(/[\\/]/).some(part=>!part||part==='.'||part==='..')||/[\u0000-\u001f\u007f]/.test(customPath))throw Error('FLOW_DESIGN_TARGET: 正式文件目录无效')
 const assertCurrent=()=>{model.assertCurrent();query();rowProof?.();if(dataSet.getView('Base_NavigationInfo')!==nav)throw Error('FLOW_DESIGN_TARGET: 原导航实例已替换')}
 assertCurrent();return {customPath,applicationId,assertCurrent}
}
/** 按需读取原模型所指导航，普通保存不重新全查依赖。 */
export async function resolveFlowDesignFileContext(command:ResolveFlowDesignFileContextCommand):Promise<FlowDesignFileContext>{
 command.assertCurrent?.()
 const dataSet=command.runtime.getDataSet(FLOW_DESIGN_SCENARIO_ID)
 if(!dataSet)throw Error('FLOW_DESIGN_TARGET: 流程设计实例缺失')
 const model=captureFlowDesignModel(dataSet,command.flowModelId)
 if(command.modelRow&&command.modelRow!==model.row)throw Error('FLOW_DESIGN_TARGET: 不能使用外部模型行')
 const id=String(model.row['sysid']??'').trim()
 if(id){const nav=dataSet.getView('Base_NavigationInfo');if(!nav)throw Error('FLOW_DESIGN_TARGET: 缺少正式导航视图')
  if(nav.queryContext['rowid']!==id||nav.requestState!==RequestState.Loaded){nav.queryContext={...nav.queryContext,rowid:id};await nav.refresh();command.assertCurrent?.();model.assertCurrent();if(nav.loadingError)throw nav.loadingError}}
 const result=captureFlowDesignFileContext(dataSet,command.flowModelId);command.assertCurrent?.();result.assertCurrent()
 return {customPath:result.customPath,applicationId:result.applicationId}
}
