<!--
@module @spark-appworks/spark-component:components/containers/layout/RendererPageHeader
职责：实现 RendererPageHeader（r-page-header）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 container/layout-container 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 renderer page header 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <el-page-header
    v-if="isVisible"
    :title="title"
    :icon="icon"
    :content="content"
    @back="$emit('back')"
  >
    <template v-if="resolvedChildren.length" #default>
      <SparkComponentRenderer
        v-for="(child, index) in resolvedChildren"
        :key="nodeId(child) ?? `r-page-header-child-${index}`"
        :config="child"
      />
    </template>
  </el-page-header>
</template>

<script setup lang="ts">
/**
 * @description 页面头部组件。
 */
import { computed } from 'vue'
import { SparkComponentRenderer, useSparkPageComponent } from '../../internal'
import type { RPageHeaderProps } from './RendererPageHeader.props'
import { getSparkNodeChildren, nodeId } from '@spark-appworks/spark-data'

const props = withDefaults(defineProps<RPageHeaderProps>(), {
  type: 'r-page-header',
  title: '返回',
})

defineEmits<{
  /** Back requested; 用户点击页头返回入口。 */
  back: []
}>()

const { isVisible } = useSparkPageComponent(props)

const resolvedChildren = computed(() => getSparkNodeChildren(props.children))
</script>

