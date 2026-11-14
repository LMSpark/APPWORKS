<!--
@module app:views/features/workflow/flow-model/design/ui/edge-panel/flow-design-edge-panel
职责：流程设计连线列表，绑定父级已刷新的 WFM_NODE_REALATION 正式视图。
-->
<template>
  <RendererSection title="流程连线" :bordered="true" :grid-columns="1">
    <RendererTable v-if="viewKey" :data-view-key="viewKey" :children="columns" :stripe="true" :show-data-view-meta="false"
      :pagination="{pageSizes: [10, 20, 50], showJumper: true}" />
  </RendererSection>
</template>

<script setup lang="ts">
import type {SparkNode} from '@spark-appworks/spark-data'
import {RendererSection, RendererTable} from '@spark-appworks/spark-component'
import {useFlowDesignViewHighlight} from '../use-flow-design-view-highlight'

const props = defineProps<{viewKey: string; highlightId?: string | number | null}>()
useFlowDesignViewHighlight(() => props.viewKey, () => props.highlightId ?? null)
const columns: SparkNode[] = [
  {type: 'r-text', props: {field: 'PARENTID', label: '父节点', readonly: true, minWidth: 140}},
  {type: 'r-text', props: {field: 'CHILDID', label: '子节点', readonly: true, minWidth: 140}},
]
</script>