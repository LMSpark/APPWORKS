<!--
@module @spark-appworks/spark-component:components/containers/layout/overlay/RendererTooltip/RendererTooltip
职责：实现 RendererTooltip（r-tooltip）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 container/layout-container 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 renderer tooltip 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <el-tooltip
    v-if="isVisible"
    :content="content"
    :placement="placement"
    :effect="effect"
    :disabled="isDisabled"
    :offset="offset"
    :show-after="showAfter"
    :hide-after="hideAfter"
    :show-arrow="showArrow"
    :enterable="enterable"
    :popper-class="popperClass"
    :raw-content="rawContent"
  >
    <template #default>
      <SparkComponentRenderer
        v-for="(child, index) in resolvedChildren"
        :key="nodeId(child) ?? `r-tooltip-child-${index}`"
        :config="child"
      />
    </template>
  </el-tooltip>
</template>

<script setup lang="ts">
/**
 * @description 文字提示组件，支持位置和延迟配置。
 */
import { computed } from 'vue'
import { SparkComponentRenderer, useSparkPageComponent } from '../../../../internal'
import type { RTooltipProps } from './RendererTooltip.props'
import { getSparkNodeChildren, nodeId } from '@spark-appworks/spark-data'

const props = withDefaults(defineProps<RTooltipProps>(), {
  type: 'r-tooltip',
  placement: 'bottom',
  effect: 'dark',
  showArrow: true,
  enterable: true,
  rawContent: false,
})

const { isVisible, isDisabled } = useSparkPageComponent(props)

const resolvedChildren = computed(() => getSparkNodeChildren(props.children))
</script>

