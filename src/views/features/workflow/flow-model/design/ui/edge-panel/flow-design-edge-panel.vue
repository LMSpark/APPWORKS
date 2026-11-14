<!--
@module app:views/features/workflow/flow-model/design/ui/edge-panel/flow-design-edge-panel
职责：流程设计连线列表面板占位，绑定 WFM_NODE_REALATION 正式视图。
-->
<template>
  <RendererSection title="流程连线" :bordered="true" :grid-columns="1">
    <RendererTable v-if="viewKey" :data-view-key="viewKey" :children="columns" :stripe="true" :show-data-view-meta="false" />
  </RendererSection>
</template>

<script setup lang="ts">
import {buildDataViewKey, type SparkNode} from '@spark-appworks/spark-data'
import {RendererSection, RendererTable} from '@spark-appworks/spark-component'
import {FLOW_DESIGN_SCENARIO_ID} from '@/lowcode/resources/system/workflow/manage'

defineProps<{flowModelId: string}>()
const viewKey = buildDataViewKey('WFM_NODE_REALATION', 'default', FLOW_DESIGN_SCENARIO_ID)
const columns: SparkNode[] = [
  {type: 'r-text', props: {field: 'PARENTID', label: '父节点', readonly: true, minWidth: 140}},
  {type: 'r-text', props: {field: 'CHILDID', label: '子节点', readonly: true, minWidth: 140}},
]
</script>