/**
 * @module app:lowcode/resources/repository/agent-workflow/agent-workflow-design-resource
 * 职责：把 design.json 投影成流程、节点、连线、变量、能力五张表供 DataView 查询，并把一批多表变更合成一次文件写入。
 * 边界：文件读写、基线冲突、回读与待核验复用 AgentWorkflowFileCommit；投影规则在 agent-workflow-design-projection。
 * AI用途：设计页节点/连线/变量的查询或保存失败、回执或待核验异常时，用本模块定位投影执行器。
 */
import type {DataColumn, DataRow, DataView} from '@spark-appworks/spark-data'
import {
  AGENT_WORKFLOW_CAPABILITY_TABLE,
  AGENT_WORKFLOW_DESIGN_COLUMNS,
  AGENT_WORKFLOW_DESIGN_TABLE,
  AGENT_WORKFLOW_LINE_TABLE,
  AGENT_WORKFLOW_NODE_TABLE,
  AGENT_WORKFLOW_ROOT_GRAPH,
  AGENT_WORKFLOW_VARIABLE_TABLE,
  applyWorkflowDesignChanges,
  projectWorkflowDesign,
  type AgentWorkflowDesignChanges,
  type AgentWorkflowDesignRows,
  type AgentWorkflowDesignTableName,
} from './agent-workflow-design-projection'
import {AgentWorkflowFileCommit, agentWorkflowSaveIdentityError, type AgentWorkflowFileScope} from './agent-workflow-file-resource'

export const AGENT_WORKFLOW_DESIGN_RESOURCE_ID = 'agent-workflow-design'

/** 一个命名视图的默认配置。 */
type ViewConfig = Readonly<Record<string, unknown>>
/** 视图查询参数声明。 */
type QueryParameter = Readonly<{
  /** 参数名，对应 queryContext 键。 */
  name: string
  /** 参数类型。 */
  type: string
  /** 设计页显示名。 */
  label?: string
  /** 是否必须提供。 */
  required?: boolean
}>
/** 一张设计投影表在文件资源注册表里的正式定义。 */
export type AgentWorkflowDesignTableDefinition = Readonly<{
  /** 投影表名。 */
  tableName: AgentWorkflowDesignTableName
  /** 该表独有的文件资源身份。 */
  resourceId: string
  /** 设计页显示名。 */
  label: string
  /** 投影字段。 */
  columns: readonly DataColumn[]
  /** 命名视图：图表有 graph/child，其它表有 design。 */
  views: Readonly<Record<string, ViewConfig>>
  /** 各视图的查询参数。 */
  queryParameters: Readonly<Record<string, readonly QueryParameter[]>>
}>

const WORKFLOW_ID: QueryParameter = Object.freeze({name: 'workflowId', type: 'string', label: '工作流 ID', required: true})
const GRAPH_PATH: QueryParameter = Object.freeze({name: 'graphPath', type: 'string', label: '图路径', required: true})
const designView = Object.freeze({autoLoad: false, queryContext: Object.freeze({workflowId: ''})})
const graphView = (graphPath: string) => Object.freeze({autoLoad: false, queryContext: Object.freeze({workflowId: '', graphPath})})

/** Each table keeps its own resource identity because one save batch may not map two tables to one resource; the executor is still shared. */
function tableDefinition(tableName: AgentWorkflowDesignTableName, suffix: string, label: string): AgentWorkflowDesignTableDefinition {
  const graphScoped = tableName === AGENT_WORKFLOW_NODE_TABLE || tableName === AGENT_WORKFLOW_LINE_TABLE
  return Object.freeze({
    tableName,
    resourceId: `${AGENT_WORKFLOW_DESIGN_RESOURCE_ID}-${suffix}`,
    label,
    columns: AGENT_WORKFLOW_DESIGN_COLUMNS[tableName],
    views: graphScoped
      ? Object.freeze({default: graphView(''), graph: graphView(AGENT_WORKFLOW_ROOT_GRAPH), child: graphView('')})
      : Object.freeze({default: designView, design: designView}),
    queryParameters: graphScoped
      ? Object.freeze({default: [WORKFLOW_ID, GRAPH_PATH], graph: [WORKFLOW_ID, GRAPH_PATH], child: [WORKFLOW_ID, GRAPH_PATH]})
      : Object.freeze({default: [WORKFLOW_ID], design: [WORKFLOW_ID]}),
  })
}

export const AGENT_WORKFLOW_DESIGN_TABLES: readonly AgentWorkflowDesignTableDefinition[] = Object.freeze([
  tableDefinition(AGENT_WORKFLOW_DESIGN_TABLE, 'workflow', 'Agent工作流设计-流程'),
  tableDefinition(AGENT_WORKFLOW_NODE_TABLE, 'nodes', 'Agent工作流设计-节点'),
  tableDefinition(AGENT_WORKFLOW_LINE_TABLE, 'lines', 'Agent工作流设计-连线'),
  tableDefinition(AGENT_WORKFLOW_VARIABLE_TABLE, 'variables', 'Agent工作流设计-变量'),
  tableDefinition(AGENT_WORKFLOW_CAPABILITY_TABLE, 'capabilities', 'Agent工作流设计-能力'),
])

const PRIMARY_KEY: Readonly<Record<AgentWorkflowDesignTableName, string>> = Object.freeze({
  [AGENT_WORKFLOW_DESIGN_TABLE]: 'workflowId',
  [AGENT_WORKFLOW_NODE_TABLE]: 'nodeKey',
  [AGENT_WORKFLOW_LINE_TABLE]: 'lineKey',
  [AGENT_WORKFLOW_VARIABLE_TABLE]: 'name',
  [AGENT_WORKFLOW_CAPABILITY_TABLE]: 'id',
})

/** Identity columns that only the projection derives; editing them would silently re-key a row. */
const READ_ONLY_FIELDS: Readonly<Record<AgentWorkflowDesignTableName, readonly string[]>> = Object.freeze({
  [AGENT_WORKFLOW_DESIGN_TABLE]: ['workflowId'],
  [AGENT_WORKFLOW_NODE_TABLE]: ['nodeKey', 'graphPath', 'id'],
  [AGENT_WORKFLOW_LINE_TABLE]: ['lineKey', 'graphPath', 'id'],
  [AGENT_WORKFLOW_VARIABLE_TABLE]: ['name'],
  [AGENT_WORKFLOW_CAPABILITY_TABLE]: ['id'],
})

const TABLE_NAMES = new Set<string>(AGENT_WORKFLOW_DESIGN_TABLES.map(table => table.tableName))
function isDesignTable(name: string): name is AgentWorkflowDesignTableName {return TABLE_NAMES.has(name)}

/** 绑定到 DataView 的查询/保存执行器。 */
type QueryExecutor = Parameters<DataView['bindQueryExecutor']>[0]
/** DataSet 派发的一批保存命令。 */
type SaveCommand = Parameters<NonNullable<QueryExecutor['save']>>[0]
/** 一张表的保存回执。 */
type SaveReceipt = Awaited<ReturnType<NonNullable<QueryExecutor['save']>>>[number]
/** 查询结果及其权限、动作判定。 */
type QueryResult = Awaited<ReturnType<QueryExecutor['executeQuery']>>
type QueryTarget = Readonly<{view: DataView; tableName: AgentWorkflowDesignTableName; workflowId: string; graphPath?: string; baseline: string}>

function graphPathOf(view: DataView): string | undefined {
  if (view.tableName !== AGENT_WORKFLOW_NODE_TABLE && view.tableName !== AGENT_WORKFLOW_LINE_TABLE) return undefined
  const graphPath = view.queryContext['graphPath']
  if (typeof graphPath !== 'string') throw new Error('AGENT_WORKFLOW_DESIGN_QUERY: 图视图必须提供 graphPath')
  return graphPath
}

function rowsFor(rows: AgentWorkflowDesignRows, target: Pick<QueryTarget, 'tableName' | 'graphPath'>): DataRow[] {
  const all = rows[target.tableName]
  return target.graphPath === undefined ? all : all.filter(row => row['graphPath'] === target.graphPath)
}

/** New rows get the same projection key the read side derives, so the saved row re-projects onto itself. */
function prepareNewDesignRow(target: QueryTarget, input: DataRow): DataRow {
  const pk = PRIMARY_KEY[target.tableName]
  if (target.tableName === AGENT_WORKFLOW_DESIGN_TABLE) throw agentWorkflowSaveIdentityError('流程行只能修改')
  if (target.graphPath === undefined) {
    const id = input[pk]
    if (typeof id !== 'string' || !id) throw agentWorkflowSaveIdentityError(`${target.tableName} 新增行必须提供 ${pk}`)
    return {...input}
  }
  if (!target.graphPath) throw agentWorkflowSaveIdentityError(`${target.tableName} 未选择子图，不能新增`)
  if (input['graphPath'] !== undefined && input['graphPath'] !== target.graphPath) {
    throw agentWorkflowSaveIdentityError(`${target.tableName} 新增行必须属于本视图的图 ${target.graphPath}`)
  }
  const supplied = input['id']
  const id = typeof supplied === 'string' && supplied ? supplied
    : target.tableName === AGENT_WORKFLOW_LINE_TABLE ? `line_${crypto.randomUUID()}` : undefined
  if (!id) throw agentWorkflowSaveIdentityError(`${target.tableName} 新增节点必须提供 id`)
  const key = `${target.graphPath}#${id}`
  if (input[pk] !== undefined && input[pk] !== key) throw agentWorkflowSaveIdentityError(`${target.tableName} 新增行主键必须是 ${key}`)
  return {...input, [pk]: key, graphPath: target.graphPath, id}
}

/** design.json 五张投影表共用的执行器：按图路径查询，一批多表变更合成一次文件写入。 */
export class AgentWorkflowDesignResource {
  readonly #files: AgentWorkflowFileCommit
  readonly #assertCurrent: () => void
  readonly #targets = new WeakMap<object, QueryTarget>()
  readonly #pendingBatches = new WeakMap<object, object>()

  /** 使用共享文件提交链创建投影执行器。 */
  constructor(input: AgentWorkflowFileScope) {
    this.#files = new AgentWorkflowFileCommit(input)
    this.#assertCurrent = input.assertCurrent
  }

  /** 读取 design.json 并返回该视图所属表（图表按 graphPath 过滤）的投影行。 */
  async executeQuery(view: DataView): Promise<QueryResult> {
    this.#assertCurrent()
    if (!isDesignTable(view.tableName)) throw new Error(`AGENT_WORKFLOW_DESIGN_VIEW: 不支持的表 ${view.tableName}`)
    const tableName = view.tableName
    const graphPath = graphPathOf(view)
    const workflowId = view.queryContext['workflowId']
    const baseline = await this.#files.readText(workflowId, 'design.json')
    if (typeof workflowId !== 'string') throw new Error('AGENT_WORKFLOW_DESIGN_QUERY: 查询必须提供有效工作流身份')
    const target: QueryTarget = {view, tableName, workflowId, baseline, ...(graphPath === undefined ? {} : {graphPath})}
    const rows = graphPath === '' ? [] : rowsFor(projectWorkflowDesign(JSON.parse(baseline), workflowId), target)
    return this.result(rows, target)
  }

  /** 合并同批各表变更，基于同一基线写一次 design.json，并按写入结果返回各表回执。 */
  async save(command: SaveCommand): Promise<SaveReceipt[]> {
    this.#assertCurrent()
    const first = command.changes[0]
    if (!first) throw agentWorkflowSaveIdentityError('缺少设计行变更')
    const targets = command.changes.map(change => {
      const target = this.#targets.get(change.context)
      if (!target) throw agentWorkflowSaveIdentityError('变更不属于本执行器的查询结果')
      if (change.identity.metaName !== target.tableName || change.identity.scenarioId !== target.view.dataSet?.scenarioId) {
        throw agentWorkflowSaveIdentityError('变更不属于本执行器的查询结果')
      }
      return target
    })
    const head = targets[0]
    if (!head || targets.some(target => target.workflowId !== head.workflowId || target.baseline !== head.baseline)) {
      throw new Error('AGENT_WORKFLOW_FILE_CONFLICT: 同批视图的工作流或 design.json 查询基线不一致，请重新加载')
    }
    const batch = this.#pendingBatches.get(first.context) ?? {}
    if (command.changes.some(change => (this.#pendingBatches.get(change.context) ?? batch) !== batch)) {
      throw agentWorkflowSaveIdentityError('待核验批次与本次提交的视图不一致')
    }
    const changes: Partial<Record<AgentWorkflowDesignTableName, {added: DataRow[]; changed: DataRow[]; deleted: DataRow[]}>> = {}
    command.changes.forEach((change, index) => {
      const target = targets[index]
      if (!target) return
      this.assertRows(target, change)
      const merged = changes[target.tableName] ?? {added: [], changed: [], deleted: []}
      merged.added.push(...(change.changes.added ?? []))
      merged.changed.push(...(change.changes.changed ?? []))
      merged.deleted.push(...(change.changes.deleted ?? []))
      changes[target.tableName] = merged
    })
    const nextDocument = applyWorkflowDesignChanges(JSON.parse(head.baseline), head.workflowId, changes satisfies AgentWorkflowDesignChanges)
    const content = JSON.stringify(nextDocument, null, 2)
    for (const change of command.changes) this.#pendingBatches.set(change.context, batch)
    try {
      await this.#files.commit({context: batch, workflowId: head.workflowId, fileName: 'design.json', baseline: head.baseline, content})
    } catch (error) {
      if (!this.#files.hasPending(batch)) for (const change of command.changes) this.#pendingBatches.delete(change.context)
      throw error
    }
    for (const change of command.changes) this.#pendingBatches.delete(change.context)
    const projected = projectWorkflowDesign(nextDocument, head.workflowId)
    return command.changes.map((change, index) => {
      const target = targets[index]
      if (!target) throw agentWorkflowSaveIdentityError('回执缺少查询身份')
      return this.receipt({...target, baseline: content}, projected, change)
    })
  }

  /** 该查询结果所在批次是否有结果未知的写入。 */
  hasUnconfirmedSave(context: QueryResult): boolean {
    const batch = this.#pendingBatches.get(context)
    return batch !== undefined && this.#files.hasPending(batch)
  }

  private assertRows(target: QueryTarget, change: SaveCommand['changes'][number]): void {
    const pk = PRIMARY_KEY[target.tableName]
    const original = new Map(change.context.rows.map(row => [String(row[pk]), row]))
    for (const row of change.changes.changed ?? []) {
      const before = original.get(String(row[pk]))
      if (!before) throw agentWorkflowSaveIdentityError(`${target.tableName} 修改行不在原查询结果中`)
      for (const field of READ_ONLY_FIELDS[target.tableName]) {
        if (!Object.is(before[field], row[field])) throw agentWorkflowSaveIdentityError(`${target.tableName} 不允许修改 ${field}`)
      }
    }
    for (const row of change.changes.deleted ?? []) {
      if (!original.has(String(row[pk]))) throw agentWorkflowSaveIdentityError(`${target.tableName} 删除行不在原查询结果中`)
    }
    for (const row of change.changes.added ?? []) {
      if (target.graphPath !== undefined && row['graphPath'] !== target.graphPath) {
        throw agentWorkflowSaveIdentityError(`${target.tableName} 新增行必须属于本视图的图 ${target.graphPath}`)
      }
    }
    if (target.tableName === AGENT_WORKFLOW_DESIGN_TABLE && (change.changes.added?.length || change.changes.deleted?.length)) {
      throw agentWorkflowSaveIdentityError('流程行只能修改')
    }
  }

  private receipt(target: QueryTarget, projected: AgentWorkflowDesignRows, change: SaveCommand['changes'][number]): SaveReceipt {
    const pk = PRIMARY_KEY[target.tableName]
    const rows = rowsFor(projected, target)
    const byKey = new Map(rows.map(row => [String(row[pk]), row]))
    const before = new Map(change.context.rows.map(row => [String(row[pk]), row]))
    const accepted = (row: DataRow): DataRow => {
      const next = byKey.get(String(row[pk]))
      if (!next) throw new Error(`AGENT_WORKFLOW_FILE_READBACK: 已写入的 design.json 缺少 ${target.tableName} 行 ${String(row[pk])}`)
      return next
    }
    const changed = (change.changes.changed ?? []).map(accepted)
    return {
      metaName: target.tableName,
      added: (change.changes.added ?? []).map(accepted),
      changed,
      deleted: [...(change.changes.deleted ?? [])],
      changedFields: changed.map(row => {
        const old = before.get(String(row[pk])) ?? {}
        return Object.keys(row).filter(field => JSON.stringify(old[field]) !== JSON.stringify(row[field]))
      }),
      context: this.result(rows, target),
    }
  }

  private result(rows: readonly DataRow[], target: QueryTarget): QueryResult {
    const assertCurrent = this.#assertCurrent
    const pk = PRIMARY_KEY[target.tableName]
    const keys = new Set(rows.map(row => String(row[pk])))
    const columns = new Set(AGENT_WORKFLOW_DESIGN_COLUMNS[target.tableName].map(item => item.name))
    const readOnly = new Set(READ_ONLY_FIELDS[target.tableName])
    const rowsCanChange = target.tableName !== AGENT_WORKFLOW_DESIGN_TABLE && target.graphPath !== ''
    const access = (rowKey: unknown, field: string) => {
      assertCurrent()
      const visible = keys.has(String(rowKey)) && columns.has(field)
      const canWrite = visible && !readOnly.has(field)
      return {read: visible ? 'visible' as const : 'invisible' as const, write: canWrite ? 'allowed' as const : 'denied' as const,
        component: canWrite ? 'editable' as const : visible ? 'readonly' as const : 'hidden' as const, required: false,
        writeMode: canWrite ? 'editable' as const : 'readonly' as const}
    }
    const result: QueryResult = {
      rows,
      total: rows.length,
      rowKey: (row: DataRow) => row[pk],
      assertIdentity: () => assertCurrent(),
      fieldAccess: access,
      readFieldAccess: (row: DataRow, field: string) => {
        assertCurrent()
        return rows.includes(row) && columns.has(field) ? 'visible' as const : 'invisible' as const
      },
      prepareNewRow: (row: DataRow) => {
        assertCurrent()
        return prepareNewDesignRow(target, row)
      },
      newRowFieldAccess: (field: string) => ({read: columns.has(field) ? 'visible' as const : 'invisible' as const,
        write: columns.has(field) ? 'allowed' as const : 'denied' as const, required: field === pk}),
      addActionState: () => {assertCurrent(); return rowsCanChange ? 'enabled' as const : 'disabled' as const},
      editActionState: (rowKey: unknown) => {assertCurrent(); return keys.has(String(rowKey)) ? 'enabled' as const : 'disabled' as const},
      deleteActionState: (rowKey: unknown) => {assertCurrent(); return rowsCanChange && keys.has(String(rowKey)) ? 'enabled' as const : 'disabled' as const},
      createChildActionState: () => {assertCurrent(); return 'disabled' as const},
      viewActionState: (rowKey: unknown) => {assertCurrent(); return keys.has(String(rowKey)) ? 'enabled' as const : 'disabled' as const},
    }
    this.#targets.set(result, target)
    return result
  }
}
