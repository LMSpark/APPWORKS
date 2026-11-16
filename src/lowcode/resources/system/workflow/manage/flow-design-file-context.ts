/**
 * @module app:lowcode/resources/system/workflow/manage/flow-design-file-context
 * 职责：按流程模型 sysid 解析设计图平台文件 customPath（导航 folderName）。
 * 边界：只读；无 sysid/导航记录时回退 SysForm。
 */
import type {DataView} from '@spark-appworks/spark-data'
import type {PageRuntime} from '@spark-appworks/spark-project-model'
import {FLOW_DESIGN_SCENARIO_ID} from './flow-design-client'

export type FlowDesignFileContext = Readonly<{
  customPath: string
  applicationId: string
}>

export type ResolveFlowDesignFileContextCommand = Readonly<{
  runtime: PageRuntime
  flowModelId: string
  modelRow?: Record<string, unknown>
  assertCurrent?: () => void
}>

function normalizeText(value: unknown): string {
  return String(value ?? '').trim()
}

function readSysid(modelRow: Record<string, unknown> | undefined): string {
  if (modelRow) {
    const sysid = normalizeText(modelRow['sysid'] ?? modelRow['SYSID'])
    if (sysid) return sysid
  }
  return ''
}

async function readNavigationFolder(view: DataView, applicationId: string, assertCurrent?: () => void): Promise<string> {
  view.queryContext = {...view.queryContext, rowid: applicationId}
  await view.refresh()
  assertCurrent?.()
  if (view.loadingError) throw view.loadingError
  const row = view.rows[0]
  if (!row || typeof row !== 'object') return ''
  return normalizeText(row['folderName'] ?? row['FOLDERNAME'])
}

/** 解析设计文件存储路径；对齐参考 resolveFlowDesignFileContext。 */
export async function resolveFlowDesignFileContext(
  command: ResolveFlowDesignFileContextCommand,
): Promise<FlowDesignFileContext> {
  const applicationId = readSysid(command.modelRow)
  if (!applicationId) return {customPath: 'SysForm', applicationId: ''}
  command.assertCurrent?.()
  const dataSet = command.runtime.getDataSet(FLOW_DESIGN_SCENARIO_ID)
  const navView = dataSet?.getView('Base_NavigationInfo', 'default')
  if (!navView || navView.destroyed) return {customPath: 'SysForm', applicationId}
  const folderName = await readNavigationFolder(navView, applicationId, command.assertCurrent)
  return {customPath: folderName || 'SysForm', applicationId}
}
