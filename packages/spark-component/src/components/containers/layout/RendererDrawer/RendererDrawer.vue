<!--
@module @spark-appworks/spark-component:components/containers/layout/RendererDrawer/RendererDrawer
职责：实现 RendererDrawer（r-drawer）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 container/layout-container 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 renderer drawer 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <el-drawer
    :model-value="visibleValue"
    @update:model-value="handleModelUpdate"
    @open="handleOpen"
    @close="handleClose"
    @opened="handleOpened"
    @closed="handleClosed"
  >
    <template v-if="hasHeader" #header>
      <div :class="['renderer-drawer-header', headerClassValue]">
        <div class="renderer-drawer-title">{{ resolvedTitle }}</div>
        <div v-if="hasHeaderActions" :class="['renderer-drawer-header-actions', headerActionsClassValue]">
          <SparkComponentRenderer
            v-for="(action, index) in headerActionConfigs"
            :key="nodeId(action) ?? `r-drawer-header-${index}`"
            :config="action"
          />
          <slot name="header-actions" v-bind="getHeaderScope()" />
        </div>
      </div>
    </template>

    <div :class="['renderer-drawer-body', bodyClass]" :style="gridStyle">
        <div
          v-for="(child, index) in gridChildren"
          :key="nodeId(child) ?? `r-drawer-child-${index}`"
          class="renderer-drawer-grid-item"
          :style="getChildGridStyle(child)"
        >
          <SparkComponentRenderer :config="child" />
        </div>
        <slot v-bind="getDefaultScope()" />
    </div>

    <template v-if="showFooter" #footer>
      <div :class="['renderer-drawer-footer', footerClassValue]">
        <SparkComponentRenderer
          v-for="(action, index) in footerActionConfigs"
          :key="nodeId(action) ?? `r-drawer-footer-${index}`"
          :config="action"
        />
        <slot name="footer" v-bind="getFooterScope()" />
      </div>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
/**
 * @description 抽屉容器，支持结构化 header/footer 区域和网格主体布局。
 * @category container
 * @notes 头部动作区与底部区域通过结构化 `header` / `footer` 声明
 */
import { computed, getCurrentInstance, useSlots } from 'vue'
import { useSparkPageComponent, SparkComponentRenderer } from '../../../internal'

import type { RDrawerProps } from './RendererDrawer.props'
import { useContainerGrid } from '../../runtime/container-layout'
import type { VisibilityContainerApi } from '../../support/base-container-api'
import { createVisibilityContainerZeroCode } from '../../support/visibility-container-zero-code'
import { useUnifiedValueBridge } from '../state'
import { getSparkNodeChildren, nodeId } from '@spark-appworks/spark-data'

const props = withDefaults(defineProps<RDrawerProps>(), {
  type: 'r-drawer',
  title: '',
  value: false,
  bodyClass: '',
  gridColumns: 24,
  gridGap: 0,
  gridAutoRows: 'minmax(32px, auto)',
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const instance = getCurrentInstance()
const slots = useSlots()
const { registerApi } = useSparkPageComponent(props)

// 头/尾区域优先通过 props.header / props.footer 输入。
const contentChildren = computed(() => props.children ?? [])

const headerClassValue = computed(() => String(props.header?.class ?? ''))
const headerActionsClassValue = computed(() => '')
const footerClassValue = computed(() => String(props.footer?.class ?? ''))

const resolvedTitle = computed(() => props.title || '')
const headerActionConfigs = computed(() => getSparkNodeChildren(props.header?.children))
const footerActionConfigs = computed(() => getSparkNodeChildren(props.footer?.children))
const { gridChildren, gridStyle, getChildGridStyle } = useContainerGrid({
  children: computed(() => getSparkNodeChildren(contentChildren.value)),
  columns: computed(() => props.gridColumns),
  gap: computed(() => props.gridGap),
  autoRows: computed(() => props.gridAutoRows),
})

const {
  state: visibleValue,
  commitValue: commitVisibleValue,
} = useUnifiedValueBridge<boolean>({
  value: computed(() => hasExplicitModelValue() ? props.modelValue : props.value),
  fallbackValue: false,
  normalize: value => value ?? false,
  emitValue: value => emit('update:modelValue', value),
})
const scopedVisibleValue = computed(() => (hasExplicitModelValue() ? props.modelValue : props.value) ?? visibleValue.value)
const hasHeaderActions = computed(() => headerActionConfigs.value.length > 0 || slots['header-actions'] !== undefined)
const hasHeader = computed(() => resolvedTitle.value.length > 0 || hasHeaderActions.value)
const showFooter = computed(() => footerActionConfigs.value.length > 0 || slots['footer'] !== undefined)

function closeDrawer(): void {
  commitVisibleValue(false)
}

function hasExplicitModelValue(): boolean {
  const rawProps = instance?.vnode.props
  return rawProps !== null &&
    rawProps !== undefined &&
    (
      Object.prototype.hasOwnProperty.call(rawProps, 'modelValue') ||
      Object.prototype.hasOwnProperty.call(rawProps, 'model-value')
    )
}

// ── r-drawer 包装 API ────────────────────────────────────────────────────

const {
  api: drawerApi,
  handleModelUpdate,
  handleOpen,
  handleClose,
  handleOpened,
  handleClosed,
}: {
  api: VisibilityContainerApi
  handleModelUpdate: (value: boolean) => void
  handleOpen: () => void
  handleClose: () => void
  handleOpened: () => void
  handleClosed: () => void
} = createVisibilityContainerZeroCode({
  visibleValue,
  commitVisibleValue,
  onOpen: props.onOpen,
  onClose: props.onClose,
  onOpened: props.onOpened,
  onClosed: props.onClosed,
})

registerApi(drawerApi)

function getHeaderScope() {
  return {
    title: resolvedTitle.value,
    visible: scopedVisibleValue.value,
    close: closeDrawer,
  }
}

function getDefaultScope() {
  return {
    title: resolvedTitle.value,
    visible: scopedVisibleValue.value,
    close: closeDrawer,
  }
}

function getFooterScope() {
  return {
    title: resolvedTitle.value,
    visible: scopedVisibleValue.value,
    close: closeDrawer,
  }
}
</script>

<style scoped>
.renderer-drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.renderer-drawer-title {
  min-width: 0;
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.renderer-drawer-header-actions,
.renderer-drawer-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.renderer-drawer-body {
  width: 100%;
}

.renderer-drawer-grid-item {
  min-width: 0;
}
</style>
