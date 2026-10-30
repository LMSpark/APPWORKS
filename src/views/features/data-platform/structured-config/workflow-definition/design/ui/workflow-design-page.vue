<!--
@module app:views/features/data-platform/structured-config/workflow-definition/design/ui/workflow-design-page
-->
<template>
  <section class="structured-editor-page">
    <header><h1>数据工作流设计</h1><p v-if="workflowId">工作流 ID：{{ workflowId }}</p></header>
    <p v-if="loading" role="status">正在读取工作流设计…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="ready">
      <WorkflowDesignNodePanel v-model="nodes" :disabled="busy" />
      <WorkflowDesignEdgePanel v-model="connectors" :disabled="busy" />
      <RendererButton label="保存设计" button-type="primary" :disabled="busy" @click="save" />
    </template>
  </section>
</template>

<script setup lang="ts">
import {computed} from 'vue'
import {useRoute} from 'vue-router'
import {RendererButton} from '@spark-appworks/spark-component'
import {isRecord} from '@spark-appworks/spark-utils'
import {WORKFLOW_DESIGN_INPUT, WORKFLOW_DESIGN_VIEW} from '@/lowcode/resources/structured-config/workflow-definition/design-ops'
import {LowcodeWorkflowDefinition} from '@/lowcode/resources/structured-config/workflow-definition/resource'
import {useStagedDesignPage} from '@/views/features/data-platform/shared/model/use-staged-design-page'
import WorkflowDesignEdgePanel from './edge-panel/workflow-design-edge-panel.vue'
import WorkflowDesignNodePanel from './node-panel/workflow-design-node-panel.vue'

const route = useRoute()
const scenarioId = computed(() => typeof route.meta['blueprintScenarioId'] === 'string' ? route.meta['blueprintScenarioId'] : '')
const workflowId = computed(() => typeof route.query['workflowId'] === 'string' ? route.query['workflowId'] : '')
const {designView, loading, ready, busy, error, saveChanges, updateDesignField} = useStagedDesignPage({
  pageId: 'workflow-design-page',
  scenarioId,
  scopeId: workflowId,
  scopeInputTable: WORKFLOW_DESIGN_INPUT,
  scopeField: 'workflowId',
  designViewTable: WORKFLOW_DESIGN_VIEW,
  loadDataSet: id => LowcodeWorkflowDefinition.loadEditor(id),
  missingScopeMessage: '缺少 workflowId 参数',
})
const designDoc = computed((): {nodes?: unknown; connectors?: unknown} => {
  try {
    const parsed: unknown = JSON.parse(String(designView.value?.rows[0]?.['designJson'] ?? '{}'))
    return isRecord(parsed) ? {nodes: parsed['nodes'], connectors: parsed['connectors']} : {}
  } catch {return {nodes: [], connectors: []}}
})
function writeDoc(nodes: unknown, connectors: unknown): void {
  updateDesignField(designView.value, 'designJson', JSON.stringify({nodes, connectors}, null, 2))
}
const nodes = computed({
  get: () => designDoc.value.nodes ?? [],
  set: value => writeDoc(value, connectors.value),
})
const connectors = computed({
  get: () => designDoc.value.connectors ?? [],
  set: value => writeDoc(nodes.value, value),
})
async function save(): Promise<void> {await saveChanges()}
</script>

<style scoped>
.structured-editor-page { display: grid; gap: 12px; padding: 24px; }
</style>
