<!--
@module @spark-appworks/spark-component:components/display/non-data-components/feedback/DisplayAlert/DisplayAlert
职责：实现 DisplayAlert（display-alert）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 display/static-display 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 display alert 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <el-alert
    v-if="isVisible"
    :title="title"
    :description="description"
    :type="alertType"
    :closable="closable"
    :close-text="closeText"
    :center="center"
    :show-icon="showIcon"
    :effect="effect"
    @close="handleClose"
  />
</template>

<script setup lang="ts">
/**
 * @description 警告提示组件，支持 success/warning/info/error 四种类型。
 */
import { useSparkPageComponent } from '../../../../internal'
import type { RAlertProps } from './DisplayAlert.props'

const props = withDefaults(defineProps<RAlertProps>(), {
  type: 'r-alert',
  alertType: 'info',
  closable: true,
  center: false,
  showIcon: false,
  effect: 'light',
})

const emit = defineEmits<{
  /** Alert close requested; 用户关闭当前提示条。 */
  close: []
}>()

const { isVisible } = useSparkPageComponent(props)

function handleClose() {
  emit('close')
}
</script>


