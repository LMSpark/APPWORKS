<!--
@module @spark-appworks/spark-component:components/containers/layout/overlay/RendererPopconfirm/RendererPopconfirm
职责：实现 RendererPopconfirm（r-popconfirm）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 container/layout-container 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 renderer popconfirm 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <el-popconfirm
    v-if="isVisible"
    :title="title"
    :confirm-button-text="confirmButtonText"
    :cancel-button-text="cancelButtonText"
    :confirm-button-type="confirmButtonType"
    :cancel-button-type="cancelButtonType"
    :icon="icon"
    :icon-color="iconColor"
    :hide-icon="hideIcon"
    :hide-after="hideAfter"
    :width="width"
    @confirm="$emit('confirm')"
    @cancel="$emit('cancel')"
  >
    <template #reference>
      <SparkComponentRenderer
        v-for="(child, index) in resolvedChildren"
        :key="nodeId(child) ?? `r-popconfirm-child-${index}`"
        :config="child"
      />
    </template>
  </el-popconfirm>
</template>

<script setup lang="ts">
/**
 * @description 确认气泡组件。
 */
import { computed } from 'vue'
import { SparkComponentRenderer, useSparkPageComponent } from '../../../../internal'
import type { RPopconfirmProps } from './RendererPopconfirm.props'
import { getSparkNodeChildren, nodeId } from '@spark-appworks/spark-data'

const props = withDefaults(defineProps<RPopconfirmProps>(), {
  type: 'r-popconfirm',
  confirmButtonType: 'primary',
  cancelButtonType: '',
  iconColor: '#f90',
  hideIcon: false,
  width: 150,
})

defineEmits<{
  /** Confirm requested; 用户确认当前危险或二次确认动作。 */
  confirm: []
  /** Cancel requested; 用户取消当前二次确认动作。 */
  cancel: []
}>()

const { isVisible } = useSparkPageComponent(props)

const resolvedChildren = computed(() => getSparkNodeChildren(props.children))
</script>

