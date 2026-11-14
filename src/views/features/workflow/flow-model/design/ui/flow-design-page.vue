<!--
@module app:views/features/workflow/flow-model/design/ui/flow-design-page
职责：按目标模型 rowid 打开流程设计工作区，可拖拽布局的 RendererGraph + 节点/边列表。
边界：消费父 PAGE_RUNTIME；布局来自 DesignJson 投影与会话内覆盖；保存走 saveFlowDesignInfo。
-->
<template>
  <RendererSection class="flow-design-page" :bordered="false" :grid-columns="1" :grid-gap="12"
    :status="loading ? '正在打开流程设计…' : ''" :error="error" :retryable="!loading && !ready" @retry="load">
    <template v-if="ready && prepared" #header-actions>
      <RendererButton label="保存设计" button-type="primary" :disabled="saving" @click="saveDesign" />
    </template>
    <template v-if="ready && prepared">
      <DisplayAlert alert-type="info" :closable="false" :show-icon="true" :title="`设计目标：${prepared.modelTitle}`" />
      <DisplayAlert alert-type="info" :closable="false" :show-icon="true"
        title="可拖动节点调整布局；保存写入 EJ2.json、DesignJson 与节点/连线表同步。" />
      <RendererGraph class="flow-design-page__graph" :data-view-key="prepared.nodeViewKey"
        :edge-data-view-key="prepared.edgeViewKey" label-field="TITLE" description-field="MEMO"
        node-caption-field="NODETYPE" edge-source-field="PARENTID" edge-target-field="CHILDID"
        :node-positions="graphLayout.nodePositions" :edge-paths="graphLayout.edgePaths"
        :draggable-keys="draggableNodeKeys" :current="graphSelection" background-pattern="dots" node-appearance="card"
        :viewport-controls="true" :disabled="false" :on-node-move="onNodeMove" @select="onGraphSelect" />
      <div class="flow-design-page__tables">
        <FlowDesignNodePanel :view-key="prepared.nodeViewKey" :highlight-id="nodeHighlightId" @select-graph-id="selectNodeFromTable" />
        <FlowDesignEdgePanel :view-key="prepared.edgeViewKey" :highlight-id="edgeHighlightId" @select-graph-id="selectEdgeFromTable" />
      </div>
    </template>
  </RendererSection>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, shallowRef, watch} from 'vue'
import type {GraphSelection} from '@spark-appworks/spark-component'
import * as SparkComponent from '@spark-appworks/spark-component'
import {
  prepareFlowDesignViews,
  saveFlowDesignInfo,
  type FlowDesignLayoutOverride,
  type FlowDesignPreparedViews,
} from '@/lowcode/resources/system/workflow/manage'
import {lowcodeDesignFileUpload} from '@/lowcode/lowcode-runtime'

const {DisplayAlert, PAGE_RUNTIME, RendererButton, RendererGraph, RendererSection, useSparkComponent} = SparkComponent
import FlowDesignNodePanel from './node-panel/flow-design-node-panel.vue'
import FlowDesignEdgePanel from './edge-panel/flow-design-edge-panel.vue'

const props = defineProps<{flowModelId: string}>()
const flowModelId = computed(() => String(props.flowModelId ?? '').trim())
const {sparkConsume} = useSparkComponent({type: 'flow-design-page'})
const ready = ref(false), loading = ref(false), saving = ref(false), error = ref('')
const prepared = shallowRef<FlowDesignPreparedViews>()
const layoutOverride = ref<FlowDesignLayoutOverride>({})
const graphSelection = ref<Readonly<{kind: 'node' | 'edge'; id: string | number}> | null>(null)
const graphLayout = computed(() => {
  const base = prepared.value?.graphLayout
  if (!base) return {nodePositions: {}, edgePaths: {}}
  return {
    nodePositions: {...base.nodePositions, ...layoutOverride.value.nodePositions},
    edgePaths: {...base.edgePaths, ...layoutOverride.value.edgePaths},
  }
})
const draggableNodeKeys = computed(() => {
  const runtime = sparkConsume(PAGE_RUNTIME)
  const key = prepared.value?.nodeViewKey
  if (!runtime || !key) return []
  const rows = runtime.resolveView(key)?.rows ?? []
  const keys: Array<string | number> = []
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue
    const id = row['rowid'] ?? row['ROWID']
    if (typeof id === 'string' && id.trim()) keys.push(id)
    else if (typeof id === 'number' && !Number.isNaN(id)) keys.push(id)
  }
  return keys
})
const nodeHighlightId = computed(() => graphSelection.value?.kind === 'node' ? graphSelection.value.id : null)
const edgeHighlightId = computed(() => graphSelection.value?.kind === 'edge' ? graphSelection.value.id : null)
let generation = 0

function onGraphSelect(event: GraphSelection): void {
  graphSelection.value = {kind: event.kind, id: event.id}
}

function selectNodeFromTable(id: string | number): void {
  graphSelection.value = {kind: 'node', id}
}

function selectEdgeFromTable(id: string | number): void {
  graphSelection.value = {kind: 'edge', id}
}

function onNodeMove(event: {id: string | number; x: number; y: number}): void {
  const id = String(event.id)
  layoutOverride.value = {
    ...layoutOverride.value,
    nodePositions: {...layoutOverride.value.nodePositions, [id]: {x: event.x, y: event.y}},
  }
}

async function load(): Promise<void> {
  const own = ++generation
  ready.value = false
  loading.value = true
  error.value = ''
  prepared.value = undefined
  layoutOverride.value = {}
  graphSelection.value = null
  try {
    const runtime = sparkConsume(PAGE_RUNTIME)
    if (!runtime) throw new Error('流程设计缺少父页运行实例')
    const next = await prepareFlowDesignViews(runtime, flowModelId.value, {assertCurrent: () => own === generation})
    if (own !== generation) return
    prepared.value = next
    ready.value = true
  } catch (cause) {
    if (own === generation) error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    if (own === generation) loading.value = false
  }
}

async function saveDesign(): Promise<void> {
  const own = ++generation
  saving.value = true
  error.value = ''
  try {
    const runtime = sparkConsume(PAGE_RUNTIME)
    if (!runtime) throw new Error('流程设计缺少父页运行实例')
    const override = layoutOverride.value
    const hasOverride = Boolean(override.nodePositions && Object.keys(override.nodePositions).length > 0)
      || Boolean(override.edgePaths && Object.keys(override.edgePaths).length > 0)
    await saveFlowDesignInfo({
      runtime,
      flowModelId: flowModelId.value,
      fileUpload: lowcodeDesignFileUpload,
      ...(hasOverride ? {layoutOverride: override} : {}),
      assertCurrent: () => own === generation,
    })
    if (own !== generation) return
    await load()
  } catch (cause) {
    if (own === generation) error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    if (own === generation) saving.value = false
  }
}

watch(flowModelId, () => { void load() }, {immediate: true})
onBeforeUnmount(() => { generation++ })
</script>

<style scoped>
.flow-design-page {min-height: 420px; padding: 8px}
.flow-design-page__graph {min-height: 360px; height: 42vh}
.flow-design-page__tables {display: grid; grid-template-columns: 1fr 1fr; gap: 12px}
@media (max-width: 960px) {
  .flow-design-page__tables {grid-template-columns: 1fr}
}
</style>