<!--
@module app:views/features/workflow/flow-model/design/ui/node-panel/flow-design-node-panel
职责：流程设计节点列表面板占位，绑定 WFM_FLOW_NODE 正式视图。
-->
<template>
  <RendererSection title="流程节点" :bordered="true" :grid-columns="1">
    <RendererTable v-if="viewKey" :data-view-key="viewKey" :children="columns" :stripe="true" :show-data-view-meta="false" />
  </RendererSection>
</template>

<script setup lang="ts">
import {buildDataViewKey, type SparkNode} from '@spark-appworks/spark-data'
import {RendererSection, RendererTable} from '@spark-appworks/spark-component'
import {FLOW_DESIGN_SCENARIO_ID} from '@/lowcode/resources/system/workflow/manage'

defineProps<{flowModelId: string}>()
const viewKey = buildDataViewKey('WFM_FLOW_NODE', 'default', FLOW_DESIGN_SCENARIO_ID)
const columns: SparkNode[] = [
  {type: 'r-text', props: {field: 'TITLE', label: '节点名称', readonly: true, minWidth: 160}},
  {type: 'r-text', props: {field: 'NODETYPE', label: '节点类型', readonly: true, minWidth: 100}},
]
</script>