<!--
@module @spark-appworks/spark-component:components/containers/zones/RendererTail
职责：实现 RendererTail（r-tail）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 container/zone-container 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 renderer tail 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <div v-if="children.length > 0" :key="scopeKey" :class="['renderer-tail', props.class]" :style="props.width === undefined ? undefined : {width: typeof props.width === 'number' ? `${props.width}px` : props.width}">
    <SparkComponentRenderer
      v-for="(child, i) in children"
      :key="nodeId(child) ?? `r-tail-${i}`"
      :config="child"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * @description 尾部组件，在 r-toolbar 中作为工具栏末尾区域提取渲染。
 */
import { computed, ref } from 'vue'
import { SparkComponentRenderer } from '../../internal'
import type { RTailProps as Props } from './RendererTail.types'
import { getSparkNodeChildren, nodeId, nodeInputProp, type SparkNode } from '@spark-appworks/spark-data'
import { useLayoutDataContext } from '../runtime/layout-data-context'
import { mergeNodeBeforeRenderProps, resolveNodeBeforeRender } from '../../support/beforeRender'
import { useDataViewEventBridge } from '../runtime/useDataViewEventBridge'

const props = withDefaults(defineProps<Props>(), {
  type: 'r-tail',
})

const {resolvedView, row, scopeKey} = useLayoutDataContext(props)
const reactiveVersion = ref(0)
useDataViewEventBridge({
  resolvedView,
  onCurrentRowChanged: () => {reactiveVersion.value += 1},
  onSelectedRowsChanged: () => {reactiveVersion.value += 1},
  onRowsChanged: () => {reactiveVersion.value += 1},
})

function resolveActionNode(node: SparkNode): SparkNode {
  void reactiveVersion.value
  const result = resolveNodeBeforeRender(node, {
    row: row.value ?? undefined,
    data: row.value ?? undefined,
    dataSource: resolvedView.value,
    host: {type: 'r-toolbar'},
  })
  return mergeNodeBeforeRenderProps(node, result.propsPatch, {markResolved: true})
}

const children = computed(() => getSparkNodeChildren(props.children)
  .map(resolveActionNode)
  .filter(node => nodeInputProp(node, 'visible') !== false))
</script>

<style scoped>
.renderer-tail {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}
</style>
