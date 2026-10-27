import {RequestState, type DataRow, type DataView} from '@spark-appworks/spark-data'
import type {LowcodeFileDirectory, LowcodeFileEntry, LowcodeFileLocator} from '@spark-appworks/spark-lowcode-api'

export const AGENT_WORKFLOW_FILE_TABLE = 'AgentWorkflowFiles'
export const AGENT_WORKFLOW_FILE_RESOURCE_ID = 'agent-workflow-files'

export const AGENT_WORKFLOW_FILE_COLUMNS = Object.freeze([
  {name: 'workflowId', type: 'string', isPrimaryKey: true},
  {name: 'fileName', type: 'string'},
  {name: 'timestamp', type: 'string'},
  {name: 'content', type: 'string'},
])

export const AGENT_WORKFLOW_DATA_SPACE_NAME = 'Agent工作流文件资源'

export type LowcodeFileResourceDefinition = Readonly<{
  tableName: string
  resourceId: string
  label: string
  columns: typeof AGENT_WORKFLOW_FILE_COLUMNS
  views: Readonly<Record<string, Readonly<Record<string, unknown>>>>
  createExecutor(input: Readonly<{applicationId: string; api: WorkflowFileApi; assertCurrent: () => void}>): AgentWorkflowFileResource
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
    createExecutor: (input: Readonly<{applicationId: string; api: WorkflowFileApi; assertCurrent: () => void}>) => new AgentWorkflowFileResource(input),
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
}>

type WorkflowFileQuery = Readonly<{rows: readonly DataRow[]; total: number}>

/** Read-only file resource. A grant is attached only to fields returned by this query. */
export class AgentWorkflowFileResource {
  readonly #directory: string
  readonly #api: WorkflowFileApi
  readonly #assertCurrent: () => void

  constructor(input: Readonly<{applicationId: string; api: WorkflowFileApi; assertCurrent: () => void}>) {
    const applicationId = input.applicationId.trim()
    if (!applicationId || applicationId !== input.applicationId || /[\\/%\u0000-\u001f\u007f]/.test(applicationId)) {
      throw new Error('AGENT_WORKFLOW_FILE_SCOPE: 应用身份无效')
    }
    this.#directory = `${applicationId}/workflow-designs`
    this.#api = input.api
    this.#assertCurrent = input.assertCurrent
  }

  async executeQuery(view: DataView): Promise<ReturnType<typeof queryResult>> {
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
    return queryResult(query.rows, query.total, this.#assertCurrent)
  }

  private async readDirectory(): Promise<WorkflowFileQuery> {
    const entries = await this.#api.listFiles({appType: 'designfile', folderPath: this.#directory})
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

function queryResult(rows: readonly DataRow[], total: number, assertCurrent: () => void) {
  const keys = new Set(rows.map(row => String(row['workflowId'])))
  const fields = new WeakMap<DataRow, ReadonlySet<string>>(rows.map(row => [row,
    new Set(Object.keys(row).filter(field => field !== '_pk'))]))
  const access = (rowKey: unknown, field: string) => {
    assertCurrent()
    const visible = keys.has(String(rowKey)) && rows.some(row => String(row['workflowId']) === String(rowKey) && fields.get(row)?.has(field))
    return {read: visible ? 'visible' as const : 'invisible' as const, write: 'denied' as const,
      component: visible ? 'readonly' as const : 'hidden' as const, required: false, writeMode: 'readonly' as const}
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
    editActionState: () => {assertCurrent(); return 'disabled' as const},
    deleteActionState: () => {assertCurrent(); return 'disabled' as const},
    createChildActionState: () => {assertCurrent(); return 'disabled' as const},
    viewActionState: (rowKey: unknown) => {
      assertCurrent()
      return keys.has(String(rowKey)) ? 'enabled' as const : 'disabled' as const
    },
  }
}
