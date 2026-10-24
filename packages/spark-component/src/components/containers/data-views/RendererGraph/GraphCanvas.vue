<!--
@module @spark-appworks/spark-component:components/containers/data-views/RendererGraph/GraphCanvas
职责：绘制授权后的节点、连线和布局，发送带版本的交互事件。
边界：内部绘图实现，不读取DataSet、不执行保存或推导数据权限。
AI用途：业务页使用RendererGraph绑定视图，此组件仅用于数据容器内部。
-->
<template>
  <div ref="canvasElement" class="graph-canvas" :class="{'graph-canvas--dots': props.backgroundPattern === 'dots'}" data-testid="graph-canvas">
    <VueFlow
      :id="flowId"
      :nodes="flowNodes"
      :edges="flowEdges"
      :nodes-draggable="interactive && (props.draggableIds?.length ?? 1) > 0"
      :nodes-connectable="interactive && props.connectable !== false"
      :edges-updatable="false"
      :elements-selectable="interactive"
      :nodes-focusable="interactive"
      :edges-focusable="interactive"
      :select-nodes-on-drag="false"
      :connect-on-click="false"
      :delete-key-code="null"
      :selection-key-code="null"
      :multi-selection-key-code="null"
      :fit-view-on-init="false"
      :min-zoom="0.2"
      :max-zoom="2"
      :zoom-on-double-click="false"
      @node-click="onNodeClick"
      @node-double-click="onNodeDoubleClick"
      @edge-click="onEdgeClick"
      @edge-double-click="onEdgeDoubleClick"
      @node-drag-start="onNodeDragStart"
      @node-drag="onNodeDrag"
      @node-drag-stop="onNodeDragStop"
      @connect="onConnect"
    >
      <template #node-graph-node="{ data, id }">
        <article class="graph-node" :class="[{'graph-node--connectable': canConnect(id), 'graph-node--card': props.nodeAppearance === 'card'}, data.badge ? `graph-node--${data.badge.tone}` : '']">
          <Handle type="target" :position="Position.Left" :connectable="canConnect(id)" />
          <div v-if="data.caption || data.badge" class="graph-node__meta">
            <span v-if="data.caption" class="graph-node__caption" :title="data.caption">{{ data.caption }}</span>
            <span v-if="data.badge" class="graph-node__badge">{{ data.badge.label }}</span>
          </div>
          <strong class="graph-node__title" :title="data.title">{{ data.title }}</strong>
          <span class="graph-node__description" :title="data.description">{{ data.description }}</span>
          <Handle type="source" :position="Position.Right" :connectable="canConnect(id)" />
        </article>
      </template>
      <template #edge-graph-edge="edge">
        <BaseEdge :id="edge.id" :path="edgePath(edge)" :marker-end="edge.markerEnd" :style="edge.style" />
      </template>
    </VueFlow>
    <div v-if="props.viewportControls !== false" class="graph-canvas__controls" aria-label="画布视口">
      <button type="button" aria-label="放大画布" title="放大画布" @click="flow.zoomIn()">＋</button>
      <button type="button" aria-label="缩小画布" title="缩小画布" @click="flow.zoomOut()">−</button>
      <button type="button" aria-label="适应画布" title="适应画布" @click="fitView()">适应</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, ref, watch } from 'vue'
import { BaseEdge, getSmoothStepPath, Handle, Position, VueFlow, useVueFlow } from '@vue-flow/core'
import type { Edge, EdgeProps, Node } from '@vue-flow/core'
import type { GraphCanvasProps, GraphCanvasPoint, GraphCanvasNode } from './GraphCanvas.types'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'

type GraphFlowNodeData = Pick<GraphCanvasNode, 'title' | 'description' | 'caption' | 'badge'>
type GraphFlowEdgeData = Readonly<{ pointsList?: readonly GraphCanvasPoint[] }>
/** 节点拖动时同步移动的连线路径。 */
type MovedEdge = {
  /** 当前图内的关系绘图身份。 */
  id: string
  /** 更新后的折线路径，保留固定端点。 */
  pointsList: GraphCanvasPoint[]
}
type DragStart = {contextKey: string; id: string; x: number; y: number}
type DragNodeEvent = {node: {id: string; position: {x: number; y: number}}}
type GraphNodeEvent = {node: {id: string}}
type GraphEdgeEvent = {edge: {id: string}}
type GraphConnectionEvent = {source?: string | null; target?: string | null}
type MoveOptions = {points: readonly GraphCanvasPoint[]; dx: number; dy: number; side: 'start' | 'end' | 'both'}

const props = withDefaults(defineProps<GraphCanvasProps>(), {viewportControls: true})
const emit = defineEmits<{
  select: [payload: {contextKey: string; type: 'node' | 'edge'; id: string; open: boolean}]
  move: [payload: {contextKey: string; id: string; x: number; y: number; edges: MovedEdge[]}]
  connect: [payload: {contextKey: string; source: string; target: string}]
}>()
const instance = getCurrentInstance()
if (!instance) throw new Error('GraphCanvas requires a Vue component instance')
const flowId = `graph-canvas-${instance.uid}`
const flow = useVueFlow(flowId)
const canvasElement = ref<HTMLElement>()
const nodeBounds = computed(() => {
  if (!props.nodes.length) return undefined
  const xs = props.nodes.map(node => node.x), ys = props.nodes.map(node => node.y)
  const left = Math.min(...xs), top = Math.min(...ys)
  return {x: left - 116, y: top - 60, width: Math.max(...xs) - left + 232, height: Math.max(...ys) - top + 120}
})
function center(): Promise<boolean> {
  const bounds = nodeBounds.value
  return bounds ? flow.setCenter(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2, {zoom: flow.getViewport().zoom}) : Promise.resolve(false)
}
function fitView(): Promise<boolean> {
  // The fixed-size authorized projection is ready before VueFlow measures
  // newly keyed nodes after a layout change. Fit that same projection.
  return nodeBounds.value ? flow.fitBounds(nodeBounds.value, {padding: 0.1}) : Promise.resolve(false)
}
defineExpose({
  selectCurrent,
  center,
  fitView,
  zoomIn: () => flow.zoomIn(),
  zoomOut: () => flow.zoomOut(),
  width: () => canvasElement.value?.getBoundingClientRect().width ?? 0,
})
const interactive = computed(() => Boolean(props.contextKey) && props.disabled === false)
const previewEdges = ref<MovedEdge[] | null>(null)
let dragStart: DragStart | null = null

function movedPoints({points, dx, dy, side}: MoveOptions): GraphCanvasPoint[] {
  const next = points.map(point => ({...point}))
  if (side === 'both') return next.map(point => ({...point, x: point.x + dx, y: point.y + dy}))
  const index = side === 'start' ? 0 : next.length - 1
  const adjacentIndex = side === 'start' ? 1 : next.length - 2
  const endpoint = next[index]
  const adjacent = next[adjacentIndex]
  if (!endpoint || !adjacent) return next
  const moved = {...endpoint, x: endpoint.x + dx, y: endpoint.y + dy}
  next[index] = moved
  if (next.length === 2) {
    if (moved.x !== adjacent.x && moved.y !== adjacent.y) {
      const bend = {x: moved.x, y: adjacent.y}
      next.splice(1, 0, bend)
    }
    return next
  }
  if (Math.abs(endpoint.x - adjacent.x) < 0.01) next[adjacentIndex] = {...adjacent, x: adjacent.x + dx}
  else if (Math.abs(endpoint.y - adjacent.y) < 0.01) next[adjacentIndex] = {...adjacent, y: adjacent.y + dy}
  else next[adjacentIndex] = {...adjacent, x: adjacent.x + dx, y: adjacent.y + dy}
  return next
}

function movedEdges(id: string, dx: number, dy: number): MovedEdge[] {
  return props.edges.flatMap(edge => {
    const points = edge.pointsList
    if (!points || points.length < 2 || (edge.source !== id && edge.target !== id)) return []
    const side = edge.source === id && edge.target === id ? 'both' : edge.source === id ? 'start' : 'end'
    return [{id: edge.id, pointsList: movedPoints({points, dx, dy, side})}]
  })
}

function dragPosition(event: DragNodeEvent) {
  return {id: event.node.id, x: event.node.position.x + 116, y: event.node.position.y + 60}
}

function onNodeDragStart(event: DragNodeEvent) {
  if (!interactive.value || !props.contextKey) return
  if (props.draggableIds && !props.draggableIds.includes(event.node.id)) return
  const node = props.nodes.find(item => item.id === event.node.id)
  if (node) dragStart = {contextKey: props.contextKey, id: node.id, x: node.x, y: node.y}
}

function onNodeDrag(event: DragNodeEvent) {
  if (!dragStart || !interactive.value || dragStart.contextKey !== props.contextKey || dragStart.id !== event.node.id) return
  const position = dragPosition(event)
  previewEdges.value = movedEdges(position.id, position.x - dragStart.x, position.y - dragStart.y)
}

function onNodeDragStop(event: DragNodeEvent) {
  const start = dragStart
  dragStart = null
  previewEdges.value = null
  if (!start || !interactive.value || start.contextKey !== props.contextKey || start.id !== event.node.id) return
  const position = dragPosition(event)
  const dx = position.x - start.x
  const dy = position.y - start.y
  if (!Number.isFinite(position.x) || !Number.isFinite(position.y) || (dx === 0 && dy === 0)) return
  emit('move', {contextKey: start.contextKey, id: start.id, x: position.x, y: position.y, edges: movedEdges(start.id, dx, dy)})
  void nextTick(() => flow.setNodes(flowNodes.value))
}

function syncSelection(contextKey: string): boolean {
  if (!interactive.value || props.contextKey !== contextKey || !flow.vueFlowRef.value) return false
  flow.setNodes(flowNodes.value)
  flow.setEdges(flowEdges.value)
  return true
}
async function selectCurrent(): Promise<boolean> {
  const contextKey = props.contextKey, selectedId = props.selectedId
  if (!interactive.value || !contextKey) return false
  await nextTick()
  return props.selectedId === selectedId && syncSelection(contextKey)
}
function select(type: 'node' | 'edge', id: string, open: boolean) {
  if (!interactive.value || !props.contextKey || !id) return
  const contextKey = props.contextKey
  emit('select', {contextKey, type, id, open})
  // VueFlow applies its own highlight before the owner accepts or cancels.
  // Reconcile from the controlled selection, including a cancelled switch.
  void nextTick(() => syncSelection(contextKey))
}
function onNodeClick(event: GraphNodeEvent) { select('node', event.node.id, false) }
function onNodeDoubleClick(event: GraphNodeEvent) { select('node', event.node.id, true) }
function onEdgeClick(event: GraphEdgeEvent) { select('edge', event.edge.id, false) }
function onEdgeDoubleClick(event: GraphEdgeEvent) { select('edge', event.edge.id, true) }
function canConnect(id: string): boolean {
  return interactive.value && props.connectable !== false && (!props.connectableIds || props.connectableIds.includes(id))
}
function onConnect(connection: GraphConnectionEvent) {
  if (props.contextKey && connection.source && connection.target && canConnect(connection.source) && canConnect(connection.target)
    && props.nodes.some(node => node.id === connection.source) && props.nodes.some(node => node.id === connection.target)) {
    emit('connect', {contextKey: props.contextKey, source: connection.source, target: connection.target})
  }
}

const graphCanFit = computed(() => {
  const dimensions = flow.dimensions.value
  const viewportInitialized = flow.viewportHelper.value.viewportInitialized
  const nodes = flow.nodes.value
  const nodesMeasured = nodes.length > 0 && nodes.every(node => node.dimensions.width && node.dimensions.height)
  const element = flow.vueFlowRef.value
  const bounds = element?.getBoundingClientRect()
  return Boolean(dimensions.width && dimensions.height && viewportInitialized && nodesMeasured
    && bounds?.width && bounds.height)
})
let hasInitialFit = false
let fitting = false
watch(graphCanFit, async canFit => {
  if (!canFit || hasInitialFit || fitting) return
  fitting = true
  try {
    await nextTick()
    const element = flow.vueFlowRef.value
    const bounds = element?.getBoundingClientRect()
    const didFit = bounds?.width && bounds.height ? await fitView() : false
    hasInitialFit = didFit
  } finally {
    fitting = false
  }
}, { flush: 'post', immediate: true })

const flowNodes = computed<Node<GraphFlowNodeData>[]>(() => props.nodes.map(node => ({
  id: node.id,
  type: 'graph-node',
  position: { x: node.x - 116, y: node.y - 60 },
  width: 232,
  height: 120,
  sourcePosition: Position.Right,
  targetPosition: Position.Left,
  draggable: interactive.value && (!props.draggableIds || props.draggableIds.includes(node.id)),
  selectable: interactive.value,
  connectable: canConnect(node.id),
  deletable: false,
  focusable: false,
  selected: props.selectedId === node.id,
  data: { title: node.title, description: node.description, ...(node.caption !== undefined ? {caption: node.caption} : {}), ...(node.badge ? {badge: node.badge} : {}) },
})))

const flowEdges = computed<Edge<GraphFlowEdgeData>[]>(() => props.edges.map(edge => ({
  id: edge.id,
  type: 'graph-edge',
  source: edge.source,
  target: edge.target,
  selectable: interactive.value,
  focusable: interactive.value,
  selected: props.selectedId === edge.id,
  updatable: false,
  data: edge.pointsList === undefined ? {} : {
    pointsList: (previewEdges.value?.find(item => item.id === edge.id)?.pointsList ?? edge.pointsList).map(point => ({ x: point.x, y: point.y })),
  },
})))

watch(() => [props.contextKey, props.disabled], () => {
  dragStart = null
  previewEdges.value = null
  // Both endpoints and edges carry the binding revision. VueFlow may pause
  // either prop watcher during an interaction; restore nodes before edges.
  flow.setNodes(flowNodes.value)
  flow.setEdges(flowEdges.value)
}, {flush: 'post'})

function edgePath(edge: EdgeProps<GraphFlowEdgeData>): string {
  const points = edge.data.pointsList
  if (points !== undefined) {
    return points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`).join(' ')
  }
  return getSmoothStepPath({ sourceX: edge.sourceX, sourceY: edge.sourceY, sourcePosition: edge.sourcePosition,
    targetX: edge.targetX, targetY: edge.targetY, targetPosition: edge.targetPosition })[0]
}
</script>

<style scoped>
.graph-canvas {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--el-border-color-light, #e4e7ed);
  border-radius: 6px;
  background: var(--el-bg-color, #fff);
}
.graph-canvas--dots {
  background-color: var(--el-bg-color, #fff);
  background-image: radial-gradient(circle, var(--el-border-color, #dcdfe6) 1px, transparent 1.2px);
  background-position: 10px 10px;
  background-size: 20px 20px;
}

:deep(.vue-flow) {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.graph-node {
  position: relative;
  display: flex;
  width: 232px;
  height: 120px;
  flex-direction: column;
  justify-content: center;
  gap: 8px;
  box-sizing: border-box;
  padding: 14px 16px;
  overflow: hidden;
  border: 1px solid var(--el-border-color, #dcdfe6);
  border-radius: 6px;
  background: var(--el-bg-color, #fff);
}

.graph-node__title,
.graph-node__description {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.graph-node__title { color: var(--el-text-color-primary, #303133); }
.graph-node__description { color: var(--el-text-color-secondary, #909399); font-size: 12px; }
.graph-node__meta {display:flex; align-items:center; justify-content:space-between; gap:8px; font-size:11px; color:var(--el-text-color-secondary);}
.graph-node__caption {overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
.graph-node__badge {flex:none; padding:2px 6px; border-radius:4px; background:var(--el-fill-color-light);}
.graph-node--primary {border-left:4px solid var(--el-color-primary); background:var(--el-color-primary-light-9);}
.graph-node--primary .graph-node__badge {color:var(--el-color-primary); background:var(--el-color-primary-light-8);}
.graph-node--success {border-left:4px solid var(--el-color-success);}
.graph-node--success .graph-node__badge {color:var(--el-color-success); background:var(--el-color-success-light-9);}
.graph-node--warning {border-left:4px solid var(--el-color-warning);}
.graph-node--warning .graph-node__badge {color:var(--el-color-warning); background:var(--el-color-warning-light-9);}
.graph-node--info {border-left:4px solid var(--el-color-info);}
.graph-node--danger {border-left:4px solid var(--el-color-danger); background:var(--el-color-danger-light-9);}
.graph-node--danger .graph-node__badge {color:var(--el-color-danger); background:var(--el-color-danger-light-8);}
.graph-node--card {
  justify-content: flex-start;
  gap: 0;
  padding: 0;
  border-radius: 16px;
}
.graph-node--card .graph-node__meta {
  min-height: 18px;
  font-size: 11px;
}
.graph-node--card .graph-node__title {
  display: -webkit-box;
  margin-top: 4px;
  font-size: 16px;
  font-weight: 600;
  line-height: 20px;
  white-space: normal;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.graph-node--card .graph-node__description {
  flex: 1;
  min-height: 0;
  padding: 8px 14px 10px;
  white-space: normal;
  line-height: 16px;
}
.graph-node--card:not(.graph-node--connectable) {overflow: hidden;}
.graph-node--card::before {
  position: absolute;
  inset: 1px 1px auto;
  height: 76px;
  border-radius: 15px 15px 0 0;
  background: var(--el-fill-color-lighter, #f5f7fa);
  pointer-events: none;
  content: '';
}
.graph-node--card .graph-node__meta,
.graph-node--card .graph-node__title {
  z-index: 1;
  margin-right: 14px;
  margin-left: 14px;
}
.graph-node--card .graph-node__meta {margin-top: 10px;}
.graph-node--card .graph-node__description {z-index: 1;}
.graph-canvas__controls {position:absolute; bottom:16px; left:16px; z-index:5; display:flex; border:1px solid var(--el-border-color); border-radius:6px; overflow:hidden; box-shadow:var(--el-box-shadow-light);}
.graph-canvas__controls button {border:0; border-right:1px solid var(--el-border-color); background:var(--el-bg-color); color:var(--el-text-color-primary); padding:8px 12px; cursor:pointer; font-size:14px;}
.graph-canvas__controls button:last-child {border-right:0;}
.graph-canvas__controls button:hover {background:var(--el-fill-color-light);}
:deep(.vue-flow__handle) { opacity: 0; pointer-events: none; }
.graph-node--connectable {overflow: visible;}
:deep(.graph-node--connectable > .vue-flow__handle) {opacity: 1; pointer-events: all; width: 10px; height: 10px; background: var(--el-color-primary, #409eff);}
.graph-node--card > :deep(.vue-flow__handle) {z-index: 2;}
</style>
