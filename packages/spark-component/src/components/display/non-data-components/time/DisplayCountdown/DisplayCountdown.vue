<!--
@module @spark-appworks/spark-component:components/display/non-data-components/time/DisplayCountdown/DisplayCountdown
职责：实现 DisplayCountdown（display-countdown）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 display/static-display 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 display countdown 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <el-countdown
    v-if="isVisible"
    :value="targetTime"
    :format="format"
    :prefix="prefix"
    :suffix="suffix"
    :title="title"
    :value-style="valueStyle"
    @finish="handleFinish"
    @change="handleChange"
  />
</template>

<script setup lang="ts">
/**
 * @description 倒计时组件，支持自定义格式和结束事件。
 */
import { computed } from 'vue'
import { useSparkPageComponent } from '../../../../internal'
import type { RDisplayCountdownProps } from './DisplayCountdown.props'

const props = withDefaults(defineProps<RDisplayCountdownProps>(), {
  type: 'display-countdown',
  format: 'HH:mm:ss',
})

const emit = defineEmits<{
  /** Countdown finished; 倒计时到达目标时间。 */
  finish: []
  /**
   * Countdown tick changed; 剩余时间数值更新。
   * @param value Remaining milliseconds.
   */
  change: [value: number]
}>()

const { isVisible } = useSparkPageComponent(props)

const targetTime = computed(() => {
  if (props.value instanceof Date) return props.value.getTime()
  return props.value ?? Date.now()
})

function handleFinish() {
  emit('finish')
}

function handleChange(value: number) {
  emit('change', value)
}
</script>


