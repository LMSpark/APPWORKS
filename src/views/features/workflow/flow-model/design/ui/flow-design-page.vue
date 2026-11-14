<!--
@module app:views/features/workflow/flow-model/design/ui/flow-design-page
职责：按目标模型 rowid 打开流程设计工作区，只读 RendererGraph + 节点/边列表。
边界：消费父 PAGE_RUNTIME；布局来自 DesignJson 投影；编辑/保存待 FlowDesign 资源接回。
-->
<template>
  <RendererSection class="flow-design-page" :bordered="false" :grid-columns="1" :grid-gap="12"
    :status="loading ? '正在打开流程设计…' : ''" :error="error" :retryable="!loading && !ready" @retry="load">
    <template v-if="ready && prepared">
      <DisplayAlert alert-type="info" :closable="false" :show-icon="true" :title="`设计目标：${prepared.modelTitle}`" />
      <DisplayAlert alert-type="info" :closable="false" :show-icon="true"
        title="流程图为只读预览（RendererGraph）；节点属性编辑与保存仍待专用合同接回。" />
      <RendererGraph class="flow-design-page__graph" :data-view-key="prepared.nodeViewKey"
        :edge-data-view-key="prepared.edgeViewKey" label-field="TITLE" description-field="MEMO"
        node-caption-field="NODETYPE" edge-source-field="PARENTID" edge-target-field="CHILDID"
        :node-positions="prepared.graphLayout.nodePositions" :edge-paths="prepared.graphLayout.edgePaths"
        :current="graphSelection" background-pattern="dots" node-appearance="card"
        :viewport-controls="true" :disabled="true" @select="onGraphSelect" />
      <div class="flow-design-page__tables">
        <FlowDesignNodePanel :view-key="prepared.nodeViewKey" :highlight-id="nodeHighlightId" />
        <FlowDesignEdgePanel :view-key="prepared.edgeViewKey" :highlight-id="edgeHighlightId" />
      </div>
    </template>
  </RendererSection>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, shallowRef, watch} from 'vue'
import type {GraphSelection} from '@spark-appworks/spark-component'
import * as SparkComponent from '@spark-appworks/spark-component'
import {prepareFlowDesignViews, type FlowDesignPreparedViews} from '@/lowcode/resources/system/workflow/manage'

const {DisplayAlert, PAGE_RUNTIME, RendererGraph, RendererSection, useSparkComponent} = SparkComponent
import FlowDesignNodePanel from './node-panel/flow-design-node-panel.vue'
import FlowDesignEdgePanel from './edge-panel/flow-design-edge-panel.vue'

const props = defineProps<{flowModelId: string}>()
const flowModelId = computed(() => String(props.flowModelId ?? '').trim())
const {sparkConsume} = useSparkComponent({type: 'flow-design-page'})
const ready = ref(false), loading = ref(false), error = ref('')
const prepared = shallowRef<FlowDesignPreparedViews>()
const graphSelection = ref<Readonly<{kind: 'node' | 'edge'; id: string | number}> | null>(null)
const nodeHighlightId = computed(() => graphSelection.value?.kind === 'node' ? graphSelection.value.id : null)
const edgeHighlightId = computed(() => graphSelection.value?.kind === 'edge' ? graphSelection.value.id : null)
let generation = 0

function onGraphSelect(event: GraphSelection): void {
  graphSelection.value = {kind: event.kind, id: event.id}
}

async function load(): Promise<void> {
  const own = ++generation
  ready.value = false
  loading.value = true
  error.value = ''
  prepared.value = undefined
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