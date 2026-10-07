/**
 * @module app:views/app/workflow-designs/workflow-design-flow
 * 职责：WorkflowDesigns 画布的端口、连线路径、控制点几何与键盘移动等纯计算。
 * 边界：无响应式状态与副作用；不读写设计稿。
 * AI用途：排查画布连线走向、端口映射或控制点命中时，从本模块定位。
 */
import { MarkerType, Position, type ViewportTransform } from '@vue-flow/core'
import type { WorkflowDesignLineEndpoint, WorkflowDesignLineControlPoint, WorkflowDesignLineView, WorkflowDesignGraphView } from '@/services/workflow-designs'
import type { EditorLineEndpointCommand, WorkflowControlEdgeSlot, WorkflowDockDefinition, WorkflowFlowLineData, WorkflowFlowNodeData, WorkflowLineRuntimeStatus } from './workflow-design-view-types'
import { isJsonRecord } from './workflow-design-fields'

export const NODE_KEYBOARD_MOVE_STEP = 20

export const NODE_KEYBOARD_FAST_MOVE_STEP = 100

export const WORKFLOW_NODE_WIDTH = 216

export const WORKFLOW_NODE_HEIGHT = 118

export const inputDockDefinitions: readonly WorkflowDockDefinition[] = [
  { id: 1, position: Position.Top, style: { left: '25%' } },
  { id: 2, position: Position.Top, style: { left: '50%' } },
  { id: 3, position: Position.Top, style: { left: '75%' } },
  { id: 10, position: Position.Left, style: { top: '25%' } },
  { id: 11, position: Position.Left, style: { top: '50%' } },
  { id: 12, position: Position.Left, style: { top: '75%' } },
]

export const outputDockDefinitions: readonly WorkflowDockDefinition[] = [
  { id: 4, position: Position.Right, style: { top: '25%' } },
  { id: 5, position: Position.Right, style: { top: '50%' } },
  { id: 6, position: Position.Right, style: { top: '75%' } },
  { id: 7, position: Position.Bottom, style: { left: '75%' } },
  { id: 8, position: Position.Bottom, style: { left: '50%' } },
  { id: 9, position: Position.Bottom, style: { left: '25%' } },
]

export const flowDefaultLineOptions = {
  type: 'smoothstep',
  markerEnd: MarkerType.ArrowClosed,
  interactionWidth: 18,
}

export function isWorkflowFlowNodeData(value: unknown): value is WorkflowFlowNodeData {
  return isJsonRecord(value)
    && typeof value['viewKey'] === 'string'
    && typeof value['title'] === 'string'
    && typeof value['nodeType'] === 'string'
    && typeof value['scopePath'] === 'string'
    && typeof value['isBusinessNode'] === 'boolean'
    && typeof value['isBoundaryNode'] === 'boolean'
    && typeof value['modelClassName'] === 'string'
    && typeof value['modelDocText'] === 'string'
    && typeof value['validationActionName'] === 'string'
    && typeof value['validationActionDocText'] === 'string'
}

export function isWorkflowFlowLineData(value: unknown): value is WorkflowFlowLineData {
  return isJsonRecord(value) && typeof value['lineKey'] === 'string'
}

export function readFlowConnectionLineFromEvent(value: unknown): Readonly<{ data: WorkflowFlowLineData }> | null {
  if (!isJsonRecord(value)) return null
  const linePayload = value['edge']
  if (
    !isJsonRecord(linePayload)
    || typeof linePayload['id'] !== 'string'
    || typeof linePayload['source'] !== 'string'
    || typeof linePayload['target'] !== 'string'
  ) {
    return null
  }
  const data = linePayload['data']
  if (!isWorkflowFlowLineData(data)) return null
  return {
    data,
  }
}

export function dockHandle(dock: number): string {
  return `dock-${dock}`
}

export function dockFromHandle(handle: string | null | undefined): number | undefined {
  if (typeof handle !== 'string' || handle.trim().length === 0) return undefined
  const match = /^dock-(\d+)$/u.exec(handle.trim())
  if (match !== null) return Number(match[1])
  const parsed = Number(handle)
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 12 ? parsed : undefined
}

export function readDockText(dock: unknown): string {
  return typeof dock === 'number' && Number.isInteger(dock) && dock >= 0 && dock <= 12 ? String(dock) : '0'
}

export function parseDockText(value: string): number | undefined {
  const text = value.trim()
  if (text.length === 0) return 0
  const parsed = Number(text)
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 12 ? parsed : undefined
}

export function withConnectionEndpoint(
  endpoint: WorkflowDesignLineEndpoint,
  nodeId: string,
  handle: string | null | undefined,
): WorkflowDesignLineEndpoint {
  const { dock: _dock, ...rest } = endpoint
  const dock = dockFromHandle(handle)
  return {
    ...rest,
    nodeId,
    modelId: rest.modelId.trim().length > 0 ? rest.modelId : '$workflow',
    memberName: rest.memberName.trim().length > 0 ? rest.memberName : 'value',
    dock: dock ?? 0,
  }
}

export function createEditorLineEndpoint(command: EditorLineEndpointCommand): WorkflowDesignLineEndpoint {
  const { nodeId, modelId, memberName, dockText } = command
  const dock = parseDockText(dockText)
  return {
    nodeId,
    modelId,
    memberName,
    dock: dock ?? 0,
  }
}

export function isSameLineEndpoint(left: WorkflowDesignLineEndpoint, right: WorkflowDesignLineEndpoint): boolean {
  return left.nodeId === right.nodeId
    && left.modelId === right.modelId
    && left.memberName === right.memberName
    && (left.dock ?? 0) === (right.dock ?? 0)
}

export function flowId(graphView: WorkflowDesignGraphView): string {
  return `workflow-flow-${graphView.key.replace(/[^\w-]/gu, '-')}`
}

export function resolvedLineDocks(line: WorkflowDesignLineView): Readonly<{ source: number; target: number }> {
  const sourceCandidates = outputDockDefinitions.map(dock => dock.id)
  const targetCandidates = inputDockDefinitions.map(dock => dock.id)
  const fixedSource = sourceCandidates.includes(line.from.dock ?? 0) ? line.from.dock : undefined
  const fixedTarget = targetCandidates.includes(line.to.dock ?? 0) ? line.to.dock : undefined
  const sources = fixedSource === undefined ? sourceCandidates : [fixedSource]
  const targets = fixedTarget === undefined ? targetCandidates : [fixedTarget]
  let best = { source: sources[0] ?? 5, target: targets[0] ?? 2, distance: Number.POSITIVE_INFINITY }
  for (const source of sources) {
    for (const target of targets) {
      const sourcePoint = workflowDockPoint(line.fromNode, source)
      const targetPoint = workflowDockPoint(line.toNode, target)
      const distance = Math.hypot(sourcePoint.x - targetPoint.x, sourcePoint.y - targetPoint.y)
      if (distance < best.distance) best = { source, target, distance }
    }
  }
  return { source: best.source, target: best.target }
}

export function workflowDockPoint(node: WorkflowDesignLineView['fromNode'], dock: number): WorkflowDesignLineControlPoint {
  const x = node?.position?.x ?? 0
  const y = node?.position?.y ?? 0
  const quarterX = WORKFLOW_NODE_WIDTH / 4
  const quarterY = WORKFLOW_NODE_HEIGHT / 4
  if (dock >= 1 && dock <= 3) return { x: x + quarterX * dock, y }
  if (dock >= 4 && dock <= 6) return { x: x + WORKFLOW_NODE_WIDTH, y: y + quarterY * (dock - 3) }
  if (dock >= 7 && dock <= 9) return { x: x + quarterX * (10 - dock), y: y + WORKFLOW_NODE_HEIGHT }
  return { x, y: y + quarterY * (dock - 9) }
}

export function workflowControlEdgePath(edge: WorkflowControlEdgeSlot): string {
  const points = [
    { x: edge.sourceX, y: edge.sourceY },
    ...edge.data.controlPoints,
    { x: edge.targetX, y: edge.targetY },
  ]
  if (edge.data.lineType === 'straight') return polylinePath(points)
  if (edge.data.lineType === 'bezier') return smoothControlPointPath(points)
  return orthogonalControlPointPath(points)
}

export function polylinePath(points: readonly WorkflowDesignLineControlPoint[]): string {
  const first = points[0]
  if (first === undefined) return ''
  return `M ${first.x} ${first.y}${points.slice(1).map(point => ` L ${point.x} ${point.y}`).join('')}`
}

export function orthogonalControlPointPath(points: readonly WorkflowDesignLineControlPoint[]): string {
  const first = points[0]
  if (first === undefined) return ''
  let path = `M ${first.x} ${first.y}`
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]
    const point = points[index]
    if (previous === undefined || point === undefined) continue
    const middleY = (previous.y + point.y) / 2
    path += ` L ${previous.x} ${middleY} L ${point.x} ${middleY} L ${point.x} ${point.y}`
  }
  return path
}

export function smoothControlPointPath(points: readonly WorkflowDesignLineControlPoint[]): string {
  const first = points[0]
  if (first === undefined) return ''
  if (points.length < 3) {
    const last = points[points.length - 1]
    if (last === undefined) return ''
    const middleY = (first.y + last.y) / 2
    return `M ${first.x} ${first.y} C ${first.x} ${middleY}, ${last.x} ${middleY}, ${last.x} ${last.y}`
  }
  let path = `M ${first.x} ${first.y}`
  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index]
    const next = points[index + 1]
    if (point === undefined || next === undefined) continue
    path += ` Q ${point.x} ${point.y} ${(point.x + next.x) / 2} ${(point.y + next.y) / 2}`
  }
  const previous = points[points.length - 2]
  const last = points[points.length - 1]
  return previous === undefined || last === undefined ? path : `${path} Q ${previous.x} ${previous.y} ${last.x} ${last.y}`
}

export function workflowEdgeStatusPoint(edge: WorkflowControlEdgeSlot): WorkflowDesignLineControlPoint {
  const middle = edge.data.controlPoints[Math.floor(edge.data.controlPoints.length / 2)]
  return middle ?? { x: (edge.sourceX + edge.targetX) / 2, y: (edge.sourceY + edge.targetY) / 2 }
}

export function workflowRuntimeStatusIcon(status: WorkflowLineRuntimeStatus): string {
  if (status === 'running') return '▶'
  if (status === 'completed') return '✓'
  if (status === 'failed') return '!'
  if (status === 'skipped') return '–'
  return ''
}

export function nearestLineSegmentIndex(
  points: readonly WorkflowDesignLineControlPoint[],
  point: WorkflowDesignLineControlPoint,
): number {
  let bestIndex = 0
  let bestDistance = Number.POSITIVE_INFINITY
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index]
    const end = points[index + 1]
    if (start === undefined || end === undefined) continue
    const distance = pointToLineSegmentDistance(point, start, end)
    if (distance < bestDistance) {
      bestDistance = distance
      bestIndex = index
    }
  }
  return bestIndex
}

export function pointToLineSegmentDistance(
  point: WorkflowDesignLineControlPoint,
  start: WorkflowDesignLineControlPoint,
  end: WorkflowDesignLineControlPoint,
): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y)
  const ratio = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(point.x - (start.x + ratio * dx), point.y - (start.y + ratio * dy))
}

export function flowDefaultViewport(graphView: WorkflowDesignGraphView): ViewportTransform {
  const vp = graphView.graph.viewport
  return {
    x: vp?.x ?? 0,
    y: vp?.y ?? 0,
    zoom: vp?.zoom ?? 1,
  }
}

export function workflowFlowConnectionId(line: WorkflowDesignLineView): string {
  return line.key
}

export function nodeKeyboardMoveDelta(event: KeyboardEvent): { x: number; y: number } | null {
  const step = event.shiftKey ? NODE_KEYBOARD_FAST_MOVE_STEP : NODE_KEYBOARD_MOVE_STEP
  if (event.key === 'ArrowLeft') return { x: -step, y: 0 }
  if (event.key === 'ArrowRight') return { x: step, y: 0 }
  if (event.key === 'ArrowUp') return { x: 0, y: -step }
  if (event.key === 'ArrowDown') return { x: 0, y: step }
  return null
}

export function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.closest('input, textarea, select, button, [contenteditable="true"]') !== null
}
