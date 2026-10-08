<template>
  <div class="data-space-design-graph" data-testid="data-space-design-graph">
    <VueFlow
      :id="flowId"
      :nodes="flowNodes"
      :edges="flowEdges"
      :nodes-draggable="interactive"
      :nodes-connectable="interactive"
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
      <template #node-data-space-model-preview="{ data }">
        <article class="data-space-model-node">
          <Handle type="target" :position="Position.Left" :connectable="interactive" />
          <strong class="data-space-model-node__title">{{ data.title }}</strong>
          <span class="data-space-model-node__description">{{ data.description }}</span>
          <Handle type="source" :position="Position.Right" :connectable="interactive" />
        </article>
      </template>
      <template #edge-data-space-preview="edge">
        <BaseEdge :id="edge.id" :path="edgePath(edge)" :marker-end="edge.markerEnd" :style="edge.style" />
      </template>
    </VueFlow>
  </div>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, ref, watch } from 'vue'
import { BaseEdge, getSmoothStepPath, Handle, Position, VueFlow, useVueFlow } from '@vue-flow/core'
import type { Edge, EdgeProps, Node } from '@vue-flow/core'
import type { DataSpaceDesignGraphProps, DataSpaceDesignGraphPoint } from './DataSpaceDesignGraph.props'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'

type DataSpaceFlowNodeData = Readonly<{ title: string; description: string }>
type DataSpaceFlowEdgeData = Readonly<{ pointsList?: readonly DataSpaceDesignGraphPoint[] }>
type MovedEdge = {id: string; pointsList: DataSpaceDesignGraphPoint[]}
type DragStart = {contextKey: string; id: string; x: number; y: number}
type DragNodeEvent = {node: {id: string; position: {x: number; y: number}}}
type GraphNodeEvent = {node: {id: string}}
type GraphEdgeEvent = {edge: {id: string}}
type GraphConnectionEvent = {source?: string | null; target?: string | null}
type MoveOptions = {points: readonly DataSpaceDesignGraphPoint[]; dx: number; dy: number; side: 'start' | 'end' | 'both'}

const props = defineProps<DataSpaceDesignGraphProps>()
const emit = defineEmits<{
  select: [payload: {contextKey: string; type: 'node' | 'edge'; id: string; open: boolean}]
  move: [payload: {contextKey: string; id: string; x: number; y: number; edges: MovedEdge[]}]
  connect: [payload: {contextKey: string; source: string; target: string}]
}>()
const instance = getCurrentInstance()
if (!instance) throw new Error('DataSpaceDesignGraph requires a Vue component instance')
const flowId = `data-space-design-preview-${instance.uid}`
const flow = useVueFlow(flowId)
const interactive = computed(() => Boolean(props.contextKey) && props.disabled === false)
const previewEdges = ref<MovedEdge[] | null>(null)
let dragStart: DragStart | null = null

function movedPoints({points, dx, dy, side}: MoveOptions): DataSpaceDesignGraphPoint[] {
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

function select(type: 'node' | 'edge', id: string, open: boolean) {
  if (interactive.value && props.contextKey && id) emit('select', {contextKey: props.contextKey, type, id, open})
}
function onNodeClick(event: GraphNodeEvent) { select('node', event.node.id, false) }
function onNodeDoubleClick(event: GraphNodeEvent) { select('node', event.node.id, true) }
function onEdgeClick(event: GraphEdgeEvent) { select('edge', event.edge.id, false) }
function onEdgeDoubleClick(event: GraphEdgeEvent) { select('edge', event.edge.id, true) }
function onConnect(connection: GraphConnectionEvent) {
  if (interactive.value && props.contextKey && connection.source && connection.target) {
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
    const didFit = bounds?.width && bounds.height ? await flow.fitView() : false
    hasInitialFit = didFit
  } finally {
    fitting = false
  }
}, { flush: 'post', immediate: true })

const flowNodes = computed<Node<DataSpaceFlowNodeData>[]>(() => props.nodes.map(node => ({
  id: node.id,
  type: 'data-space-model-preview',
  position: { x: node.x - 116, y: node.y - 60 },
  width: 232,
  height: 120,
  sourcePosition: Position.Right,
  targetPosition: Position.Left,
  draggable: interactive.value && (!props.draggableIds || props.draggableIds.includes(node.id)),
  selectable: interactive.value,
  connectable: interactive.value,
  deletable: false,
  focusable: false,
  selected: props.selectedId === node.id,
  data: { title: node.title, description: node.description },
})))

const flowEdges = computed<Edge<DataSpaceFlowEdgeData>[]>(() => props.edges.map(edge => ({
  id: edge.id,
  type: 'data-space-preview',
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
  flow.setNodes(flowNodes.value)
}, {flush: 'post'})

function edgePath(edge: EdgeProps<DataSpaceFlowEdgeData>): string {
  const points = edge.data.pointsList
  if (points !== undefined) {
    return points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`).join(' ')
  }
  return getSmoothStepPath({ sourceX: edge.sourceX, sourceY: edge.sourceY, sourcePosition: edge.sourcePosition,
    targetX: edge.targetX, targetY: edge.targetY, targetPosition: edge.targetPosition })[0]
}
</script>

<style scoped>
.data-space-design-graph {
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--el-border-color-light, #e4e7ed);
  border-radius: 6px;
  background: var(--el-bg-color, #fff);
}

:deep(.vue-flow) {
  width: 100%;
  height: 100%;
}

.data-space-model-node {
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

.data-space-model-node__title,
.data-space-model-node__description {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.data-space-model-node__title { color: var(--el-text-color-primary, #303133); }
.data-space-model-node__description { color: var(--el-text-color-secondary, #909399); font-size: 12px; }
:deep(.vue-flow__handle) { opacity: 0; pointer-events: none; }
</style>
