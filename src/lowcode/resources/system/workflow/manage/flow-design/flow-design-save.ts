/**
 * @module app:lowcode/resources/system/workflow/manage/flow-design/flow-design-save
 * 职责：保存流程设计图 JSON 与模型/节点/连线 DataView 变更，对齐参考 saveFlowDesignInfo 主链。
 */
import type {DataView} from '@spark-appworks/spark-data'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import type {LowcodeDesignFileUpload} from '@spark-appworks/spark-lowcode-api'
import {saveFlowWorkFormRelation} from './flow-design-form-relation'
import {lowcodeApi, lowcodeHttp} from '@/lowcode/lowcode-runtime'
import {FLOW_DESIGN_SCENARIO_ID, assertFlowDesignTarget} from '../flow-design-client'
import {resolveFlowDesignFileContext} from '../flow-design-file-context'
import {type FlowDesignLayoutOverride, serializeFlowDesignGraphJson} from '../flow-design-graph-projection'
import {syncFlowDesignTables} from './flow-design-table-sync'

function normalizeText(value: unknown): string {
  return String(value ?? '').trim()
}

function requireView(view: DataView | undefined, modelName: string): DataView {
  if (!view || view.destroyed) throw new Error(`流程设计保存缺少正式 ${modelName} 视图`)
  return view
}

export type SaveFlowDesignCommand = Readonly<{
  runtime: PageRuntime
  flowModelId: string
  fileUpload: Pick<LowcodeDesignFileUpload, 'uploadWorkingText'>
  layoutOverride?: FlowDesignLayoutOverride
  assertCurrent?: () => void
}>

/** 保存设计：平台文件 + 模型 DesignJson 字段 + DataSet 脏变更。 */
export async function saveFlowDesignInfo(command: SaveFlowDesignCommand): Promise<void> {
  const targetId = assertFlowDesignTarget({
    flowModelId: command.flowModelId,
    ...(command.assertCurrent ? {assertCurrent: command.assertCurrent} : {}),
  })
  command.assertCurrent?.()
  const dataSet = command.runtime.getDataSet(FLOW_DESIGN_SCENARIO_ID)
  if (!dataSet) throw new Error('流程设计场景尚未装配')
  const modelView = requireView(dataSet.getView('WFM_FLOW_MODLE', 'default'), 'WFM_FLOW_MODLE')
  const nodeView = requireView(dataSet.getView('WFM_FLOW_NODE', 'default'), 'WFM_FLOW_NODE')
  const edgeView = requireView(dataSet.getView('WFM_NODE_REALATION', 'default'), 'WFM_NODE_REALATION')
  const modelRow = modelView.rows.find(row => row && typeof row === 'object')
  const modelRecord = modelRow && typeof modelRow === 'object' ? modelRow : undefined
  const projectionInput = {
    modelView,
    nodeView,
    edgeView,
    ...(command.layoutOverride ? {layoutOverride: command.layoutOverride} : {}),
  }
  const designJson = serializeFlowDesignGraphJson(projectionInput)
  command.assertCurrent?.()
  await syncFlowDesignTables({
    flowModelId: targetId,
    designJson,
    nodeView,
    edgeView,
    ...(command.assertCurrent ? {assertCurrent: command.assertCurrent} : {}),
  })
  const fileContext = await resolveFlowDesignFileContext({
    runtime: command.runtime,
    flowModelId: targetId,
    ...(modelRecord ? {modelRow: modelRecord} : {}),
    ...(command.assertCurrent ? {assertCurrent: command.assertCurrent} : {}),
  })
  command.assertCurrent?.()
  await command.fileUpload.uploadWorkingText({
    appType: 'designfile',
    customPath: fileContext.customPath,
    fileName: `${targetId}EJ2.json`,
    text: designJson,
  })
  command.assertCurrent?.()
  if (modelRecord) {
    const currentKey = modelView.getPkKey(modelRecord)
    if (currentKey !== undefined && modelView.fieldAccess(modelRecord, 'DesignJson').write === 'allowed') {
      modelView.updateEditingValue(currentKey, 'DesignJson', designJson)
    }
  }
  const result = await dataSet.saveChanges()
  command.assertCurrent?.()
  if (result && !result.success) throw result.error ?? new Error(result.message ?? '保存流程设计失败')
  const workFormView = dataSet.getView('WFM_WORKFORM', 'default')
  if (workFormView && !workFormView.destroyed) {
    await saveFlowWorkFormRelation({
      http: lowcodeHttp,
      flowModelId: targetId,
      view: workFormView,
      readScope: () => lowcodeApi.readRequestScope(),
      ...(command.assertCurrent ? {assertCurrent: command.assertCurrent} : {}),
    })
  }
}