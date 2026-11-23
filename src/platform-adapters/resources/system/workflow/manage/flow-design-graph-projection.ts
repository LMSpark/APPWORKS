/**
 * @module app:lowcode/resources/system/workflow/manage/flow-design-graph-projection
 * 职责：从正式设计文件解析节点坐标与连线路径，投影为 RendererGraph 布局。
 * 边界：不读写平台文件、不修改节点/连线表；解析失败时按节点行顺序兜底排布。
 */
import type {DataView} from '@spark-appworks/spark-data'
import {isRecord} from '@spark-appworks/spark-utils'

export type FlowDesignGraphLayout = Readonly<{
  nodePositions: Readonly<Record<string, {x: number; y: number}>>
  edgePaths: Readonly<Record<string, ReadonlyArray<{x: number; y: number}>>>
}>

function normalizeText(value: unknown): string {
  return String(value ?? '').trim()
}

export function parseFlowDesignGraphJson(content: string): Readonly<{
  nodes: ReadonlyArray<Record<string, unknown>>
  edges: ReadonlyArray<Record<string, unknown>>
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

function readPointsList(edge: Readonly<Record<string, unknown>>): ReadonlyArray<{x: number; y: number}> | undefined {
  const raw = edge['pointsList']
  if (!Array.isArray(raw) || raw.length < 2) return undefined
  const points = raw.map(item => readPoint(item)).filter((item): item is {x: number; y: number} => Boolean(item))
  return points.length >= 2 ? points : undefined
}

export type FlowDesignLayoutOverride = Readonly<{
  nodePositions?: Readonly<Record<string, {x: number; y: number}>>
  edgePaths?: Readonly<Record<string, ReadonlyArray<{x: number; y: number}>>>
}>

export type FlowDesignGraphLayoutInput = Readonly<{
  nodeView: DataView
  edgeView: DataView
  documentText: string
  layoutOverride?: FlowDesignLayoutOverride
}>

/** 将原设计文件与当前节点/连线行投影为 RendererGraph 布局参数。 */
export function buildFlowDesignGraphLayout(input: FlowDesignGraphLayoutInput): FlowDesignGraphLayout {
  const parsed = parseFlowDesignGraphJson(input.documentText)
  const nodePositions: Record<string, {x: number; y: number}> = {}
  const edgePaths: Record<string, ReadonlyArray<{x: number; y: number}>> = {}

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
    if (!isRecord(row)) return
    const id = normalizeText(row['rowid'] ?? row['ROWID'])
    if (!id || nodePositions[id]) return
    nodePositions[id] = {x: 120 + (index % 4) * 220, y: 80 + Math.floor(index / 4) * 140}
  })

  const sessionPositions = input.layoutOverride?.nodePositions
  if (sessionPositions) {
    for (const [id, point] of Object.entries(sessionPositions)) {
      if (id && isRecord(point) && Number.isFinite(point.x) && Number.isFinite(point.y)) nodePositions[id] = {x: point.x, y: point.y}
    }
  }
  const sessionPaths = input.layoutOverride?.edgePaths
  if (sessionPaths) {
    for (const [id, points] of Object.entries(sessionPaths)) {
      if (id && Array.isArray(points) && points.length > 0) edgePaths[id] = points
    }
  }

  return {nodePositions, edgePaths}
}

/** 将当前布局与节点/边行序列化为原设计文件文本。 */
export function serializeFlowDesignGraphJson(input: FlowDesignGraphLayoutInput): string {
  const layout = buildFlowDesignGraphLayout(input)
  const text=normalizeText(input.documentText)
  let previous:Record<string,unknown>={}
  if(text){let value:unknown=JSON.parse(text);if(typeof value==='string')value=JSON.parse(value)
    if(!isRecord(value))throw Error('流程设计原文件不是对象，不能覆盖');previous=value}
  const oldNodes=Array.isArray(previous['nodes'])?previous['nodes'].filter(isRecord):[]
  const oldEdges=Array.isArray(previous['edges'])?previous['edges'].filter(isRecord):[]
  const effective=(view:DataView)=>view.rows.map(row=>{const key=view.getPkKey(row);return key===undefined?row:view.getEditingRow(key)??row})
  const read=(view:DataView,row:DataView['rows'][number],field:string)=>{if(view.fieldAccess(row,field).read!=='visible')throw Error(`流程图字段不可读: ${field}`);return row[field]}
  const nodeRows=effective(input.nodeView),edgeRows=effective(input.edgeView)
  for(const [stored,rows,view] of [[oldNodes,nodeRows,input.nodeView],[oldEdges,edgeRows,input.edgeView]] as const){
    for(const item of stored){const id=normalizeText(item['id']);if(id&&!rows.some(row=>normalizeText(row['rowid'])===id)&&!view.dirtyTracking.isPendingDelete(id))throw Error('原文件图项未返回正式定义，不能覆盖未知图项')}
  }
  const nodes=nodeRows.map(row=>{
    const id=normalizeText(read(input.nodeView,row,'rowid'));if(!id)throw Error('流程节点缺少正式身份')
    const old=oldNodes.find(node=>normalizeText(node['id'])===id),position=layout.nodePositions[id]??{x:0,y:0}
    return {...old,id,type:old?.['type']??'rect',...position,properties:{...(isRecord(old?.['properties'])?old['properties']:{}),...(input.nodeView.fieldAccess(row,'TITLE').read==='visible'?{title:normalizeText(row['TITLE'])}:{})}}
  })
  const edges=edgeRows.map(row=>{
    const id=normalizeText(read(input.edgeView,row,'rowid')),sourceNodeId=normalizeText(read(input.edgeView,row,'UpNodeID')),targetNodeId=normalizeText(read(input.edgeView,row,'NextNodeID'))
    if(!id||!sourceNodeId||!targetNodeId)throw Error('流程连线缺少正式身份或端点')
    if(!nodes.some(node=>node.id===sourceNodeId)||!nodes.some(node=>node.id===targetNodeId))throw Error('流程连线端点不属于当前流程')
    const old=oldEdges.find(edge=>normalizeText(edge['id'])===id),points=layout.edgePaths[id]
    return {...old,id,type:old?.['type']??'polyline',sourceNodeId,targetNodeId,...(points&&points.length>=2?{pointsList:points.map(point=>({...point}))}:{})}
  })
  return JSON.stringify({...previous,nodes,edges})
}
