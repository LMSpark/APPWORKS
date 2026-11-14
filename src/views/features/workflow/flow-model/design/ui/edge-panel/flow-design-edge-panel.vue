<!--
@module app:views/features/workflow/flow-model/design/ui/edge-panel/flow-design-edge-panel
职责：流程设计连线列表，绑定父级已刷新的 WFM_NODE_REALATION 正式视图。
-->
<template>
  <RendererSection title="流程连线" :bordered="true" :grid-columns="1">
    <RendererTable v-if="viewKey" :data-view-key="viewKey" :children="columns" :stripe="true" :show-data-view-meta="false"
      :highlight-current-row="true" :pagination="{pageSizes: [10, 20, 50], showJumper: true}"
      @current-change="onCurrentChange" @row-click="onRowClick" />
  </RendererSection>
</template>

<script setup lang="ts">
import type {SparkNode} from '@spark-appworks/spark-data'
import {RendererSection, RendererTable} from '@spark-appworks/spark-component'
import {useFlowDesignViewHighlight} from '../use-flow-design-view-highlight'

const props = defineProps<{viewKey: string; highlightId?: string | number | null}>()
const emit = defineEmits<{selectGraphId: [id: string | number]}>()
useFlowDesignViewHighlight(() => props.viewKey, () => props.highlightId ?? null)

function readRowId(row: Record<string, unknown>): string | number | null {
  const id = row['rowid'] ?? row['ROWID']
  if (typeof id === 'string' && id.trim()) return id
  if (typeof id === 'number' && !Number.isNaN(id)) return id
  return null
}

function emitRowId(row: Record<string, unknown> | null | undefined): void {
  if (!row) return
  const id = readRowId(row)
  if (id === null) return
  emit('selectGraphId', id)
}

function onCurrentChange(row: Record<string, unknown> | null): void {
  emitRowId(row ?? undefined)
}

function onRowClick(row: Record<string, unknown>): void {
  emitRowId(row)
}
const columns: SparkNode[] = [
  {type: 'r-text', props: {field: 'PARENTID', label: '父节点', readonly: true, minWidth: 140}},
  {type: 'r-text', props: {field: 'CHILDID', label: '子节点', readonly: true, minWidth: 140}},
]
</script>