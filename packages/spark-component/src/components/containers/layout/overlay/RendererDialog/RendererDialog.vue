<!--
@module @spark-appworks/spark-component:components/containers/layout/overlay/RendererDialog/RendererDialog
职责：实现 RendererDialog（r-dialog）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 container/layout-container 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 renderer dialog 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <FullscreenDialog
    :title="resolvedTitle"
    :fullscreen="fullscreen"
    :fullscreenable="fullscreenable"
    :auto-fullscreen-below="autoFullscreenBelow"
    :reset-fullscreen-on-close="resetFullscreenOnClose"
    :width="width"
    :top="top"
    :append-to-body="appendToBody"
    :destroy-on-close="destroyOnClose"
    :model-value="visibleValue"
    :before-close="beforeClose"
    @update:model-value="handleModelUpdate"
    @update:fullscreen="emit('update:fullscreen', $event)"
    @open="handleOpen"
    @close="handleClose"
    @opened="handleOpened"
    @closed="handleClosed"
  >
    <template v-if="hasHeader" #header>
      <div :class="['renderer-dialog-header', headerClassValue]">
        <div class="renderer-dialog-title">{{ resolvedTitle }}</div>
        <div v-if="hasHeaderActions" :key="scopeKey" :class="['renderer-dialog-header-actions', headerActionsClassValue]">
          <RendererHeader v-bind="props.header" :children="headerActionConfigs">
            <slot name="header-actions" v-bind="getHeaderScope()" />
          </RendererHeader>
        </div>
      </div>
    </template>

    <div :key="scopeKey" :class="['renderer-dialog-body', bodyClass]" :style="gridStyle">
        <p v-if="aggregateError" role="alert" style="grid-column: 1 / -1">{{ aggregateError.message }}</p>
        <div
          v-for="(child, index) in gridChildren"
          :key="nodeId(child) ?? `r-dialog-child-${index}`"
          class="renderer-dialog-grid-item"
          :style="getChildGridStyle(child)"
        >
          <SparkComponentRenderer :config="child" />
        </div>
        <div v-if="$slots['default']" style="grid-column: 1 / -1; min-width: 0; width: 100%">
          <slot v-bind="getDefaultScope()" />
        </div>
    </div>

    <template v-if="showFooter" #footer>
      <div :key="scopeKey" :class="['renderer-dialog-footer', footerClassValue]">
        <RendererFooter v-bind="props.footer" :children="footerActionConfigs">
          <slot name="footer" v-bind="getFooterScope()" />
        </RendererFooter>
      </div>
    </template>
  </FullscreenDialog>
</template>

<script setup lang="ts">
/**
 * @description 对话框容器，支持结构化 header/footer 区域和网格主体布局。
 * @category container
 * @notes 头部动作区与底部区域通过结构化 `header` / `footer` 声明
 */
import { computed, getCurrentInstance, useSlots } from 'vue'
import { SparkComponentRenderer } from '../../../../internal'
import RendererHeader from '../../../zones/RendererHeader.vue'
import RendererFooter from '../../../zones/RendererFooter.vue'
import { useLayoutDataContext } from '../../../runtime/layout-data-context'

import type { RDialogProps } from './RendererDialog.props'
import FullscreenDialog from './FullscreenDialog.vue'
import { useContainerGrid } from '../../../runtime/container-layout'
import type { VisibilityContainerApi } from '../../../support/crud/base-container-api'
import { createVisibilityContainerZeroCode } from '../../../support/visibility-container-zero-code'
import { useUnifiedValueBridge } from '../../state'
import { getSparkNodeChildren, nodeId } from '@spark-appworks/spark-data'

const props = withDefaults(defineProps<RDialogProps>(), {
  type: 'r-dialog',
  title: '',
  value: false,
  bodyClass: '',
  gridColumns: 24,
  gridGap: 0,
  gridAutoRows: 'minmax(32px, auto)',
  fullscreen: false,
  fullscreenable: false,
  autoFullscreenBelow: 0,
  resetFullscreenOnClose: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'update:fullscreen': [fullscreen: boolean]
}>()

const instance = getCurrentInstance()
const slots = useSlots()
const { registerApi, scopeKey, aggregateError } = useLayoutDataContext(props)

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

function closeDialog(): void {
  commitAllowedVisibility(false)
}

function commitAllowedVisibility(value: boolean): void {
  if (!value && props.closeDisabled === true) return
  commitVisibleValue(value)
}

function beforeClose(done: () => void): void {
  if (props.closeDisabled !== true) done()
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

// ── r-dialog 包装 API ────────────────────────────────────────────────────

const {
  api: dialogApi,
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
  commitVisibleValue: commitAllowedVisibility,
  onOpen: props.onOpen,
  onClose: props.onClose,
  onOpened: props.onOpened,
  onClosed: props.onClosed,
})

registerApi(dialogApi)

function getHeaderScope() {
  return {
    title: resolvedTitle.value,
    visible: scopedVisibleValue.value,
    close: closeDialog,
  }
}

function getDefaultScope() {
  return {
    title: resolvedTitle.value,
    visible: scopedVisibleValue.value,
    close: closeDialog,
  }
}

function getFooterScope() {
  return {
    title: resolvedTitle.value,
    visible: scopedVisibleValue.value,
    close: closeDialog,
  }
}
</script>

<style scoped>
.renderer-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.renderer-dialog-title {
  min-width: 0;
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.renderer-dialog-header-actions,
.renderer-dialog-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.renderer-dialog-body {
  width: 100%;
}

.renderer-dialog-grid-item {
  min-width: 0;
}
</style>
