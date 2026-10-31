<!--
@module @spark-appworks/spark-component:components/containers/layout/structure/RendererCard/RendererCard
职责：实现 RendererCard（r-card）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 container/layout-container 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 renderer card 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <el-card
    v-if="isVisible"
    :shadow="shadow"
    :body-style="bodyStyle"
    :body-class="bodyClass"
  >
    <template v-if="header || $slots['header']" #header>
      <div class="r-card-header">
        <span v-if="header">{{ header }}</span>
        <slot name="header" />
      </div>
    </template>
    <div :key="scopeKey" class="r-card-body">
      <p v-if="aggregateError" role="alert">{{ aggregateError.message }}</p>
      <SparkComponentRenderer
        v-for="(child, index) in resolvedChildren"
        :key="nodeId(child) ?? `r-card-child-${index}`"
        :config="child"
      />
    </div>
  </el-card>
</template>

<script setup lang="ts">
/**
 * @description 卡片容器，在卡片体内渲染子组件；可绑定 DataView 为子组件提供标准数据上下文。
 */
import { computed } from 'vue'
import { SparkComponentRenderer } from '../../../../internal'
import { useLayoutDataContext } from '../../../runtime/layout-data-context'
import type { RCardProps } from './RendererCard.props'
import { getSparkNodeChildren, nodeId } from '@spark-appworks/spark-data'

const props = withDefaults(defineProps<RCardProps>(), {
  type: 'r-card',
  shadow: 'always',
})

const { isVisible, scopeKey, aggregateError } = useLayoutDataContext(props)

const resolvedChildren = computed(() => getSparkNodeChildren(props.children))
</script>

