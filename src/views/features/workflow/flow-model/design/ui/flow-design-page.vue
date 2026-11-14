<!--
@module app:views/features/workflow/flow-model/design/ui/flow-design-page
职责：按目标模型 rowid 打开流程设计工作区（节点/边面板占位）。
边界：设计场景 6E462；节点与边编辑分别由子面板承接，保存走 spark-data。
-->
<template>
  <RendererSection class="flow-design-page" :bordered="false" :grid-columns="2" :grid-gap="12"
    :status="loading ? '正在打开流程设计…' : ''" :error="error" :retryable="!loading && !ready" @retry="load">
    <template v-if="ready">
      <DisplayAlert alert-type="info" :closable="false" :show-icon="true" :title="`设计目标：${targetTitle}`" />
      <FlowDesignNodePanel :flow-model-id="flowModelId" />
      <FlowDesignEdgePanel :flow-model-id="flowModelId" />
    </template>
  </RendererSection>
</template>

<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {DisplayAlert, RendererSection} from '@spark-appworks/spark-component'
import {assertFlowDesignTarget, FLOW_DESIGN_SCENARIO_ID} from '@/lowcode/resources/system/workflow/manage'
import {useFeaturePageRuntime} from '@/views/features/shared/runtime/use-feature-page-runtime'
import FlowDesignNodePanel from './node-panel/flow-design-node-panel.vue'
import FlowDesignEdgePanel from './edge-panel/flow-design-edge-panel.vue'

const props = defineProps<{flowModelId: string}>()
const flowModelId = computed(() => assertFlowDesignTarget({flowModelId: props.flowModelId}))
const {ready, loading, error, loadCurrentRoute, session} = useFeaturePageRuntime({
  scenarioId: FLOW_DESIGN_SCENARIO_ID,
  navigationId: FLOW_DESIGN_SCENARIO_ID,
  modelName: 'WFM_FLOW_MODLE',
  componentType: 'flow-design-page',
  title: '流程设计',
  optionModels: ['WFM_FLOW_NODE', 'WFM_NODE_REALATION'],
  queryContext: () => ({FLOWID: flowModelId.value, rowid: flowModelId.value}),
})
const targetTitle = ref(flowModelId.value)

async function load(): Promise<void> {
  await loadCurrentRoute()
  const view = session.runtime?.getDataSet(FLOW_DESIGN_SCENARIO_ID)?.getView('WFM_FLOW_MODLE', 'default')
  const row = view?.rows[0]
  const title = row && typeof row['TITLE'] === 'string' ? row['TITLE'] : flowModelId.value
  targetTitle.value = title
}
watch(flowModelId, load, {immediate: true})
</script>

<style scoped>
.flow-design-page {min-height: 420px; padding: 8px}
</style>