/**
 * @module @spark-appworks/spark-component:components/containers/data-views/RendererGraph/GraphEdgeGeometry
 * 职责：关系图节点接点坐标、最近接点选择、控制点连线路径与最近线段的纯计算。
 * 边界：无状态、不读 DataView；节点几何固定为画布的 232×120 中心坐标系。
 * AI用途：排查连线接到哪个接点、控制点路径走向或双击加点落在哪段时，从本模块定位。
 */
import type {GraphCanvasPoint} from './GraphCanvas.types'
import type {GraphEdgeLineType, GraphHandle} from './RendererGraph.props'

/** 画布节点固定宽度。 */
export const GRAPH_NODE_WIDTH = 232
/** 画布节点固定高度。 */
export const GRAPH_NODE_HEIGHT = 120

/** 中心为 center 的节点上某接点的画布坐标。 */
export function graphHandlePoint(center: GraphCanvasPoint, handle: GraphHandle): GraphCanvasPoint {
  const left = center.x - GRAPH_NODE_WIDTH / 2, top = center.y - GRAPH_NODE_HEIGHT / 2
  if (handle.side === 'top') return {x: left + GRAPH_NODE_WIDTH * handle.offset, y: top}
  if (handle.side === 'bottom') return {x: left + GRAPH_NODE_WIDTH * handle.offset, y: top + GRAPH_NODE_HEIGHT}
  if (handle.side === 'left') return {x: left, y: top + GRAPH_NODE_HEIGHT * handle.offset}
  return {x: left + GRAPH_NODE_WIDTH, y: top + GRAPH_NODE_HEIGHT * handle.offset}
}

/** 选择接点的输入：两端节点中心、可选接点，以及已固定的一端。 */
export type GraphHandlePairInput = Readonly<{
  /** 起点节点中心。 */
  source: GraphCanvasPoint
  /** 终点节点中心。 */
  target: GraphCanvasPoint
  /** 起点可用的输出接点。 */
  outputs: readonly GraphHandle[]
  /** 终点可用的输入接点。 */
  inputs: readonly GraphHandle[]
  /** 已由连线记录固定的起点接点。 */
  fixedSource?: GraphHandle
  /** 已由连线记录固定的终点接点。 */
  fixedTarget?: GraphHandle
}>

/** 未固定的一端在候选接点中取两端距离最短的组合；候选为空时返回undefined。 */
export function nearestGraphHandles(input: GraphHandlePairInput): Readonly<{source: GraphHandle; target: GraphHandle}> | undefined {
  const sources = input.fixedSource ? [input.fixedSource] : input.outputs
  const targets = input.fixedTarget ? [input.fixedTarget] : input.inputs
  let best: {source: GraphHandle; target: GraphHandle; distance: number} | undefined
  for (const source of sources) {
    for (const target of targets) {
      const from = graphHandlePoint(input.source, source), to = graphHandlePoint(input.target, target)
      const distance = Math.hypot(from.x - to.x, from.y - to.y)
      if (!best || distance < best.distance) best = {source, target, distance}
    }
  }
  return best && {source: best.source, target: best.target}
}

function polyline(points: readonly GraphCanvasPoint[]): string {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`).join(' ')
}

/** 相邻点对；第一项是起点到第一个控制点。 */
function segments(points: readonly GraphCanvasPoint[]): Array<readonly [GraphCanvasPoint, GraphCanvasPoint]> {
  return points.slice(1).flatMap((point, index) => {
    const previous = points[index]
    return previous ? [[previous, point] as const] : []
  })
}

function orthogonal(points: readonly GraphCanvasPoint[]): string {
  const first = points[0]
  if (!first) return ''
  return segments(points).reduce((path, [previous, point]) => {
    const middleY = (previous.y + point.y) / 2
    return `${path} L${previous.x},${middleY} L${point.x},${middleY} L${point.x},${point.y}`
  }, `M${first.x},${first.y}`)
}

function smooth(points: readonly GraphCanvasPoint[]): string {
  const first = points[0], last = points[points.length - 1], previous = points[points.length - 2]
  if (!first || !last) return ''
  if (points.length < 3 || !previous) {
    const middleY = (first.y + last.y) / 2
    return `M${first.x},${first.y} C${first.x},${middleY} ${last.x},${middleY} ${last.x},${last.y}`
  }
  const middle = segments(points.slice(1)).reduce((path, [point, next]) =>
    `${path} Q${point.x},${point.y} ${(point.x + next.x) / 2},${(point.y + next.y) / 2}`, `M${first.x},${first.y}`)
  return `${middle} Q${previous.x},${previous.y} ${last.x},${last.y}`
}

/** 依次经过起点、控制点和终点的路径；straight为折线，bezier为平滑曲线，其余为正交折线。 */
export function graphControlPointPath(points: readonly GraphCanvasPoint[], lineType: GraphEdgeLineType | undefined): string {
  if (lineType === 'straight') return polyline(points)
  if (lineType === 'bezier') return smooth(points)
  return orthogonal(points)
}

function segmentDistance(point: GraphCanvasPoint, start: GraphCanvasPoint, end: GraphCanvasPoint): number {
  const dx = end.x - start.x, dy = end.y - start.y
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y)
  const ratio = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(point.x - (start.x + ratio * dx), point.y - (start.y + ratio * dy))
}

/** 距离 point 最近的线段序号；新控制点插在该序号处。 */
export function nearestGraphSegment(points: readonly GraphCanvasPoint[], point: GraphCanvasPoint): number {
  let bestIndex = 0, bestDistance = Number.POSITIVE_INFINITY
  for (const [index, [start, end]] of segments(points).entries()) {
    const distance = segmentDistance(point, start, end)
    if (distance < bestDistance) {bestDistance = distance; bestIndex = index}
  }
  return bestIndex
}
