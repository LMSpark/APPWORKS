<!--
@module app:views/features/workflow/flow-model/design/ui/edge-panel/flow-design-edge-panel
职责：流程设计连线列表，绑定父级已刷新的 WFM_NODE_REALATION 正式视图。
-->
<template>
  <RendererSection title="流程连线" :bordered="true" :grid-columns="1">
    <RendererTable v-if="viewKey" :data-view-key="viewKey" :children="columns" :stripe="true" :show-data-view-meta="false"
      :highlight-current-row="true" :pagination="{pageSizes: [10, 20, 50], showJumper: true}"
      @current-change="selectGraphRow" @row-click="selectGraphRow" />
  </RendererSection>
</template>

<script setup lang="ts">
import type {DataRow, SparkNode} from '@spark-appworks/spark-data'
import {RendererSection, RendererTable} from '@spark-appworks/spark-component'
import {useFlowDesignViewHighlight} from '../use-flow-design-view-highlight'

const props = defineProps<{viewKey: string; highlightId?: string | number | null}>()
const emit = defineEmits<{selectGraphId: [id: string | number]}>()
const originalRowKey = useFlowDesignViewHighlight(() => props.viewKey, () => props.highlightId ?? null)

function selectGraphRow(row: DataRow | null | undefined): void {
  const id = originalRowKey(row)
  if (id !== undefined) emit('selectGraphId', id)
}

const columns: SparkNode[] = [
  {type: 'r-text', props: {field: 'UpNodeID', label: '父节点', readonly: true, minWidth: 140}},
  {type: 'r-text', props: {field: 'NextNodeID', label: '子节点', readonly: true, minWidth: 140}},
  {type: 'r-text', props: {field: 'TITLE', label: '连线标题', minWidth: 160}},
  {type: 'r-text', props: {field: 'description', label: '备注', minWidth: 160}},
  {type: 'r-text', props: {field: 'ConditionExpress', label: '条件表达式', minWidth: 200, showOverflowTooltip: true}},
]
</script>
