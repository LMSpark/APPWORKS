<!--
@module @spark-appworks/spark-component:components/display/non-data-components/DisplayDescriptionsItem
职责：实现 DisplayDescriptionsItem（display-descriptions-item）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 display/static-display 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 display descriptions item 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <el-descriptions-item
    v-if="isVisible"
    :label="label"
    :span="span"
    :label-align="labelAlign"
    :align="contentAlign"
    :label-class-name="labelClassName"
    :class-name="className"
  >
    <template v-if="resolvedChildren.length > 0">
      <SparkComponentRenderer
        v-for="(child, index) in resolvedChildren"
        :key="nodeId(child) ?? `r-desc-item-child-${index}`"
        :config="child"
      />
    </template>
    <template v-else>{{ resolvedContent }}</template>
  </el-descriptions-item>
</template>

<script setup lang="ts">
/**
 * @description 描述列表项，支持字段绑定。
 */
import { computed } from 'vue'
import { SparkComponentRenderer, useSparkPageComponent } from '../../internal'
import { useDisplayDataSource } from '../useDisplayDataSource'
import type { RDescriptionsItemProps } from './DisplayDescriptionsItem.props'
import { getSparkNodeChildren, nodeId } from '@spark-appworks/spark-data'

const props = withDefaults(defineProps<RDescriptionsItemProps>(), {
  type: 'r-descriptions-item',
  span: 1,
})

const { isVisible } = useSparkPageComponent(props)

const { resolvedValue: dataValue } = useDisplayDataSource(props)

const resolvedChildren = computed(() => getSparkNodeChildren(props.children))

const resolvedContent = computed(() => {
  if (props.content !== undefined) return props.content
  const v = dataValue.value
  if (v !== undefined && v !== null) return String(v)
  return ''
})
</script>

