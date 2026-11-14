/**
 * @module app:lowcode/resources/system/workflow/manage/flow-design-graph-projection
 * 职责：从流程模型 DesignJson 解析节点坐标与连线路径，投影为 RendererGraph 只读布局。
 * 边界：不读写平台文件、不修改节点/连线表；解析失败时按节点行顺序兜底排布。
 */
import type {DataView} from '@spark-appworks/spark-data'
import {isRecord} from '@spark-appworks/spark-utils'

export type FlowDesignGraphLayout = Readonly<{
  nodePositions: Readonly<Record<string, {x: number; y: number}>>
  edgePaths: Readonly<Record<string, readonly {x: number; y: number}[]>>
}>

const DESIGN_JSON_KEYS = ['DesignJson', 'DESIGNJSON', 'designJson', 'DesignJSON'] as const

function normalizeText(value: unknown): string {
  return String(value ?? '').trim()
}

function readDesignJsonText(modelView: DataView): string {
  const row = modelView.rows[0]
  if (!row || typeof row !== 'object') return ''
  for (const key of DESIGN_JSON_KEYS) {
    const text = normalizeText(row[key])
    if (text) return text
  }
  return ''
}

export function parseFlowDesignGraphJson(content: string): Readonly<{
  nodes: readonly Record<string, unknown>[]
  edges: readonly Record<string, unknown>[]
}> | null {
  const text = normalizeText(content)
  if (!text) return null
  try {
    let parsed: unknown = JSON.parse(text)
    if (typeof parsed === 'string') parsed = JSON.parse(parsed)
    if (!isRecord(parsed)) return null
    const nodes = Array.isArray(parsed['nodes'])
      ? parsed['nodes'].filter(isRecord)
      : []
    const edges = Array.isArray(parsed['edges'])
      ? parsed['edges'].filter(isRecord)
      : []
    return {nodes, edges}
  } catch {
    return null
  }
}

function readPoint(value: unknown): {x: number; y: number} | undefined {
  if (!isRecord(value)) return undefined
  const x = Number(value['x']), y = Number(value['y'])
  return Number.isFinite(x) && Number.isFinite(y) ? {x, y} : undefined
}

function readPointsList(edge: Readonly<Record<string, unknown>>): readonly {x: number; y: number}[] | undefined {
  const raw = edge['pointsList']
  if (!Array.isArray(raw) || raw.length < 2) return undefined
  const points = raw.map(item => readPoint(item)).filter((item): item is {x: number; y: number} => Boolean(item))
  return points.length >= 2 ? points : undefined
}

export type FlowDesignLayoutOverride = Readonly<{
  nodePositions?: Readonly<Record<string, {x: number; y: number}>>
  edgePaths?: Readonly<Record<string, readonly {x: number; y: number}[]>>
}>

export type FlowDesignGraphLayoutInput = Readonly<{
  modelView: DataView
  nodeView: DataView
  edgeView: DataView
  designJsonOverride?: string
  layoutOverride?: FlowDesignLayoutOverride
}>

/** 将 DesignJson 与当前节点/连线行投影为 RendererGraph 布局参数。 */
export function buildFlowDesignGraphLayout(input: FlowDesignGraphLayoutInput): FlowDesignGraphLayout {
  const override = normalizeText(input.designJsonOverride)
  const parsed = parseFlowDesignGraphJson(override || readDesignJsonText(input.modelView))
  const nodePositions: Record<string, {x: number; y: number}> = {}
  const edgePaths: Record<string, readonly {x: number; y: number}[]> = {}

  for (const node of parsed?.nodes ?? []) {
    const id = normalizeText(node['id'])
    const point = readPoint(node)
    if (id && point) nodePositions[id] = point
  }
  for (const edge of parsed?.edges ?? []) {
    const id = normalizeText(edge['id'])
    const points = readPointsList(edge)
    if (id && points) edgePaths[id] = points
  }

  input.nodeView.rows.forEach((row, index) => {
    if (!row || typeof row !== 'object') return
    const id = normalizeText(row['rowid'] ?? row['ROWID'])
    if (!id || nodePositions[id]) return
    nodePositions[id] = {x: 120 + (index % 4) * 220, y: 80 + Math.floor(index / 4) * 140}
  })

  const sessionPositions = input.layoutOverride?.nodePositions
  if (sessionPositions) {
    for (const [id, point] of Object.entries(sessionPositions)) {
      if (id && point && Number.isFinite(point.x) && Number.isFinite(point.y)) nodePositions[id] = {x: point.x, y: point.y}
    }
  }
  const sessionPaths = input.layoutOverride?.edgePaths
  if (sessionPaths) {
    for (const [id, points] of Object.entries(sessionPaths)) {
      if (id && points?.length) edgePaths[id] = points
    }
  }

  return {nodePositions, edgePaths}
}

/** 将当前布局与节点/边行序列化为 DesignJson 文本（保存用）。 */
export function serializeFlowDesignGraphJson(input: FlowDesignGraphLayoutInput): string {
  const layout = buildFlowDesignGraphLayout(input)
  const nodes = input.nodeView.rows
    .filter(row => row && typeof row === 'object')
    .map(row => {
      const id = normalizeText(row['rowid'] ?? row['ROWID'])
      if (!id) return null
      const position = layout.nodePositions[id] ?? {x: 0, y: 0}
      return {id, type: 'rect', x: position.x, y: position.y, properties: {title: normalizeText(row['TITLE'])}}
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
  const edges = input.edgeView.rows
    .filter(row => row && typeof row === 'object')
    .map(row => {
      const id = normalizeText(row['rowid'] ?? row['ROWID'])
      const sourceNodeId = normalizeText(row['PARENTID'])
      const targetNodeId = normalizeText(row['CHILDID'])
      if (!id || !sourceNodeId || !targetNodeId) return null
      const points = layout.edgePaths[id]
      const edge: Record<string, unknown> = {id, type: 'polyline', sourceNodeId, targetNodeId}
      if (points && points.length >= 2) edge['pointsList'] = points.map(point => ({x: point.x, y: point.y}))
      return edge
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
  return JSON.stringify({nodes, edges})
}