/**
 * @module app:lowcode/resources/repository/agent-workflow/agent-workflow-design-projection
 * 职责：把 Agent 工作流 design.json 无损拆成流程、节点、连线、变量、能力五张表的行，并把行变更合回同一文档。
 * 边界：纯函数，不读写文件；子图按 graphPath 展开，未投影字段原样保留在 extra/data 列。
 * AI用途：设计页编辑节点或连线需要落到 DataView 行，或排查 design.json 往返差异时，用本模块定位投影规则。
 */
import type {DataColumn, DataRow} from '@spark-appworks/spark-data'

export const AGENT_WORKFLOW_DESIGN_TABLE = 'AgentWorkflowDesign'
export const AGENT_WORKFLOW_NODE_TABLE = 'AgentWorkflowNodes'
export const AGENT_WORKFLOW_LINE_TABLE = 'AgentWorkflowLines'
export const AGENT_WORKFLOW_VARIABLE_TABLE = 'AgentWorkflowVariables'
export const AGENT_WORKFLOW_CAPABILITY_TABLE = 'AgentWorkflowCapabilities'
export const AGENT_WORKFLOW_ROOT_GRAPH = 'workflow.graph'

/** design.json 投影出的五张表名：流程、节点、连线、变量、能力。 */
export type AgentWorkflowDesignTableName = typeof AGENT_WORKFLOW_DESIGN_TABLE | typeof AGENT_WORKFLOW_NODE_TABLE
  | typeof AGENT_WORKFLOW_LINE_TABLE | typeof AGENT_WORKFLOW_VARIABLE_TABLE | typeof AGENT_WORKFLOW_CAPABILITY_TABLE

/** 一份 design.json 的全部投影行，按表名分组；节点和连线含所有子图。 */
export type AgentWorkflowDesignRows = Readonly<Record<AgentWorkflowDesignTableName, DataRow[]>>

/** 一张表提交的行变更；修改行是按表主键定位的完整行。 */
export type AgentWorkflowDesignTableChanges = Readonly<{
  /** 新增行。 */
  added?: readonly DataRow[]
  /** 修改后的完整行。 */
  changed?: readonly DataRow[]
  /** 删除行，只按主键定位。 */
  deleted?: readonly DataRow[]
}>

/** 一次保存涉及的各表变更；未出现的表保持基线不变。 */
export type AgentWorkflowDesignChanges = Readonly<Partial<Record<AgentWorkflowDesignTableName, AgentWorkflowDesignTableChanges>>>

/** design.json 中的普通 JSON 对象。 */
type Json = Record<string, unknown>
type ColumnSpec = Readonly<{name: string; type: string; isPrimaryKey?: true}>

const column = (name: string, type: string): ColumnSpec => ({name, type})
const key = (name: string): ColumnSpec => ({name, type: 'string', isPrimaryKey: true})

export const AGENT_WORKFLOW_DESIGN_COLUMNS: Readonly<Record<AgentWorkflowDesignTableName, readonly DataColumn[]>> = Object.freeze({
  [AGENT_WORKFLOW_DESIGN_TABLE]: [key('workflowId'), column('title', 'string'), column('version', 'number'),
    column('runtimeBinding', 'object'), column('workflow', 'object'), column('document', 'object')],
  [AGENT_WORKFLOW_NODE_TABLE]: [key('nodeKey'), column('graphPath', 'string'), column('id', 'string'), column('order', 'number'),
    column('type', 'string'), column('dataType', 'string'), column('title', 'string'), column('desc', 'string'),
    column('x', 'number'), column('y', 'number'), column('inputs', 'object'), column('outputs', 'object'),
    column('capabilities', 'array'), column('models', 'array'), column('llm', 'object'), column('validation', 'object'),
    column('loop', 'object'), column('iteration', 'object'), column('state', 'object'), column('result', 'object'),
    column('data', 'object'), column('extra', 'object')],
  [AGENT_WORKFLOW_LINE_TABLE]: [key('lineKey'), column('graphPath', 'string'), column('id', 'string'), column('order', 'number'),
    column('fromNodeId', 'string'), column('fromModelId', 'string'), column('fromMemberName', 'string'), column('fromDock', 'number'),
    column('toNodeId', 'string'), column('toModelId', 'string'), column('toMemberName', 'string'), column('toDock', 'number'),
    column('type', 'string'), column('relation', 'string'), column('lineType', 'string'), column('controlPoints', 'array'),
    column('from', 'object'), column('to', 'object'), column('data', 'object'), column('extra', 'object')],
  [AGENT_WORKFLOW_VARIABLE_TABLE]: [key('name'), column('order', 'number'), column('title', 'string'), column('required', 'boolean'),
    column('schema', 'object'), column('defaultValue', 'object'), column('extra', 'object')],
  [AGENT_WORKFLOW_CAPABILITY_TABLE]: [key('id'), column('order', 'number'), column('title', 'string'), column('scope', 'string'),
    column('description', 'string'), column('inputs', 'object'), column('outputs', 'object'), column('constraints', 'array'),
    column('extra', 'object')],
})

const PRIMARY_KEYS: Readonly<Record<AgentWorkflowDesignTableName, string>> = Object.freeze({
  [AGENT_WORKFLOW_DESIGN_TABLE]: 'workflowId',
  [AGENT_WORKFLOW_NODE_TABLE]: 'nodeKey',
  [AGENT_WORKFLOW_LINE_TABLE]: 'lineKey',
  [AGENT_WORKFLOW_VARIABLE_TABLE]: 'name',
  [AGENT_WORKFLOW_CAPABILITY_TABLE]: 'id',
})

const LIST_TABLES = [['variables', AGENT_WORKFLOW_VARIABLE_TABLE, 'name'], ['capabilities', AGENT_WORKFLOW_CAPABILITY_TABLE, 'id']] as const
const LIST_FIELDS: Readonly<Record<'variables' | 'capabilities', readonly string[]>> = {
  variables: ['title', 'required', 'schema', 'defaultValue'],
  capabilities: ['title', 'scope', 'description', 'inputs', 'outputs', 'constraints'],
}
const NODE_DATA_COLUMNS = ['inputs', 'outputs', 'capabilities', 'models', 'llm', 'validation', 'state', 'result'] as const
const CARRIERS = ['loop', 'iteration'] as const

function isJson(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function projectionError(message: string): Error {return new Error(`AGENT_WORKFLOW_DESIGN_PROJECTION: ${message}`)}

function clone<T>(value: T): T {return structuredClone(value)}

/** Moves `fields` out of `source` into columns; a field holding null stays in the remainder so absence and null differ. */
function take(source: Json, fields: readonly string[]): Readonly<{columns: Json; rest: Json}> {
  const columns: Json = {}
  const rest: Json = {}
  for (const [field, value] of Object.entries(source)) {
    if (fields.includes(field) && value !== null && value !== undefined) columns[field] = clone(value)
    else rest[field] = clone(value)
  }
  return {columns, rest}
}

/** Column value or null; null means the field is absent from the document. */
function columnValue(columns: Json, field: string): unknown {
  return Object.hasOwn(columns, field) ? columns[field] : null
}

function present(next: unknown): boolean {return next !== null && next !== undefined}

function put(target: Json, field: string, next: unknown): void {
  if (present(next)) target[field] = clone(next)
}

function remainder(row: DataRow, field: string): Json | null {
  const next = row[field]
  if (next === null || next === undefined) return null
  if (!isJson(next)) throw projectionError(`${field} 必须是对象`)
  return clone(next)
}

type GraphParts = Readonly<{meta: Json; nodes: readonly unknown[]; lines: readonly unknown[]}>

function graphOf(value: unknown, path: string): GraphParts {
  if (!isJson(value)) throw projectionError(`${path} 缺少 nodes/lines`)
  const nodes = value['nodes']
  const lines = value['lines']
  if (!Array.isArray(nodes) || !Array.isArray(lines)) throw projectionError(`${path} 缺少 nodes/lines`)
  return {meta: omit(value, ['nodes', 'lines']), nodes, lines}
}

function omit(source: Json, fields: readonly string[]): Json {
  return Object.fromEntries(Object.entries(source).filter(([field]) => !fields.includes(field)).map(([field, item]) => [field, clone(item)]))
}

function nodeKeyOf(graphPath: string, id: string): string {return `${graphPath}#${id}`}

function projectGraph(graph: GraphParts, graphPath: string, rows: AgentWorkflowDesignRows): void {
  const nodeKeys = new Set<string>()
  graph.nodes.forEach((node, order) => {
    const id = isJson(node) ? node['id'] : undefined
    if (!isJson(node) || typeof id !== 'string' || !id) throw projectionError(`${graphPath} 第 ${order} 个节点缺少 id`)
    const nodeKey = nodeKeyOf(graphPath, id)
    if (nodeKeys.has(nodeKey)) throw projectionError(`节点 id 重复: ${nodeKey}`)
    nodeKeys.add(nodeKey)
    const top = take(node, ['type'])
    const extra = top.rest
    delete extra['id']
    const positionData = node['position']
    const position = isJson(positionData) ? take(positionData, ['x', 'y']) : undefined
    if (position) extra['position'] = position.rest
    delete extra['data']
    const row: DataRow = {nodeKey, graphPath, id, order, type: columnValue(top.columns, 'type'),
      x: position ? columnValue(position.columns, 'x') : null, y: position ? columnValue(position.columns, 'y') : null,
      dataType: null, title: null, desc: null, loop: null, iteration: null, data: null, extra}
    for (const field of NODE_DATA_COLUMNS) row[field] = null
    const nodeData = node['data']
    if (isJson(nodeData)) {
      const data = take(nodeData, ['type', 'title', 'desc', ...NODE_DATA_COLUMNS, ...CARRIERS])
      row['dataType'] = columnValue(data.columns, 'type')
      row['title'] = columnValue(data.columns, 'title')
      row['desc'] = columnValue(data.columns, 'desc')
      for (const field of NODE_DATA_COLUMNS) row[field] = columnValue(data.columns, field)
      for (const carrier of CARRIERS) {
        const carried = data.columns[carrier]
        if (carried === undefined) continue
        if (!isJson(carried)) throw projectionError(`${nodeKey} 的 ${carrier} 必须是对象`)
        if (carried['subGraph'] !== undefined) {
          const subPath = `${graphPath}.${id}.${carrier}.subGraph`
          const subGraph = graphOf(carried['subGraph'], subPath)
          projectGraph(subGraph, subPath, rows)
          carried['subGraph'] = subGraph.meta
        }
        row[carrier] = carried
      }
      row['data'] = data.rest
    }
    rows[AGENT_WORKFLOW_NODE_TABLE].push(row)
  })
  const lineKeys = new Set<string>()
  graph.lines.forEach((line, order) => {
    const fromPoint = isJson(line) ? line['from'] : undefined
    const toPoint = isJson(line) ? line['to'] : undefined
    if (!isJson(line) || !isJson(fromPoint) || !isJson(toPoint)) throw projectionError(`${graphPath} 第 ${order} 条连线缺少端点`)
    const id = typeof line['id'] === 'string' && line['id'] ? line['id'] : null
    const lineKey = `${graphPath}#${id ?? `@${order}`}`
    if (lineKeys.has(lineKey)) throw projectionError(`连线 id 重复: ${lineKey}`)
    lineKeys.add(lineKey)
    const top = take(line, ['type'])
    const extra = omit(top.rest, ['id', 'from', 'to', 'data'])
    if (line['id'] !== undefined && id === null) extra['id'] = clone(line['id'])
    const from = take(fromPoint, ['nodeId', 'modelId', 'memberName', 'dock'])
    const to = take(toPoint, ['nodeId', 'modelId', 'memberName', 'dock'])
    const row: DataRow = {lineKey, graphPath, id, order, type: columnValue(top.columns, 'type'),
      fromNodeId: columnValue(from.columns, 'nodeId'), fromModelId: columnValue(from.columns, 'modelId'),
      fromMemberName: columnValue(from.columns, 'memberName'), fromDock: columnValue(from.columns, 'dock'),
      toNodeId: columnValue(to.columns, 'nodeId'), toModelId: columnValue(to.columns, 'modelId'),
      toMemberName: columnValue(to.columns, 'memberName'), toDock: columnValue(to.columns, 'dock'),
      from: from.rest, to: to.rest, relation: null, lineType: null, controlPoints: null, data: null, extra}
    const lineData = line['data']
    if (isJson(lineData)) {
      const data = take(lineData, ['relation'])
      row['relation'] = columnValue(data.columns, 'relation')
      const visualData = data.rest['visual']
      if (isJson(visualData)) {
        const visual = take(visualData, ['lineType', 'controlPoints'])
        row['lineType'] = columnValue(visual.columns, 'lineType')
        row['controlPoints'] = columnValue(visual.columns, 'controlPoints')
        data.rest['visual'] = visual.rest
      }
      row['data'] = data.rest
    }
    rows[AGENT_WORKFLOW_LINE_TABLE].push(row)
  })
}

/** Splits a design document into the five projection tables. */
export function projectWorkflowDesign(document: unknown, workflowId: string): AgentWorkflowDesignRows {
  if (!isJson(document) || !isJson(document['workflow'])) throw projectionError('design.json 缺少 workflow')
  const rows: AgentWorkflowDesignRows = {
    [AGENT_WORKFLOW_DESIGN_TABLE]: [], [AGENT_WORKFLOW_NODE_TABLE]: [], [AGENT_WORKFLOW_LINE_TABLE]: [],
    [AGENT_WORKFLOW_VARIABLE_TABLE]: [], [AGENT_WORKFLOW_CAPABILITY_TABLE]: [],
  }
  const source = document['workflow']
  const workflow = take(source, ['version', 'runtimeBinding'])
  const graph = graphOf(source['graph'], AGENT_WORKFLOW_ROOT_GRAPH)
  projectGraph(graph, AGENT_WORKFLOW_ROOT_GRAPH, rows)
  workflow.rest['graph'] = graph.meta
  for (const [field, table, pk] of LIST_TABLES) {
    const items = source[field]
    if (items === undefined) continue
    if (!Array.isArray(items)) throw projectionError(`workflow.${field} 必须是数组`)
    workflow.rest[field] = []
    const seen = new Set<string>()
    items.forEach((item: unknown, order: number) => {
      const id = isJson(item) ? item[pk] : undefined
      if (!isJson(item) || typeof id !== 'string' || !id) throw projectionError(`workflow.${field} 第 ${order} 项缺少 ${pk}`)
      if (seen.has(id)) throw projectionError(`workflow.${field} ${pk} 重复: ${id}`)
      seen.add(id)
      const fields = LIST_FIELDS[field]
      const split = take(item, fields)
      const row: DataRow = {[pk]: id, order, extra: omit(split.rest, [pk])}
      for (const name of fields) row[name] = columnValue(split.columns, name)
      rows[table].push(row)
    })
  }
  const documentRest = omit(document, ['workflow'])
  const spark = documentRest['x_spark']
  const designerData = isJson(spark) ? spark['designer'] : undefined
  const designer = isJson(designerData) ? take(designerData, ['title']) : undefined
  if (isJson(spark) && designer) spark['designer'] = designer.rest
  rows[AGENT_WORKFLOW_DESIGN_TABLE].push({workflowId, title: designer ? columnValue(designer.columns, 'title') : null,
    version: columnValue(workflow.columns, 'version'), runtimeBinding: columnValue(workflow.columns, 'runtimeBinding'),
    workflow: workflow.rest, document: documentRest})
  return rows
}

function ordered(rows: readonly DataRow[]): DataRow[] {
  return rows.map((row, index) => ({row, index})).sort((left, right) => {
    const a = typeof left.row['order'] === 'number' ? left.row['order'] : Number.POSITIVE_INFINITY
    const b = typeof right.row['order'] === 'number' ? right.row['order'] : Number.POSITIVE_INFINITY
    return a === b ? left.index - right.index : a - b
  }).map(item => item.row)
}

function text(row: DataRow, field: string, owner: string): string {
  const next = row[field]
  if (typeof next !== 'string' || !next) throw projectionError(`${owner} 缺少 ${field}`)
  return next
}

function composeGraph(meta: Json, graphPath: string, rows: AgentWorkflowDesignRows): Json {
  const nodes = ordered(rows[AGENT_WORKFLOW_NODE_TABLE].filter(row => row['graphPath'] === graphPath)).map(row => {
    const id = text(row, 'id', `节点 ${String(row['nodeKey'])}`)
    if (row['nodeKey'] !== nodeKeyOf(graphPath, id)) throw projectionError(`节点主键与 graphPath/id 不一致: ${String(row['nodeKey'])}`)
    const extra = remainder(row, 'extra') ?? {}
    const node: Json = {id}
    put(node, 'type', row['type'])
    const positionRest = isJson(extra['position']) ? extra['position'] : undefined
    delete extra['position']
    if (positionRest !== undefined || present(row['x']) || present(row['y'])) {
      const position: Json = {}
      put(position, 'x', row['x'])
      put(position, 'y', row['y'])
      node['position'] = {...position, ...positionRest}
    }
    const dataRest = remainder(row, 'data')
    const dataFields = ['dataType', 'title', 'desc', ...NODE_DATA_COLUMNS, ...CARRIERS]
    if (dataRest !== null || dataFields.some(field => present(row[field]))) {
      const data: Json = {}
      put(data, 'type', row['dataType'])
      put(data, 'title', row['title'])
      put(data, 'desc', row['desc'])
      for (const field of NODE_DATA_COLUMNS) put(data, field, row[field])
      for (const carrier of CARRIERS) {
        const carried = remainder(row, carrier)
        if (carried === null) continue
        if (carried['subGraph'] !== undefined) {
          if (!isJson(carried['subGraph'])) throw projectionError(`${String(row['nodeKey'])} 的 ${carrier}.subGraph 必须是对象`)
          carried['subGraph'] = composeGraph(carried['subGraph'], `${graphPath}.${id}.${carrier}.subGraph`, rows)
        }
        data[carrier] = carried
      }
      node['data'] = {...data, ...dataRest}
    }
    return {...node, ...extra}
  })
  const lines = ordered(rows[AGENT_WORKFLOW_LINE_TABLE].filter(row => row['graphPath'] === graphPath)).map(row => {
    const owner = `连线 ${String(row['lineKey'])}`
    const endpoint = (side: 'from' | 'to'): Json => {
      const point: Json = {}
      put(point, 'nodeId', text(row, `${side}NodeId`, owner))
      put(point, 'modelId', row[`${side}ModelId`])
      put(point, 'memberName', row[`${side}MemberName`])
      put(point, 'dock', row[`${side}Dock`])
      return {...point, ...remainder(row, side)}
    }
    const line: Json = {}
    put(line, 'id', row['id'])
    line['from'] = endpoint('from')
    line['to'] = endpoint('to')
    put(line, 'type', row['type'])
    const dataRest = remainder(row, 'data')
    if (dataRest !== null || present(row['relation']) || present(row['lineType']) || present(row['controlPoints'])) {
      const data: Json = {...dataRest}
      put(data, 'relation', row['relation'])
      if (isJson(data['visual']) || present(row['lineType']) || present(row['controlPoints'])) {
        const visual: Json = isJson(data['visual']) ? {...data['visual']} : {}
        put(visual, 'lineType', row['lineType'])
        put(visual, 'controlPoints', row['controlPoints'])
        data['visual'] = visual
      }
      line['data'] = data
    }
    return {...line, ...remainder(row, 'extra')}
  })
  return {...clone(meta), nodes, lines}
}

/** Rebuilds the design document from complete projection rows. */
export function composeWorkflowDesign(rows: AgentWorkflowDesignRows): Json {
  const designs = rows[AGENT_WORKFLOW_DESIGN_TABLE]
  if (designs.length !== 1 || !designs[0]) throw projectionError(`流程行必须唯一，实际 ${designs.length} 行`)
  const design = designs[0]
  const workflow = remainder(design, 'workflow') ?? {}
  const graphMeta = isJson(workflow['graph']) ? workflow['graph'] : {}
  put(workflow, 'version', design['version'])
  put(workflow, 'runtimeBinding', design['runtimeBinding'])
  workflow['graph'] = composeGraph(graphMeta, AGENT_WORKFLOW_ROOT_GRAPH, rows)
  for (const [field, table, pk] of LIST_TABLES) {
    const items = ordered(rows[table])
    if (!items.length && workflow[field] === undefined) continue
    const fields = LIST_FIELDS[field]
    workflow[field] = items.map(row => {
      const item: Json = {[pk]: text(row, pk, `workflow.${field}`)}
      for (const name of fields) put(item, name, row[name])
      return {...item, ...remainder(row, 'extra')}
    })
  }
  const document = remainder(design, 'document') ?? {}
  if (present(design['title'])) {
    const spark = isJson(document['x_spark']) ? document['x_spark'] : {}
    const designer = isJson(spark['designer']) ? spark['designer'] : {}
    spark['designer'] = {title: design['title'], ...designer}
    document['x_spark'] = spark
  }
  return {...document, workflow}
}

/** Applies one batch of row changes to the projection of `document` and returns the rebuilt document. */
export function applyWorkflowDesignChanges(document: unknown, workflowId: string, changes: AgentWorkflowDesignChanges): Json {
  const base = projectWorkflowDesign(document, workflowId)
  const apply = (table: AgentWorkflowDesignTableName) => applyTableChanges(table, base[table], changes[table])
  return composeWorkflowDesign({
    [AGENT_WORKFLOW_DESIGN_TABLE]: apply(AGENT_WORKFLOW_DESIGN_TABLE),
    [AGENT_WORKFLOW_NODE_TABLE]: apply(AGENT_WORKFLOW_NODE_TABLE),
    [AGENT_WORKFLOW_LINE_TABLE]: apply(AGENT_WORKFLOW_LINE_TABLE),
    [AGENT_WORKFLOW_VARIABLE_TABLE]: apply(AGENT_WORKFLOW_VARIABLE_TABLE),
    [AGENT_WORKFLOW_CAPABILITY_TABLE]: apply(AGENT_WORKFLOW_CAPABILITY_TABLE),
  })
}

function applyTableChanges(table: AgentWorkflowDesignTableName, rows: readonly DataRow[], change: AgentWorkflowDesignTableChanges | undefined): DataRow[] {
  const pk = PRIMARY_KEYS[table]
  const byKey = new Map(rows.map(row => [String(row[pk]), row]))
  for (const row of change?.deleted ?? []) {
    if (!byKey.delete(String(row[pk]))) throw projectionError(`${table} 删除的行不在基线中: ${String(row[pk])}`)
  }
  for (const row of change?.changed ?? []) {
    if (!byKey.has(String(row[pk]))) throw projectionError(`${table} 修改的行不在基线中: ${String(row[pk])}`)
    byKey.set(String(row[pk]), clone(row))
  }
  for (const row of change?.added ?? []) {
    if (typeof row[pk] !== 'string' || !row[pk]) throw projectionError(`${table} 新增行缺少 ${pk}`)
    if (byKey.has(row[pk])) throw projectionError(`${table} 新增行主键重复: ${row[pk]}`)
    byKey.set(row[pk], clone(row))
  }
  return [...byKey.values()]
}
