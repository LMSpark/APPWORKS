import {RequestState, type DataColumn, type DataRow, type DataView} from '@spark-appworks/spark-data'
import type {LowcodeDesignApi, LowcodeDesignFileUpload, LowcodeFileDirectory, LowcodeFileEntry, LowcodeFileLocator} from '@spark-appworks/spark-lowcode-api'
import {PROJECT_TOOL_VERSION_COLUMNS, PROJECT_TOOL_VERSION_QUERY_PARAMETERS, PROJECT_TOOL_VERSION_RESOURCE_ID, PROJECT_TOOL_VERSION_TABLE,
  PROJECT_TOOL_VERSION_VIEWS, ProjectToolVersionResource} from './project-tool-version-resource'

export const AGENT_WORKFLOW_FILE_TABLE = 'AgentWorkflowFiles'
export const AGENT_WORKFLOW_FILE_RESOURCE_ID = 'agent-workflow-files'

export const AGENT_WORKFLOW_FILE_COLUMNS = Object.freeze([
  {name: 'workflowId', type: 'string', isPrimaryKey: true},
  {name: 'fileName', type: 'string'},
  {name: 'timestamp', type: 'string'},
  {name: 'content', type: 'string'},
])

export const AGENT_WORKFLOW_DATA_SPACE_NAME = 'Agent工作流文件资源'
type LowcodeFileResourceApi = Pick<LowcodeDesignApi, 'listFiles' | 'readTextFile' | 'readFileBytes' | 'listFileVersions'>

export type LowcodeFileResourceDefinition = Readonly<{
  tableName: string
  resourceId: string
  label: string
  columns: readonly DataColumn[]
  views: Readonly<Record<string, Readonly<Record<string, unknown>>>>
  queryParameters: Readonly<Record<string, ReadonlyArray<Readonly<{name: string; type: string; label?: string; required?: boolean}>>>>
  createExecutor(input: Readonly<{applicationId: string; api: LowcodeFileResourceApi; fileUpload?: WorkflowFileUpload; assertCurrent: () => void}>): Parameters<DataView['bindQueryExecutor']>[0]
}>

/** Only file resources with a concrete query executor are offered by the data-space designer. */
export const LOWCODE_FILE_RESOURCE_REGISTRY: readonly LowcodeFileResourceDefinition[] = Object.freeze([
  Object.freeze({
    tableName: AGENT_WORKFLOW_FILE_TABLE,
    resourceId: AGENT_WORKFLOW_FILE_RESOURCE_ID,
    label: AGENT_WORKFLOW_DATA_SPACE_NAME,
    columns: AGENT_WORKFLOW_FILE_COLUMNS,
    views: Object.freeze({
      default: Object.freeze({}),
      directory: Object.freeze({queryConfig: Object.freeze({allPages: true, maxRows: 50000})}),
      design: Object.freeze({autoLoad: false, queryContext: Object.freeze({workflowId: ''})}),
      definition: Object.freeze({autoLoad: false, queryContext: Object.freeze({workflowId: ''})}),
    }),
    queryParameters: Object.freeze({
      default: Object.freeze([]),
      directory: Object.freeze([]),
      design: Object.freeze([{name: 'workflowId', type: 'string', label: '工作流 ID', required: true}]),
      definition: Object.freeze([{name: 'workflowId', type: 'string', label: '工作流 ID', required: true}]),
    }),
    createExecutor: (input: Readonly<{applicationId: string; api: LowcodeFileResourceApi; fileUpload?: WorkflowFileUpload; assertCurrent: () => void}>) =>
      new AgentWorkflowFileResource({...input, fileUpload: input.fileUpload ?? {uploadWorkingText: () => Promise.reject(new Error('AGENT_WORKFLOW_FILE_SAVE_OWNER: 未注入正式文件上传适配器'))}}),
  }),
  Object.freeze({
    tableName: PROJECT_TOOL_VERSION_TABLE,
    resourceId: PROJECT_TOOL_VERSION_RESOURCE_ID,
    label: '工具文件版本目录',
    columns: PROJECT_TOOL_VERSION_COLUMNS,
    views: PROJECT_TOOL_VERSION_VIEWS,
    queryParameters: PROJECT_TOOL_VERSION_QUERY_PARAMETERS,
    createExecutor: (input: Readonly<{applicationId: string; api: LowcodeFileResourceApi; assertCurrent: () => void}>) =>
      new ProjectToolVersionResource({applicationId: input.applicationId, api: input.api, assertCurrent: input.assertCurrent}),
  }),
])

/** Resolve the file resource target only from a complete, currently authorized catalog query. */
export function resolveAgentWorkflowDataSpaceId(view: DataView): string {
  if (view.requestState !== RequestState.Loaded || view.loadingError || view.queryConfig.allPages !== true
    || view.total !== view.rows.length || view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges()) {
    throw new Error('AGENT_WORKFLOW_DATA_SPACE_CATALOG: 正式目录查询未完整确认')
  }
  const ids = new Set<string>()
  const matches: string[] = []
  for (const row of view.rows) {
    const key = view.getPkKey(row)
    if (view.fieldAccess(row, 'rowid').read !== 'visible' || view.fieldAccess(row, 'Name').read !== 'visible'
      || typeof row['rowid'] !== 'string' || !row['rowid'].trim() || key !== row['rowid']
      || typeof row['Name'] !== 'string') {
      throw new Error('AGENT_WORKFLOW_DATA_SPACE_CATALOG: 正式目录身份字段不可读或无效')
    }
    const id = row['rowid'].trim()
    if (ids.has(id)) throw new Error('AGENT_WORKFLOW_DATA_SPACE_CATALOG: rowid 不唯一')
    ids.add(id)
    if (row['Name'] === AGENT_WORKFLOW_DATA_SPACE_NAME) matches.push(id)
  }
  if (matches.length !== 1) throw new Error(`AGENT_WORKFLOW_DATA_SPACE_CATALOG: 名称匹配必须唯一，实际 ${matches.length} 条`)
  const match = matches[0]
  if (!match) throw new Error('AGENT_WORKFLOW_DATA_SPACE_CATALOG: 唯一匹配记录缺少正式身份')
  return match
}

type WorkflowFileApi = Readonly<{
  listFiles(input: LowcodeFileDirectory): Promise<readonly LowcodeFileEntry[]>
  readTextFile(input: LowcodeFileLocator): Promise<string>
  readFileBytes(input: LowcodeFileLocator): Promise<Uint8Array>
}>
type WorkflowFileUpload = Pick<LowcodeDesignFileUpload, 'uploadWorkingText'>
type FileQueryExecutor = Parameters<DataView['bindQueryExecutor']>[0]
type FileSaveCommand = Parameters<NonNullable<FileQueryExecutor['save']>>[0]
type FileSaveReceipt = Awaited<ReturnType<NonNullable<FileQueryExecutor['save']>>>[number]
type FileQueryResult = Awaited<ReturnType<FileQueryExecutor['executeQuery']>>
type WorkflowFileTarget = Readonly<{view: DataView; workflowId: string; fileName: 'design.json' | 'definition.json'}>
type PendingFileSave = Readonly<{target: WorkflowFileTarget; baseline: string; submitted: string}>

function saveIdentityError(message: string): Error {return new Error(`AGENT_WORKFLOW_FILE_SAVE_IDENTITY: ${message}`)}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

type WorkflowFileQuery = Readonly<{rows: readonly DataRow[]; total: number}>

/** Workflow design files are edited through their selected DataView row. */
export class AgentWorkflowFileResource {
  readonly #directory: string
  readonly #api: WorkflowFileApi
  readonly #fileUpload: WorkflowFileUpload
  readonly #assertCurrent: () => void
  readonly #queryTargets = new WeakMap<object, WorkflowFileTarget>()
  readonly #pendingSaves = new WeakMap<object, PendingFileSave>()

  constructor(input: Readonly<{applicationId: string; api: WorkflowFileApi; fileUpload?: WorkflowFileUpload; assertCurrent: () => void}>) {
    const applicationId = input.applicationId.trim()
    if (!applicationId || applicationId !== input.applicationId || /[\\/%\u0000-\u001f\u007f]/.test(applicationId)) {
      throw new Error('AGENT_WORKFLOW_FILE_SCOPE: 应用身份无效')
    }
    this.#directory = `${applicationId}/workflow-designs`
    this.#api = input.api
    this.#fileUpload = input.fileUpload ?? {uploadWorkingText: () => Promise.reject(new Error('AGENT_WORKFLOW_FILE_SAVE_OWNER: 未注入正式文件上传适配器'))}
    this.#assertCurrent = input.assertCurrent
  }

  async executeQuery(view: DataView): Promise<FileQueryResult> {
    this.#assertCurrent()
    let query: WorkflowFileQuery
    switch (view.viewId) {
      case 'directory':
        query = await this.readDirectory()
        break
      case 'design':
      case 'definition':
        query = await this.readDocument(view, view.viewId === 'design' ? 'design.json' : 'definition.json')
        break
      default:
        throw new Error(`AGENT_WORKFLOW_FILE_VIEW: 不支持的视图 ${view.viewId}`)
    }
    this.#assertCurrent()
    const target = view.viewId === 'design' || view.viewId === 'definition'
      ? {view, workflowId: String(view.queryContext['workflowId'] ?? ''), fileName: view.viewId === 'design' ? 'design.json' as const : 'definition.json' as const}
      : undefined
    const result = queryResult(query.rows, query.total, {assertCurrent: this.#assertCurrent, writable: target !== undefined})
    if (target !== undefined) this.#queryTargets.set(result, target)
    return result
  }

  async save(command: FileSaveCommand): Promise<FileSaveReceipt[]> {
    this.#assertCurrent()
    if (command.changes.length !== 1) throw saveIdentityError('每次只能提交一个文件行')
    const change = command.changes[0]
    if (!change) throw saveIdentityError('缺少文件行变更')
    const target = this.#queryTargets.get(change.context)
    const original = change.context.rows.length === 1 ? change.context.rows[0] : undefined
    const submitted = change.changes.changed?.length === 1 ? change.changes.changed[0] : undefined
    if (!target || !original || !submitted || change.changes.added?.length || change.changes.deleted?.length
      || change.changes.changed?.length !== 1) throw saveIdentityError('必须匹配一条已读取文件行的内容更新')
    this.assertTarget({scenarioId: change.identity.scenarioId, metaName: change.identity.metaName, target, original, submitted})
    const pending = this.#pendingSaves.get(change.context)
    if (pending) {
      if (pending.target.workflowId !== target.workflowId || pending.target.fileName !== target.fileName
        || pending.submitted !== submitted['content']) throw saveIdentityError('待核验文件命令身份或内容已变化')
      return [await this.verifyPending(change.context, pending, original)]
    }

    this.#assertCurrent()
    const locator = this.locator(target)
    const baseline = await this.#api.readTextFile(locator)
    this.#assertCurrent()
    if (baseline !== original['content']) throw new Error('AGENT_WORKFLOW_FILE_CONFLICT: 远端内容已不同于 DataView 查询基线')
    const content = String(submitted['content'])
    const attempted: PendingFileSave = {target, baseline, submitted: content}
    let uploadStarted = false
    try {
      uploadStarted = true
      await this.#fileUpload.uploadWorkingText({customPath: locator.customPath, fileName: locator.fileName, text: content})
      this.#assertCurrent()
      const readback = await this.#api.readFileBytes(locator)
      this.#assertCurrent()
      if (!equalBytes(readback, new TextEncoder().encode(content))) {
        this.#pendingSaves.set(change.context, attempted)
        throw new Error('AGENT_WORKFLOW_FILE_READBACK: 上传后字节回读不一致')
      }
    } catch (error) {
      if (uploadStarted) this.#pendingSaves.set(change.context, attempted)
      throw error
    }
    return [this.receipt(target, submitted)]
  }

  hasUnconfirmedSave(context: FileQueryResult): boolean {return this.#pendingSaves.has(context)}

  private assertTarget(input: Readonly<{scenarioId: string; metaName: string; target: WorkflowFileTarget;
    original: Readonly<Record<string, unknown>>; submitted: Readonly<Record<string, unknown>>}>): void {
    const {scenarioId, metaName, target, original, submitted} = input
    this.#assertCurrent()
    if (scenarioId !== target.view.dataSet?.scenarioId || metaName !== AGENT_WORKFLOW_FILE_TABLE
      || target.view.tableName !== AGENT_WORKFLOW_FILE_TABLE
      || target.view.viewId !== (target.fileName === 'design.json' ? 'design' : 'definition')
      || original['workflowId'] !== target.workflowId
      || submitted['workflowId'] !== target.workflowId || original['fileName'] !== target.fileName
      || submitted['fileName'] !== target.fileName || typeof original['content'] !== 'string'
      || typeof submitted['content'] !== 'string') throw saveIdentityError('应用、空间、视图、工作流或文件名与原查询身份不匹配')
    const fields = new Set([...Object.keys(original), ...Object.keys(submitted)])
    for (const field of fields) {
      if (field !== 'content' && !Object.is(original[field], submitted[field])) {
        throw saveIdentityError(`只允许修改 content，发现字段 ${field} 改变`)
      }
    }
  }

  private async verifyPending(context: FileQueryResult, pending: PendingFileSave,
    original: Readonly<Record<string, unknown>>): Promise<FileSaveReceipt> {
    this.#assertCurrent()
    const bytes = await this.#api.readFileBytes(this.locator(pending.target))
    this.#assertCurrent()
    const baselineBytes = new TextEncoder().encode(pending.baseline)
    const submittedBytes = new TextEncoder().encode(pending.submitted)
    if (equalBytes(bytes, submittedBytes)) {
      this.#pendingSaves.delete(context)
      return this.receipt(pending.target, {...original, content: pending.submitted})
    }
    if (equalBytes(bytes, baselineBytes)) {
      this.#pendingSaves.delete(context)
      throw new Error('AGENT_WORKFLOW_FILE_NOT_APPLIED: 原上传未应用，保留 DataView 草稿')
    }
    throw new Error('AGENT_WORKFLOW_FILE_CONFLICT: 原上传与基线均不匹配，待核验状态保留')
  }

  private receipt(target: WorkflowFileTarget, submitted: Readonly<Record<string, unknown>>): FileSaveReceipt {
    const row = {...submitted}
    const nextContext = queryResult([row], 1, {assertCurrent: this.#assertCurrent, writable: true})
    this.#queryTargets.set(nextContext, target)
    return {metaName: target.view.tableName, added: [], changed: [row], deleted: [], changedFields: [['content']], context: nextContext}
  }

  private locator(target: WorkflowFileTarget): LowcodeFileLocator {
    return {appType: 'designfile', customPath: `${this.#directory}/${target.workflowId}`, fileName: target.fileName}
  }

  private async readDirectory(): Promise<WorkflowFileQuery> {
    let entries: readonly LowcodeFileEntry[]
    try {
      entries = await this.#api.listFiles({appType: 'designfile', folderPath: this.#directory})
    } catch (error) {
      this.#assertCurrent()
      throw error
    }
    this.#assertCurrent()
    const rows = entries.map(entry => ({workflowId: entry.name, fileName: 'design.json',
      timestamp: entry.lastModified === null ? '' : String(entry.lastModified)}))
    return {rows, total: rows.length}
  }

  private async readDocument(view: DataView, fileName: 'design.json' | 'definition.json'): Promise<WorkflowFileQuery> {
    const workflowId = view.queryContext['workflowId']
    if (typeof workflowId !== 'string' || !workflowId.trim() || workflowId.trim() !== workflowId
      || /[\\/%\u0000-\u001f\u007f?#]/.test(workflowId)) {
      throw new Error('AGENT_WORKFLOW_FILE_QUERY: 查询必须提供有效工作流身份')
    }
    const content = await this.#api.readTextFile({appType: 'designfile', customPath: `${this.#directory}/${workflowId}`, fileName})
    this.#assertCurrent()
    return {rows: [{workflowId, fileName, timestamp: '', content}], total: 1}
  }
}

function queryResult(rows: readonly DataRow[], total: number, options: Readonly<{assertCurrent: () => void; writable?: boolean}>) {
  const {assertCurrent, writable = false} = options
  const keys = new Set(rows.map(row => String(row['workflowId'])))
  const fields = new WeakMap<DataRow, ReadonlySet<string>>(rows.map(row => [row,
    new Set(Object.keys(row).filter(field => field !== '_pk'))]))
  const access = (rowKey: unknown, field: string) => {
    assertCurrent()
    const visible = keys.has(String(rowKey)) && rows.some(row => String(row['workflowId']) === String(rowKey) && fields.get(row)?.has(field))
    const canWrite = writable && visible && field === 'content'
    return {read: visible ? 'visible' as const : 'invisible' as const, write: canWrite ? 'allowed' as const : 'denied' as const,
      component: canWrite ? 'editable' as const : visible ? 'readonly' as const : 'hidden' as const, required: false,
      writeMode: canWrite ? 'editable' as const : 'readonly' as const}
  }
  return {
    rows,
    total,
    rowKey: (row: DataRow) => row['workflowId'],
    assertIdentity: () => assertCurrent(),
    fieldAccess: access,
    readFieldAccess: (row: DataRow, field: string) => {
      assertCurrent()
      return rows.includes(row) && fields.get(row)?.has(field) ? 'visible' as const : 'invisible' as const
    },
    addActionState: () => {assertCurrent(); return 'disabled' as const},
    editActionState: (rowKey: unknown) => {assertCurrent(); return writable && keys.has(String(rowKey)) ? 'enabled' as const : 'disabled' as const},
    deleteActionState: () => {assertCurrent(); return 'disabled' as const},
    createChildActionState: () => {assertCurrent(); return 'disabled' as const},
    viewActionState: (rowKey: unknown) => {
      assertCurrent()
      return keys.has(String(rowKey)) ? 'enabled' as const : 'disabled' as const
    },
  }
}
