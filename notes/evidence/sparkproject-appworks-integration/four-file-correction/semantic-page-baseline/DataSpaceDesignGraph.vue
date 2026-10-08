<template>
  <div class="data-space-design-graph" data-testid="data-space-design-graph">
    <VueFlow
      :id="flowId"
      :nodes="flowNodes"
      :edges="flowEdges"
      :nodes-draggable="false"
      :nodes-connectable="false"
      :edges-updatable="false"
      :elements-selectable="false"
      :nodes-focusable="false"
      :edges-focusable="false"
      :select-nodes-on-drag="false"
      :connect-on-click="false"
      :delete-key-code="null"
      :selection-key-code="null"
      :multi-selection-key-code="null"
      :fit-view-on-init="false"
      :min-zoom="0.2"
      :max-zoom="2"
      :zoom-on-double-click="false"
    >
      <template #node-data-space-model-preview="{ data }">
        <article class="data-space-model-node">
          <Handle type="target" :position="Position.Left" :connectable="false" />
          <strong class="data-space-model-node__title">{{ data.title }}</strong>
          <span class="data-space-model-node__description">{{ data.description }}</span>
          <Handle type="source" :position="Position.Right" :connectable="false" />
        </article>
      </template>
      <template #edge-data-space-preview="edge">
        <BaseEdge :id="edge.id" :path="edgePath(edge)" :marker-end="edge.markerEnd" :style="edge.style" />
      </template>
    </VueFlow>
  </div>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, watch } from 'vue'
import { BaseEdge, getSmoothStepPath, Handle, Position, VueFlow, useVueFlow } from '@vue-flow/core'
import type { Edge, EdgeProps, Node } from '@vue-flow/core'
import type { DataSpaceDesignGraphProps, DataSpaceDesignGraphPoint } from './DataSpaceDesignGraph.props'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'

type DataSpaceFlowNodeData = Readonly<{ title: string; description: string }>
type DataSpaceFlowEdgeData = Readonly<{ pointsList?: readonly DataSpaceDesignGraphPoint[] }>

const props = defineProps<DataSpaceDesignGraphProps>()
const instance = getCurrentInstance()
if (!instance) throw new Error('DataSpaceDesignGraph requires a Vue component instance')
const flowId = `data-space-design-preview-${instance.uid}`
const flow = useVueFlow(flowId)

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
  draggable: false,
  selectable: false,
  connectable: false,
  deletable: false,
  focusable: false,
  data: { title: node.title, description: node.description },
})))

const flowEdges = computed<Edge<DataSpaceFlowEdgeData>[]>(() => props.edges.map(edge => ({
  id: edge.id,
  type: 'data-space-preview',
  source: edge.source,
  target: edge.target,
  selectable: false,
  focusable: false,
  updatable: false,
  data: edge.pointsList === undefined ? {} : {
    pointsList: edge.pointsList.map(point => ({ x: point.x, y: point.y })),
  },
})))

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
