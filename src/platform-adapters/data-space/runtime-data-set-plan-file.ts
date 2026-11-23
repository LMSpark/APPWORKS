/**
 * @module app:lowcode/data-space/runtime-data-set-plan-file
 * 职责：通过 SPARK data FileResource DataView 发布数据空间独立 Runtime Dataset Plan。
 * 边界：只保存正式读取后的结构文件；不创建版本、不维护页面草稿、不承接业务 rows。
 * AI用途：设计器 metadata 保存确认后，将同一空间 Plan 精确写入 DataSet 目录并回读。
 */
import {
  buildRuntimeDataSetPlanText,
  getOrCreateFileResourceView,
  parseRuntimeDataSetPlanFile,
  stableRuntimeDataSetPlanText,
  RequestState,
  type DataView,
  type DataSet,
  type FileResourceTransport,
} from '@spark-appworks/spark-data'
import { LowcodeApiError } from '@/platform-adapters/api'
import {lowcodeApi, lowcodeDesignFileUpload} from '@/platform-adapters/lowcode-runtime'
import {isFileMutationUnconfirmed, markFileMutationMayHaveApplied} from '@/platform-adapters/api/design/file-mutation-state'

export const RUNTIME_DATA_SET_PLAN_FILE_TABLE = 'RuntimeDataSetPlanFile'
const RESOURCE_ID = 'spark.runtimeDataSetPlan.file'
const CUSTOM_PATH = 'DataSet'

export type PublishRuntimeDataSetPlanInput = Readonly<{
  scenarioId: string
  metadataDataSet: DataSet
  scenarioConfig: Readonly<Record<string, unknown>>
  assertCurrent: () => void
}>

function rows(view: DataView | undefined, label: string): ReadonlyArray<Readonly<Record<string, unknown>>> {
  if (view?.requestState !== RequestState.Loaded || view.rows.length !== view.total) {
    throw new Error(`RUNTIME_DATA_SET_PLAN_METADATA: ${label} 未由正式查询完整读取`)
  }
  return view.rows
}

function transport(input: PublishRuntimeDataSetPlanInput): FileResourceTransport {
  const fileName = `${input.scenarioId}.dataset.json`
  const locator = {appType: 'designfile', customPath: CUSTOM_PATH, fileName} as const
  return {
    read: async () => {
      input.assertCurrent()
      try {
        const text = await lowcodeApi.design.readTextFile(locator)
        input.assertCurrent()
        return {text, revision: '0'}
      } catch (error) {
        if (error instanceof LowcodeApiError && error.code === 404) return null
        throw error
      }
    },
    write: async ({text}) => {
      input.assertCurrent()
      await lowcodeDesignFileUpload.uploadWorkingText({...locator, text})
      try {input.assertCurrent()} catch (error) {
        throw markFileMutationMayHaveApplied(error)
      }
    },
    isUnknown: isFileMutationUnconfirmed,
  }
}

function ensurePlanFileTable(dataSet: DataSet): DataSet {
  const existing = dataSet.getTable(RUNTIME_DATA_SET_PLAN_FILE_TABLE)
  if (existing) {
    if (existing.resourceType !== 'file' || existing.resourceId !== RESOURCE_ID) {
      throw new Error('RUNTIME_DATA_SET_PLAN_SCOPE: 会话内 Plan 文件表身份冲突')
    }
    return dataSet
  }
  dataSet.addTableFromJson({
    tableName: RUNTIME_DATA_SET_PLAN_FILE_TABLE,
    resourceType: 'file',
    resourceId: RESOURCE_ID,
    columns: [
      {name: 'fileKey', type: 'string', isPrimaryKey: true},
      {name: 'scenarioId', type: 'string'},
      {name: 'fileName', type: 'string'},
      {name: 'text', type: 'string'},
    ],
    views: {default: {autoLoad: false, commitMode: 'staged'}},
  })
  return dataSet
}

function planText(input: PublishRuntimeDataSetPlanInput): string {
  const metadata = input.metadataDataSet
  const space = rows(metadata.getView('Base_DataSet', 'default'), 'Base_DataSet')
  if (space.length !== 1 || space[0]?.['rowid'] !== input.scenarioId) {
    throw new Error('RUNTIME_DATA_SET_PLAN_METADATA: Base_DataSet 未唯一确认目标空间')
  }
  const text = buildRuntimeDataSetPlanText({
    scenarioId: input.scenarioId,
    space: space[0],
    models: rows(metadata.getView('Base_DataModel', 'default'), 'Base_DataModel'),
    fields: rows(metadata.getView('Base_DataModel_Field', 'default'), 'Base_DataModel_Field'),
    relations: rows(metadata.getView('Base_DataModel_Relation', 'default'), 'Base_DataModel_Relation'),
    scenarioConfig: input.scenarioConfig,
  })
  parseRuntimeDataSetPlanFile(text, input.scenarioId)
  return text
}

/** 由一份 FileResource DataView 承接 Plan 替换；保存器内置写后精确文本回读。 */
export async function publishRuntimeDataSetPlan(input: PublishRuntimeDataSetPlanInput): Promise<void> {
  input.assertCurrent()
  let text = planText(input)
  const dataSet = ensurePlanFileTable(input.metadataDataSet)
  try {
    const fileName = `${input.scenarioId}.dataset.json`
    const view = getOrCreateFileResourceView({
      dataSet,
      tableName: RUNTIME_DATA_SET_PLAN_FILE_TABLE,
      viewId: `dataset-${input.scenarioId}`,
      resourceId: RESOURCE_ID,
      contentField: 'text',
      columns: dataSet.getTable(RUNTIME_DATA_SET_PLAN_FILE_TABLE)?.columns ?? [],
      queryContext: {scenarioId: input.scenarioId, fileName},
      target: current => {
        const scenarioId = current.queryContext['scenarioId'], currentFileName = current.queryContext['fileName']
        if (scenarioId !== input.scenarioId || currentFileName !== fileName) {
          throw new Error('RUNTIME_DATA_SET_PLAN_SCOPE: Plan 文件目标已变化')
        }
        return {key: JSON.stringify([scenarioId, fileName]), fields: {scenarioId, fileName}}
      },
      transport: transport(input),
      assertCurrent: input.assertCurrent,
    })
    if (view.hasUnconfirmedSave) {
      const verified = await view.verifySourceWriteAttempt()
      if (verified.state !== 'confirmed') throw new Error('RUNTIME_DATA_SET_PLAN_WRITE: 原提交仍未确认，须显式重开或核验')
      view.acknowledgeSourceWriteAttempt()
    }
    const queried = await view.requestRefresh()
    input.assertCurrent()
    if (!queried.success) throw queried.error ?? new Error(queried.message ?? 'Runtime Dataset Plan 读取失败')
    const row = view.currentRow
    if (!row) {
      await view.addRow({text})
    } else {
      const key = view.getPkKey(row)
      if (key === undefined) throw new Error('RUNTIME_DATA_SET_PLAN_SCOPE: 文件 DataView 缺少正式行身份')
      if (typeof row['text'] === 'string') {
        text = stableRuntimeDataSetPlanText(row['text'], text, input.scenarioId)
      }
      if (view.getEditingRow(key)?.['text'] !== text && row['text'] !== text) await view.editRowById(key, {text})
    }
    if (view.hasUnconfirmedSave) {
      const verified = await view.verifySourceWriteAttempt()
      if (verified.state !== 'confirmed') throw new Error('RUNTIME_DATA_SET_PLAN_WRITE: 原提交仍未确认，须重新打开设计会话')
      view.acknowledgeSourceWriteAttempt()
    }
    if (!view.dirtyTracking.hasPendingChanges() && !view.hasEditingChanges()) return
    const saved = await dataSet.saveChanges({views: [{tableName: RUNTIME_DATA_SET_PLAN_FILE_TABLE, viewId: view.viewId}]})
    input.assertCurrent()
    if (!saved.success) throw saved.error ?? new Error(saved.message ?? 'Runtime Dataset Plan 保存失败')
    const readback = await view.requestRefresh()
    if (!readback.success || view.currentRow?.['text'] !== text) {
      throw new Error('RUNTIME_DATA_SET_PLAN_WRITE: 保存回读与提交文本不一致')
    }
  } catch (error) {
    throw new Error(`RUNTIME_DATA_SET_PLAN_WRITE: ${error instanceof Error ? error.message : String(error)}`, {cause: error})
  }
}
