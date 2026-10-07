<!--
@module @spark-appworks/spark-component:components/containers/layout/navigation/RendererAnchor/RendererAnchorLink
职责：实现 RendererAnchorLink（r-anchor-link）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 container/layout-container 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 renderer anchor link 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <el-anchor-link
    v-if="isVisible"
    :href="href"
    :title="title"
  >
    <template v-if="!$slots['default']">{{ title }}</template>
    <slot />
    <template v-if="$slots['sub-link']" #sub-link>
      <slot name="sub-link" />
    </template>
  </el-anchor-link>
</template>

<script setup lang="ts">
/**
 * @description 锚点链接项，支持嵌套子链接。
 */
import { useSparkPageComponent } from '../../../../internal'
import type { RAnchorLinkProps } from './RendererAnchorLink.props'



const props = withDefaults(defineProps<RAnchorLinkProps>(), {
  type: 'r-anchor-link',
})

const { isVisible } = useSparkPageComponent(props)
</script>


