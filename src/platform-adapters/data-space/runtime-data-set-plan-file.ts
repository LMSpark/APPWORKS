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
const writeViewId = (scenarioId: string): string => `dataset-${scenarioId}`

export type PublishRuntimeDataSetPlanInput = Readonly<{
  scenarioId: string
  metadataDataSet: DataSet
  scenarioConfig: Readonly<Record<string, unknown>>
  assertCurrent: () => void
  /** 仅阻止失效来源的新写入，原文件回读和已派发回执仍由执行域校验。 */
  assertSourceCurrent: () => void
}>
type RuntimeDataSetPlanFileInput=Readonly<{
  scenarioId:string
  dataSet:DataSet
  assertCurrent:()=>void
}>

function rows(view: DataView | undefined, label: string): ReadonlyArray<Readonly<Record<string, unknown>>> {
  if (view?.requestState !== RequestState.Loaded || view.rows.length !== view.total) {
    throw new Error(`RUNTIME_DATA_SET_PLAN_METADATA: ${label} 未由正式查询完整读取`)
  }
  return view.rows
}

function transport(input: RuntimeDataSetPlanFileInput, assertSourceCurrent?: () => void): FileResourceTransport {
  const fileName = `${input.scenarioId}.dataset.json`
  const locator = {appType: 'designfile', customPath: CUSTOM_PATH, fileName} as const
  const assertWriteCurrent = () => {
    input.assertCurrent()
    assertSourceCurrent?.()
  }
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
      assertWriteCurrent()
      await lowcodeDesignFileUpload.uploadWorkingText({...locator, text, assertReady: assertWriteCurrent})
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

type PlanFileViewOptions = Readonly<{readOnly?: boolean; viewId?: string; assertSourceCurrent?: () => void}>
function getPlanFileView(input:RuntimeDataSetPlanFileInput,options:PlanFileViewOptions={}):DataView{
  const dataSet=ensurePlanFileTable(input.dataSet),fileName=`${input.scenarioId}.dataset.json`
  return getOrCreateFileResourceView({
    dataSet,
    tableName:RUNTIME_DATA_SET_PLAN_FILE_TABLE,
    viewId:options.viewId??writeViewId(input.scenarioId),
    resourceId:RESOURCE_ID,
    contentField:'text',
    columns:dataSet.getTable(RUNTIME_DATA_SET_PLAN_FILE_TABLE)?.columns??[],
    queryContext:{scenarioId:input.scenarioId,fileName},
    target:current=>{
      const scenarioId=current.queryContext['scenarioId'],currentFileName=current.queryContext['fileName']
      if(scenarioId!==input.scenarioId||currentFileName!==fileName)throw new Error('RUNTIME_DATA_SET_PLAN_SCOPE: Plan 文件目标已变化')
      return {key:JSON.stringify([scenarioId,fileName]),fields:{scenarioId,fileName}}
    },
    transport:transport(input,options.assertSourceCurrent),
    ...(options.readOnly?{canWrite:()=>false,canCreate:()=>false,canDelete:()=>false}:{}),
    assertCurrent:input.assertCurrent,
  })
}

/** 只通过同一 FileResource DataView 读取独立 Plan；缺失由视图 null 状态表示，不自行拼请求。 */
export async function readRuntimeDataSetPlan(input:RuntimeDataSetPlanFileInput):Promise<string|null>{
  input.assertCurrent()
  const view=getPlanFileView(input,{readOnly:true,viewId:`dataset-read-${input.scenarioId}-${crypto.randomUUID()}`})
  try{
    if(view.hasUnconfirmedSave)throw new Error('RUNTIME_DATA_SET_PLAN_READ: 原 Plan 提交仍待核验')
    const result=await view.requestRefresh()
    input.assertCurrent()
    if(!result.success)throw result.error??new Error(result.message??'Runtime Dataset Plan 读取失败')
    const row=view.currentRow
    if(!row)return null
    if(row['scenarioId']!==input.scenarioId||row['fileName']!==`${input.scenarioId}.dataset.json`||typeof row['text']!=='string'){
      throw new Error('RUNTIME_DATA_SET_PLAN_READ: Plan 文件 DataView 行身份或正文无效')
    }
    view.captureReadRow(row,['scenarioId','fileName','text'])()
    return row['text']
  }finally{
    const table=view.dataTable
    if(!view.destroyed&&table?.getView(view.viewId)===view)table.destroyView(view.viewId)
  }
}

/** 从原 Plan 文件视图投影其在本 DataSet 中的未决提交。 */
export function runtimeDataSetPlanUnconfirmed(input: Pick<RuntimeDataSetPlanFileInput, 'scenarioId' | 'dataSet'>): boolean {
  return input.dataSet.getView(RUNTIME_DATA_SET_PLAN_FILE_TABLE, writeViewId(input.scenarioId))?.hasUnconfirmedSave === true
}

/** 仅经原 DataSet 和文件视图核验已有提交。运行 Plan 的后续版本需要另一笔明确意图。 */
export async function verifyRuntimeDataSetPlan(input: RuntimeDataSetPlanFileInput): Promise<void> {
  input.assertCurrent()
  const view = input.dataSet.getView(RUNTIME_DATA_SET_PLAN_FILE_TABLE, writeViewId(input.scenarioId))
  if (!view?.hasUnconfirmedSave) throw new Error('RUNTIME_DATA_SET_PLAN_WRITE: 原 Plan 提交捕获已不可用')
  const result = await input.dataSet.resolveUnconfirmedSaves([view])
  input.assertCurrent()
  if (result.state !== 'confirmed' || result.views.length !== 1) {
    throw result.views[0]?.error ?? new Error('RUNTIME_DATA_SET_PLAN_WRITE: 原 Plan 提交尚未确认')
  }
}

/** 由一份 FileResource DataView 承接 Plan 替换；保存器内置写后精确文本回读。 */
export async function publishRuntimeDataSetPlan(input: PublishRuntimeDataSetPlanInput): Promise<void> {
  input.assertCurrent()
  input.assertSourceCurrent()
  let text = planText(input)
  const dataSet=input.metadataDataSet
  const view = getPlanFileView({scenarioId: input.scenarioId, dataSet, assertCurrent: input.assertCurrent},
    {assertSourceCurrent: input.assertSourceCurrent})
  try {
    if (view.hasUnconfirmedSave) throw new Error('RUNTIME_DATA_SET_PLAN_WRITE: 原提交仍未确认，须先核验')
    const queried = await view.requestRefresh()
    input.assertCurrent()
    if (!queried.success || view.refreshPending) throw queried.error ?? new Error('Runtime Dataset Plan 基线读取未完成')
    input.assertSourceCurrent()
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
    if (!view.dirtyTracking.hasPendingChanges() && !view.hasEditingChanges()) {
      if (view.currentRow?.['text'] !== text) throw new Error('RUNTIME_DATA_SET_PLAN_WRITE: 原文件视图未接纳待发布正文')
      return
    }
    const saved = await dataSet.saveChanges({views: [{tableName: RUNTIME_DATA_SET_PLAN_FILE_TABLE, viewId: view.viewId}]})
    input.assertCurrent()
    const receipt = saved.data?.viewResults[0]
    if (!saved.success || saved.data?.viewCount !== 1 || receipt?.tableName !== RUNTIME_DATA_SET_PLAN_FILE_TABLE
      || receipt.viewId !== view.viewId || receipt.createdCount + receipt.savedCount !== 1
      || view.currentRow?.['text'] !== text) {
      throw saved.error ?? new Error('RUNTIME_DATA_SET_PLAN_WRITE: 文件回执未确认原提交正文')
    }
  } catch (error) {
    input.assertCurrent()
    const records = dataSet.saveJournal.views
    if (dataSet.getView(RUNTIME_DATA_SET_PLAN_FILE_TABLE, view.viewId) === view && records.length === 1
      && records[0]?.tableName === view.tableName && records[0].viewId === view.viewId && records[0].state === 'not-applied') {
      dataSet.discardSaveJournalNotApplied()
    }
    throw new Error(`RUNTIME_DATA_SET_PLAN_WRITE: ${error instanceof Error ? error.message : String(error)}`, {cause: error})
  }
}
