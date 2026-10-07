<!--
@module @spark-appworks/spark-component:components/display/non-data-components/structure/DisplayBreadcrumb/DisplayBreadcrumbItem
职责：实现 DisplayBreadcrumbItem（display-breadcrumb-item）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 display/static-display 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 display breadcrumb item 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <el-breadcrumb-item
    v-if="isVisible"
    :to="to"
    :replace="replace"
  >
    {{ label }}
  </el-breadcrumb-item>
</template>

<script setup lang="ts">
/**
 * @description 面包屑导航项，支持链接跳转。
 */
import { useSparkPageComponent } from '../../../../internal'
import type { RBreadcrumbItemProps } from './DisplayBreadcrumbItem.props'

const props = withDefaults(defineProps<RBreadcrumbItemProps>(), {
  type: 'r-breadcrumb-item',
  replace: false,
})

const { isVisible } = useSparkPageComponent(props)
</script>


