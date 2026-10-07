<!--
@module @spark-appworks/spark-component:components/containers/layout/structure/RendererDivider/RendererDivider
职责：实现 RendererDivider（r-divider）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 container/layout-container 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 renderer divider 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <el-divider
    v-if="isVisible"
    :direction="direction"
    :border-style="borderStyle"
    :content-position="contentPosition"
  >
    <template v-if="content">{{ content }}</template>
  </el-divider>
</template>

<script setup lang="ts">
/**
 * @description 分割线组件，支持文字内容定位。
 */
import { useSparkPageComponent } from '../../../../internal'
import type { RDividerProps } from './RendererDivider.props'



const props = withDefaults(defineProps<RDividerProps>(), {
  type: 'r-divider',
  direction: 'horizontal',
  borderStyle: 'solid',
  contentPosition: 'center',
})

const { isVisible } = useSparkPageComponent(props)
</script>


