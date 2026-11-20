/**
 * @module app:lowcode/resources/system/workflow/manage/flow-design-runtime
 * 职责：在已装配流程设计场景的 PageRuntime 内，按目标模型 rowid 刷新模型/节点/连线视图。
 * 边界：供设计对话框消费父页运行实例，不单独触发场景装载或导航身份校验。
 */
import {buildDataViewKey, type DataView} from '@spark-appworks/spark-data'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {assertFlowDesignTarget, FLOW_DESIGN_SCENARIO_ID} from './flow-design-client'
import {openFlowDesignDocumentView} from './flow-design/flow-design-document-resource'
import {captureFlowDesignModel,resolveFlowDesignFileContext} from './flow-design-file-context'
import {buildFlowDesignGraphLayout, type FlowDesignGraphLayout} from './flow-design-graph-projection'

const DESIGN_TABLES = ['WFM_FLOW_MODLE', 'WFM_FLOW_NODE', 'WFM_NODE_REALATION', 'WFM_WORKFORM'] as const

export type FlowDesignPreparedViews = Readonly<{
  documentViewKey: string
  modelTitle: string
  nodeViewKey: string
  edgeViewKey: string
  workFormViewKey: string
  graphLayout: FlowDesignGraphLayout
}>

function requireView(view: DataView | undefined, modelName: string): DataView {
  if (!view || view.destroyed) throw new Error(`流程设计缺少正式 ${modelName} 视图`)
  return view
}

function readRowTitle(row: DataView['rows'][number] | undefined, fallback: string): string {
  if (!row || typeof row !== 'object') return fallback
  const title = row['TITLE']
  return typeof title === 'string' && title.trim() ? title.trim() : fallback
}

/** 写入 FLOWID 查询上下文并刷新设计场景下三张主表视图。 */
export async function prepareFlowDesignViews(
  runtime: PageRuntime,
  flowModelId: string,
  options: Readonly<{assertCurrent?: () => void}> = {},
): Promise<FlowDesignPreparedViews> {
  const targetId = assertFlowDesignTarget({
    flowModelId,
    ...(options.assertCurrent ? {assertCurrent: options.assertCurrent} : {}),
  })
  options.assertCurrent?.()
  const dataSet = runtime.getDataSet(FLOW_DESIGN_SCENARIO_ID)
  if (!dataSet) throw new Error('流程设计场景尚未装配，请从流程模型列表刷新后重开设计')
  const previous=[...DESIGN_TABLES.map(name=>dataSet.getView(name)),...dataSet.getTable('FlowDesignDocument')?.viewList??[],dataSet.getView('FunctionNodeAuth','nodeAuth')]
  if(previous.some(view=>view&&(view.mutating||view.hasUnconfirmedSave||view.hasEditingChanges()||view.dirtyTracking.hasPendingChanges())))throw Error('流程设计仍有未保存修改或原提交待核验，不能刷新或切换目标')
  const queryContext = {FLOWID: targetId, rowid: targetId}
  const views: DataView[] = []
  for (const modelName of DESIGN_TABLES) {
    const view = requireView(dataSet.getView(modelName, 'default'), modelName)
    view.queryContext = {...view.queryContext, ...queryContext}
    views.push(view)
  }
  const targetView=requireView(dataSet.getView('WFM_FLOW_MODLE','fileTarget'),'WFM_FLOW_MODLE@fileTarget')
  targetView.queryContext={rowid:targetId};views.push(targetView)
  options.assertCurrent?.()
  await Promise.all(views.map(item => item.refresh()))
  options.assertCurrent?.()
  const failed = views.find(item => item.loadingError)
  if (failed?.loadingError) throw failed.loadingError
  const modelView = requireView(dataSet.getView('WFM_FLOW_MODLE', 'default'), 'WFM_FLOW_MODLE')
  const nodeView = requireView(dataSet.getView('WFM_FLOW_NODE', 'default'), 'WFM_FLOW_NODE')
  const edgeView = requireView(dataSet.getView('WFM_NODE_REALATION', 'default'), 'WFM_NODE_REALATION')
  const modelRow = modelView.rows[0]
  captureFlowDesignModel(dataSet,targetId)
  await resolveFlowDesignFileContext({runtime,flowModelId:targetId,...(options.assertCurrent?{assertCurrent:options.assertCurrent}:{})})
  options.assertCurrent?.()
  const document=openFlowDesignDocumentView(dataSet,targetId)
  await document.refresh()
  options.assertCurrent?.()
  if(document.loadingError)throw document.loadingError
  const designJson=String(document.rows[0]?.['content']??'')
  options.assertCurrent?.()
  return {
    documentViewKey:buildDataViewKey(document.tableName,document.viewId,FLOW_DESIGN_SCENARIO_ID),
    modelTitle: modelRow&&modelView.fieldAccess(modelRow,'TITLE').read==='visible'?readRowTitle(modelRow,targetId):targetId,
    nodeViewKey: buildDataViewKey('WFM_FLOW_NODE', 'default', FLOW_DESIGN_SCENARIO_ID),
    edgeViewKey: buildDataViewKey('WFM_NODE_REALATION', 'default', FLOW_DESIGN_SCENARIO_ID),
    workFormViewKey: buildDataViewKey('WFM_WORKFORM', 'default', FLOW_DESIGN_SCENARIO_ID),
    graphLayout: buildFlowDesignGraphLayout({nodeView, edgeView, documentText: designJson}),
  }
}