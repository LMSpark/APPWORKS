<!--
@module @spark-appworks/spark-component:components/fields/non-data-components/TreeNodeSummary
职责：实现 TreeNodeSummary（r-tree-node-summary）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 field-level/field-support 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 tree node summary 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <div :class="['tree-node-summary', `tree-node-summary--${resolvedType}`]">
    <span class="tree-node-summary__rail" />
    <span class="tree-node-summary__title">{{ resolvedName }}</span>
    <span v-if="showType" class="tree-node-summary__pill tree-node-summary__pill--type">{{ resolvedType }}</span>
    <span v-if="showExtra && resolvedExtra" class="tree-node-summary__pill tree-node-summary__pill--extra">{{ resolvedExtra }}</span>
    <span v-if="showStatus && resolvedStatus" class="tree-node-summary__pill tree-node-summary__pill--status">{{ resolvedStatus }}</span>
    <span v-if="showOwner && resolvedOwner" class="tree-node-summary__owner">{{ resolvedOwner }}</span>
    <span v-if="showMeta && resolvedMeta" class="tree-node-summary__meta">{{ resolvedMeta }}</span>
  </div>
</template>

<script setup lang="ts">
/**
 * @description 树节点摘要展示组件，在 r-tree 场景中渲染节点名称、类型、状态等多字段信息。
 */
import { computed } from 'vue'
import type { DataRow } from '@spark-appworks/spark-data'
import { DATA_ROW, DATA_SOURCE, useSparkComponent } from '../../internal'
import type { RTreeNodeSummaryProps } from './TreeNodeSummary.props'

const props = withDefaults(defineProps<RTreeNodeSummaryProps>(), {
  type: 'r-tree-node-summary',
  nameField: 'name',
  typeField: 'type',
  statusField: 'status',
  ownerField: 'owner',
  metaField: 'route',
  extraField: 'childPlacement',
  showType: true,
  showStatus: true,
  showOwner: false,
  showMeta: true,
  showExtra: false,
})

const { sparkConsume } = useSparkComponent(props)
const contextData = computed<DataRow>(() => {
  const raw = sparkConsume(DATA_ROW)
  if (raw !== null) return raw
  const dataSource = sparkConsume(DATA_SOURCE)
  return dataSource?.currentRow ?? {}
})

function readString(field: string): string {
  const value = contextData.value[field]
  return value == null ? '' : String(value)
}

const resolvedName = computed(() => readString(props.nameField) || '未命名节点')
const resolvedType = computed(() => readString(props.typeField) || 'node')
const resolvedStatus = computed(() => readString(props.statusField))
const resolvedOwner = computed(() => readString(props.ownerField))
const resolvedMeta = computed(() => readString(props.metaField))
const resolvedExtra = computed(() => readString(props.extraField))
</script>

<style scoped>
.tree-node-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  width: 100%;
  color: #1f342f;
}

.tree-node-summary__rail {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #82a79d;
  flex: 0 0 auto;
}

.tree-node-summary__title {
  min-width: 0;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 600;
}

.tree-node-summary__pill {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  line-height: 1.4;
  flex: 0 0 auto;
}

.tree-node-summary__pill--type {
  background: #e7f2ee;
  color: #205144;
}

.tree-node-summary__pill--status {
  background: #f3efe2;
  color: #8a5b00;
}

.tree-node-summary__pill--extra {
  background: #edf1f7;
  color: #43566e;
}

.tree-node-summary__owner,
.tree-node-summary__meta {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: #70837c;
}

.tree-node-summary__owner {
  flex: 0 0 auto;
}

.tree-node-summary__meta {
  flex: 1 1 auto;
}

.tree-node-summary--workspace .tree-node-summary__rail {
  background: #215447;
}

.tree-node-summary--module .tree-node-summary__rail {
  background: #2f7d67;
}

.tree-node-summary--page .tree-node-summary__rail {
  background: #d48b16;
}

.tree-node-summary--action .tree-node-summary__rail {
  background: #7d5cff;
}
</style>
