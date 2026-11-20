/**
 * @module app:lowcode/resources/repository/agent-workflow/agent-workflow-file-resource
 * 职责：Agent 工作流 design.json/definition.json 的文件资源表、目录解析和共享文件提交（基线、上传、字节回读、待核验）。
 * 边界：只读写当前应用 workflow-designs 目录下的文件，不解析设计文档语义。
 * AI用途：排查 Agent 工作流文件查询、保存冲突或结果未知时，用本模块定位文件提交链。
 */
import {RequestState, type DataRow, type DataView} from '@spark-appworks/spark-data'
import type {LowcodeDesignFileUpload, LowcodeFileDirectory, LowcodeFileEntry, LowcodeFileLocator} from '@spark-appworks/spark-lowcode-api'

export const AGENT_WORKFLOW_FILE_TABLE = 'AgentWorkflowFiles'
export const AGENT_WORKFLOW_FILE_RESOURCE_ID = 'agent-workflow-files'

export const AGENT_WORKFLOW_FILE_COLUMNS = Object.freeze([
  {name: 'workflowId', type: 'string', isPrimaryKey: true},
  {name: 'fileName', type: 'string'},
  {name: 'timestamp', type: 'string'},
  {name: 'content', type: 'string'},
])

export const AGENT_WORKFLOW_FILE_VIEWS = Object.freeze({
  default: Object.freeze({}),
  directory: Object.freeze({queryConfig: Object.freeze({allPages: true, maxRows: 50000})}),
  design: Object.freeze({autoLoad: false, queryContext: Object.freeze({workflowId: ''})}),
  definition: Object.freeze({autoLoad: false, queryContext: Object.freeze({workflowId: ''})}),
})

const WORKFLOW_ID_PARAMETER = Object.freeze([{name: 'workflowId', type: 'string', label: '工作流 ID', required: true}])
export const AGENT_WORKFLOW_FILE_QUERY_PARAMETERS = Object.freeze({
  default: Object.freeze([]),
  directory: Object.freeze([]),
  design: WORKFLOW_ID_PARAMETER,
  definition: WORKFLOW_ID_PARAMETER,
})

export const AGENT_WORKFLOW_DATA_SPACE_NAME = 'Agent工作流文件资源'

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

/** 每个工作流目录下的两份文件：设计稿和发布定义。 */
export type AgentWorkflowFileName = 'design.json' | 'definition.json'

const AGENT_WORKFLOW_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/

/**
 * 工作流目录身份的唯一规则；读、写、创建、首发都在派发前使用。
 * 正式文件服务 normalizePath 遇到含点目录会忽略 fileName，上传会改写 unknown 分段，因此这些身份无法精确定位，一律拒绝。
 */
export function agentWorkflowId(value: unknown): string {
  if (typeof value !== 'string' || !AGENT_WORKFLOW_ID.test(value) || value === 'unknown') {
    throw new Error('AGENT_WORKFLOW_ID_UNSUPPORTED: 工作流 ID 须为字母或数字开头、仅含字母/数字/_/- 的 1–128 位标识；含点等目录无法由当前文件服务精确定位')
  }
  return value
}

/** 当前应用的工作流根目录；应用身份同样须能被文件服务精确定位。 */
export function agentWorkflowDirectory(applicationId: unknown): string {
  if (typeof applicationId !== 'string' || applicationId === '' || applicationId.trim() !== applicationId
    || /[.\\/%?#\u0000-\u001f\u007f]/.test(applicationId) || applicationId === 'unknown') {
    throw new Error('AGENT_WORKFLOW_FILE_SCOPE: 应用身份无效')
  }
  return `${applicationId}/workflow-designs`
}

/** 工作流文件的目录、文本和字节读取接口。 */
type WorkflowFileApi = Readonly<{
  /** 列出应用 workflow-designs 目录下的工作流。 */
  listFiles(input: LowcodeFileDirectory): Promise<readonly LowcodeFileEntry[]>
  /** 读取文件文本，作为查询基线。 */
  readTextFile(input: LowcodeFileLocator): Promise<string>
  /** 读取文件字节，用于上传后精确回读。 */
  readFileBytes(input: LowcodeFileLocator): Promise<Uint8Array>
}>
/** 正式文件上传适配器中写工作副本的能力。 */
type WorkflowFileUpload = Pick<LowcodeDesignFileUpload, 'uploadWorkingText'>
/** 工作流文件执行器的应用身份、读写接口和会话校验。 */
export type AgentWorkflowFileScope = Readonly<{
  /** 当前应用 ID，决定 workflow-designs 目录。 */
  applicationId: string
  /** 文件读取接口。 */
  api: WorkflowFileApi
  /** 文件上传接口；缺省时保存显式失败。 */
  fileUpload?: WorkflowFileUpload
  /** 应用或会话已切换时抛错。 */
  assertCurrent: () => void
}>
/** 绑定到 DataView 的查询/保存执行器。 */
type FileQueryExecutor = Parameters<DataView['bindQueryExecutor']>[0]
/** DataSet 派发给执行器的一批保存命令。 */
type FileSaveCommand = Parameters<NonNullable<FileQueryExecutor['save']>>[0]
/** 执行器对一张表返回的保存回执。 */
type FileSaveReceipt = Awaited<ReturnType<NonNullable<FileQueryExecutor['save']>>>[number]
/** 执行器返回的查询结果及其权限、动作判定。 */
type FileQueryResult = Awaited<ReturnType<FileQueryExecutor['executeQuery']>>

/** 一次文件写入：编辑起点的查询基线和要上传的完整文本。 */
export type AgentWorkflowFileCommitCommand = Readonly<{
  /** 待核验状态挂在这个对象上；同一批保存共用一个。 */
  context: object
  /** 工作流目录名。 */
  workflowId: string
  /** 目标文件。 */
  fileName: AgentWorkflowFileName
  /** 编辑开始时读到的文件全文，用于冲突检查。 */
  baseline: string
  /** 要写入的完整文本。 */
  content: string
}>

type PendingFileCommit = Readonly<{workflowId: string; fileName: AgentWorkflowFileName; baseline: string; submitted: string}>

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

export function agentWorkflowSaveIdentityError(message: string): Error {return new Error(`AGENT_WORKFLOW_FILE_SAVE_IDENTITY: ${message}`)}

/**
 * Shared file commit for every Agent workflow file executor. A commit whose result is unknown stays pending
 * on its query context; resubmitting the same content only verifies, never uploads twice.
 */
export class AgentWorkflowFileCommit {
  readonly #directory: string
  readonly #api: WorkflowFileApi
  readonly #fileUpload: WorkflowFileUpload
  readonly #assertCurrent: () => void
  readonly #pending = new WeakMap<object, PendingFileCommit>()

  /** 校验应用身份并固定本应用的 workflow-designs 目录。 */
  constructor(input: AgentWorkflowFileScope) {
    this.#directory = agentWorkflowDirectory(input.applicationId)
    this.#api = input.api
    this.#fileUpload = input.fileUpload ?? {uploadWorkingText: () => Promise.reject(new Error('AGENT_WORKFLOW_FILE_SAVE_OWNER: 未注入正式文件上传适配器'))}
    this.#assertCurrent = input.assertCurrent
  }

  /** 列出工作流目录，每个工作流一行。 */
  async readDirectory(): Promise<readonly DataRow[]> {
    let entries: readonly LowcodeFileEntry[]
    try {
      entries = await this.#api.listFiles({appType: 'designfile', folderPath: this.#directory})
    } catch (error) {
      this.#assertCurrent()
      throw error
    }
    this.#assertCurrent()
    return entries.map(entry => ({workflowId: entry.name, fileName: 'design.json',
      timestamp: entry.lastModified === null ? '' : String(entry.lastModified)}))
  }

  /** 读取一份工作流文件全文；工作流身份不可精确定位时在派发前拒绝。 */
  async readText(workflowId: unknown, fileName: AgentWorkflowFileName): Promise<string> {
    const content = await this.#api.readTextFile(this.locator(workflowId, fileName))
    this.#assertCurrent()
    return content
  }

  /** 该保存上下文是否有结果未知、待核验的写入。 */
  hasPending(context: object): boolean {return this.#pending.has(context)}

  /** 核对基线后上传并按字节回读；失败保留待核验，同内容重提只核验不重传。 */
  async commit(command: AgentWorkflowFileCommitCommand): Promise<void> {
    this.#assertCurrent()
    const pending = this.#pending.get(command.context)
    if (pending) {
      if (pending.workflowId !== command.workflowId || pending.fileName !== command.fileName || pending.submitted !== command.content) {
        throw agentWorkflowSaveIdentityError('待核验文件命令身份或内容已变化')
      }
      return this.verifyPending(command.context, pending)
    }
    const locator = this.locator(command.workflowId, command.fileName)
    const baseline = await this.#api.readTextFile(locator)
    this.#assertCurrent()
    if (baseline !== command.baseline) throw new Error('AGENT_WORKFLOW_FILE_CONFLICT: 远端内容已不同于 DataView 查询基线')
    const attempted: PendingFileCommit = {workflowId: command.workflowId, fileName: command.fileName, baseline, submitted: command.content}
    try {
      await this.#fileUpload.uploadWorkingText({customPath: locator.customPath, fileName: locator.fileName, text: command.content})
      this.#assertCurrent()
      const readback = await this.#api.readFileBytes(locator)
      this.#assertCurrent()
      if (!equalBytes(readback, new TextEncoder().encode(command.content))) {
        throw new Error('AGENT_WORKFLOW_FILE_READBACK: 上传后字节回读不一致')
      }
    } catch (error) {
      this.#pending.set(command.context, attempted)
      throw error
    }
  }

  /** A confirmed receipt context inherits nothing pending; callers move their own query targets onto it. */
  private async verifyPending(context: object, pending: PendingFileCommit): Promise<void> {
    this.#assertCurrent()
    const bytes = await this.#api.readFileBytes(this.locator(pending.workflowId, pending.fileName))
    this.#assertCurrent()
    if (equalBytes(bytes, new TextEncoder().encode(pending.submitted))) {
      this.#pending.delete(context)
      return
    }
    if (equalBytes(bytes, new TextEncoder().encode(pending.baseline))) {
      this.#pending.delete(context)
      throw new Error('AGENT_WORKFLOW_FILE_NOT_APPLIED: 原上传未应用，保留 DataView 草稿')
    }
    throw new Error('AGENT_WORKFLOW_FILE_CONFLICT: 原上传与基线均不匹配，待核验状态保留')
  }

  private locator(workflowId: unknown, fileName: AgentWorkflowFileName): LowcodeFileLocator {
    return {appType: 'designfile', customPath: `${this.#directory}/${agentWorkflowId(workflowId)}`, fileName}
  }
}

type WorkflowFileTarget = Readonly<{view: DataView; workflowId: string; fileName: AgentWorkflowFileName}>

/** Workflow design files are edited through their selected DataView row. */
export class AgentWorkflowFileResource {
  readonly #files: AgentWorkflowFileCommit
  readonly #assertCurrent: () => void
  readonly #queryTargets = new WeakMap<object, WorkflowFileTarget>()

  /** 使用共享文件提交链创建文件行执行器。 */
  constructor(input: AgentWorkflowFileScope) {
    this.#files = new AgentWorkflowFileCommit(input)
    this.#assertCurrent = input.assertCurrent
  }

  /** 按视图读取目录或 design/definition 文件行。 */
  async executeQuery(view: DataView): Promise<FileQueryResult> {
    this.#assertCurrent()
    let rows: readonly DataRow[]
    switch (view.viewId) {
      case 'directory':
        rows = await this.#files.readDirectory()
        break
      case 'design':
      case 'definition': {
        const fileName = view.viewId === 'design' ? 'design.json' as const : 'definition.json' as const
        const workflowId = view.queryContext['workflowId']
        const content = await this.#files.readText(workflowId, fileName)
        rows = [{workflowId, fileName, timestamp: '', content}]
        break
      }
      default:
        throw new Error(`AGENT_WORKFLOW_FILE_VIEW: 不支持的视图 ${view.viewId}`)
    }
    this.#assertCurrent()
    const target = view.viewId === 'design' || view.viewId === 'definition'
      ? {view, workflowId: String(view.queryContext['workflowId'] ?? ''), fileName: view.viewId === 'design' ? 'design.json' as const : 'definition.json' as const}
      : undefined
    const result = fileQueryResult(rows, {assertCurrent: this.#assertCurrent, writable: target !== undefined})
    if (target !== undefined) this.#queryTargets.set(result, target)
    return result
  }

  /** 把一条文件行的 content 修改写回对应文件。 */
  async save(command: FileSaveCommand): Promise<FileSaveReceipt[]> {
    this.#assertCurrent()
    if (command.changes.length !== 1) throw agentWorkflowSaveIdentityError('每次只能提交一个文件行')
    const change = command.changes[0]
    if (!change) throw agentWorkflowSaveIdentityError('缺少文件行变更')
    const target = this.#queryTargets.get(change.context)
    const original = change.context.rows.length === 1 ? change.context.rows[0] : undefined
    const submitted = change.changes.changed?.length === 1 ? change.changes.changed[0] : undefined
    if (!target || !original || !submitted || change.changes.added?.length || change.changes.deleted?.length
      || change.changes.changed?.length !== 1) throw agentWorkflowSaveIdentityError('必须匹配一条已读取文件行的内容更新')
    this.assertTarget({scenarioId: change.identity.scenarioId, metaName: change.identity.metaName, target, original, submitted})
    await this.#files.commit({context: change.context, workflowId: target.workflowId, fileName: target.fileName,
      baseline: String(original['content']), content: String(submitted['content'])})
    const row = {...submitted}
    const nextContext = fileQueryResult([row], {assertCurrent: this.#assertCurrent, writable: true})
    this.#queryTargets.set(nextContext, target)
    return [{metaName: target.view.tableName, added: [], changed: [row], deleted: [], changedFields: [['content']], context: nextContext}]
  }

  /** 该查询结果是否有结果未知的文件写入。 */
  hasUnconfirmedSave(context: FileQueryResult): boolean {return this.#files.hasPending(context)}

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
      || typeof submitted['content'] !== 'string') throw agentWorkflowSaveIdentityError('应用、空间、视图、工作流或文件名与原查询身份不匹配')
    const fields = new Set([...Object.keys(original), ...Object.keys(submitted)])
    for (const field of fields) {
      if (field !== 'content' && !Object.is(original[field], submitted[field])) {
        throw agentWorkflowSaveIdentityError(`只允许修改 content，发现字段 ${field} 改变`)
      }
    }
  }
}

function fileQueryResult(rows: readonly DataRow[], options: Readonly<{assertCurrent: () => void; writable?: boolean}>) {
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
    total: rows.length,
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
