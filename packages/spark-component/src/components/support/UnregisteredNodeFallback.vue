<!--
@module @spark-appworks/spark-component:components/support/UnregisteredNodeFallback
职责：实现 UnregisteredNodeFallback（未注册组件类型）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 infrastructure/support 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 unregistered node fallback 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <div class="spark-component-renderer spark-component-unregistered">
    <div class="unregistered-header">
      <div class="unregistered-warning">
        <strong>⚠️ {{ title }}:</strong>
        <span class="unregistered-type">{{ node.type }}</span>
      </div>

      <button
        type="button"
        class="unregistered-details-button"
        :aria-expanded="detailsVisible ? 'true' : 'false'"
        @click="toggleDetails"
      >{{ detailsVisible ? '收起属性' : '查看全部属性' }}</button>
    </div>

    <div v-if="description" class="unregistered-description">{{ description }}</div>

    <div v-if="detailsVisible" class="unregistered-details-panel" role="dialog" :aria-label="detailsAriaLabel">
      <div class="unregistered-details-title">节点快照</div>
      <pre class="unregistered-details-code">{{ nodeSnapshot }}</pre>
    </div>

    <div v-if="hasDefaultSlot" class="unregistered-children">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @description 未注册组件兜底渲染器，在开发阶段显示未找到对应注册的组件类型名称，辅助排查配置错误。
 * @category internal
 */
import { computed, ref, useSlots } from 'vue'
import type { SparkNode } from '@spark-appworks/spark-data'

/** 未注册节点兜底渲染属性。 */
type Props = {
  /** 未注册的源节点 */
  node: SparkNode
  /** 提示标题 */
  title?: string
  /** 说明文本 */
  description?: string}

const props = withDefaults(defineProps<Props>(), {
  title: '未注册的组件类型',
  description: '',
})

const slots = useSlots()
const detailsVisible = ref(false)
const hasDefaultSlot = computed(() => typeof slots['default'] === 'function')
const detailsAriaLabel = computed(() => `${props.title}详情`)

function createSnapshotReplacer() {
  const seen = new WeakSet<object>()

  return (_key: string, value: unknown): unknown => {
    if (typeof value === 'function') {
      return `[Function ${value.name || 'anonymous'}]`
    }

    if (typeof value === 'bigint') {
      return `${value.toString()}n`
    }

    if (typeof value === 'symbol') {
      return value.toString()
    }

    if (value === undefined) {
      return '[undefined]'
    }

    if (value !== null && typeof value === 'object') {
      if (seen.has(value)) {
        return '[Circular]'
      }
      seen.add(value)
    }

    return value
  }
}

const nodeSnapshot = computed(() => JSON.stringify(props.node, createSnapshotReplacer(), 2))

function toggleDetails(): void {
  detailsVisible.value = !detailsVisible.value
}
</script>

<style scoped>
.spark-component-unregistered {
  position: relative;
  display: grid;
  gap: 12px;
  padding: 12px;
  border: 1px dashed #d97706;
  border-radius: 10px;
  background: linear-gradient(180deg, #fff7ed 0%, #fffbeb 100%);
}

.unregistered-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.unregistered-warning {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #9a3412;
  font-size: 13px;
  line-height: 1.5;
}

.unregistered-description {
  color: #7c2d12;
  font-size: 12px;
  line-height: 1.6;
}

.unregistered-type {
  font-family: Consolas, 'Courier New', monospace;
  font-weight: 600;
}

.unregistered-details-button {
  appearance: none;
  border: 1px solid #fdba74;
  border-radius: 999px;
  background: #ffffff;
  color: #9a3412;
  padding: 4px 10px;
  font-size: 12px;
  line-height: 1.5;
  cursor: pointer;
}

.unregistered-details-button:hover {
  background: #fff7ed;
}

.unregistered-details-button:focus-visible {
  outline: 2px solid #fb923c;
  outline-offset: 2px;
}

.unregistered-details-panel {
  overflow: auto;
  max-height: 320px;
  border: 1px solid #fed7aa;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 10px 24px rgba(154, 52, 18, 0.12);
}

.unregistered-details-title {
  padding: 10px 12px 0;
  color: #7c2d12;
  font-size: 12px;
  font-weight: 600;
}

.unregistered-details-code {
  margin: 0;
  padding: 10px 12px 12px;
  color: #7c2d12;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.unregistered-children {
  display: contents;
}
</style>
