<!--
@module @spark-appworks/spark-component:components/containers/zones/RendererEditor
职责：实现 RendererEditor（r-editor）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 container/zone-container 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 renderer editor 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <div v-if="children.length > 0" class="renderer-editor">
    <SparkComponentRenderer
      v-for="(child, i) in children"
      :key="nodeId(child) ?? `r-editor-${i}`"
      :config="child"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * @description 编辑面板组件，在 r-tree 中作为侧边编辑面板提取渲染，用于节点详情编辑。
 */
import { computed } from 'vue'
import { SparkComponentRenderer } from '../../internal'
import type { REditorProps as Props } from './RendererEditor.types'
import { getSparkNodeChildren, nodeId } from '@spark-appworks/spark-data'

const props = withDefaults(defineProps<Props>(), {
  type: 'r-editor',
})

const children = computed(() => getSparkNodeChildren(props.children))
</script>

<style scoped>
.renderer-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
