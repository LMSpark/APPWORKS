<!--
@module @spark-appworks/spark-component:components/display/data-components/visual/DisplayImage/DisplayImage
职责：实现 DisplayImage（display-image）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 display/data-display 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 display image 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <el-image
    v-if="isVisible"
    :src="resolvedSrc"
    :fit="fit"
    :alt="alt"
    :lazy="lazy"
    :preview-src-list="resolvedPreviewList"
    :initial-index="initialIndex"
    :z-index="zIndex"
    :hide-on-click-modal="hideOnClickModal"
    :preview-teleported="previewTeleported"
    :close-on-press-escape="closeOnPressEscape"
    :style="imageStyle"
  >
    <template #placeholder>
      <slot name="placeholder">
        <div class="display-image-loading">加载中...</div>
      </slot>
    </template>
    <template #error>
      <slot name="error">
        <div class="display-image-error">
          <el-icon><Picture /></el-icon>
        </div>
      </slot>
    </template>
  </el-image>
</template>

<script setup lang="ts">
/**
 * @description 图片展示组件，支持懒加载、预览画廊和加载占位。
 */
import { computed } from 'vue'
import { Picture } from '@element-plus/icons-vue'
import { useSparkPageComponent } from '../../../../internal'
import { useDisplayDataSource } from '../../../useDisplayDataSource'
import type { RDisplayImageProps } from './DisplayImage.props'

const props = withDefaults(defineProps<RDisplayImageProps>(), {
  type: 'display-image',
  fit: 'cover',
  lazy: false,
  initialIndex: 0,
  hideOnClickModal: false,
  previewTeleported: true,
  closeOnPressEscape: true,
})

const { isVisible } = useSparkPageComponent(props)

const { resolvedValue: dataValue } = useDisplayDataSource(props)

const resolvedSrc = computed(() => {
  if (props.src) return props.src
  const v = dataValue.value
  if (typeof v === 'string') return v
  return undefined
})

const resolvedPreviewList = computed(() => {
  if (props.previewSrcList) return props.previewSrcList
  // 如果有 previewField，从当前行数据读取
  if (props.previewField) {
    const v = dataValue.value
    if (Array.isArray(v)) return v.filter((item): item is string => typeof item === 'string')
  }
  // 单图时用自身 src 作为预览列表
  const src = resolvedSrc.value
  return src ? [src] : []
})

const imageStyle = computed(() => {
  const s: Record<string, string> = {}
  const w = props.width
  const h = props.height
  if (w) s['width'] = typeof w === 'number' ? `${w}px` : w
  if (h) s['height'] = typeof h === 'number' ? `${h}px` : h
  return s
})
</script>

<style scoped>
.display-image-loading,
.display-image-error {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  color: var(--el-text-color-placeholder);
  font-size: 14px;
}

.display-image-error .el-icon {
  font-size: 24px;
}
</style>


