<!--
@module @spark-appworks/spark-component:components/containers/layout/RendererPopover
职责：实现 RendererPopover（r-popover）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 container/layout-container 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 renderer popover 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <el-popover
    v-if="isVisible"
    :title="title"
    :content="content"
    :placement="placement"
    :width="width"
    :trigger="trigger"
    :effect="effect"
    :disabled="isDisabled"
    :offset="offset"
    :show-after="showAfter"
    :hide-after="hideAfter"
    :show-arrow="showArrow"
    :popper-class="popperClass"
  >
    <template #reference>
      <SparkComponentRenderer
        v-for="(child, index) in referenceChildren"
        :key="nodeId(child) ?? `r-popover-ref-${index}`"
        :config="child"
      />
    </template>
    <template v-if="contentChildren.length" #default>
      <SparkComponentRenderer
        v-for="(child, index) in contentChildren"
        :key="nodeId(child) ?? `r-popover-content-${index}`"
        :config="child"
      />
    </template>
  </el-popover>
</template>

<script setup lang="ts">
/**
 * @description 弹出提示容器，支持多种触发方式和位置。
 */
import { computed } from 'vue'
import { SparkComponentRenderer, useSparkPageComponent } from '../../internal'
import type { RPopoverProps } from './RendererPopover.props'
import { getSparkNodeChildren, nodeId } from '@spark-appworks/spark-data'

const props = withDefaults(defineProps<RPopoverProps>(), {
  type: 'r-popover',
  placement: 'bottom',
  width: 150,
  trigger: 'click',
  effect: 'light',
  showArrow: true,
})

const { isVisible, isDisabled } = useSparkPageComponent(props)

const referenceChildren = computed(() => getSparkNodeChildren(props.children))
const contentChildren = computed(() => getSparkNodeChildren(props.contentChildren))
</script>

