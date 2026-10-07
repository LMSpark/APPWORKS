<!--
@module @spark-appworks/spark-component:components/containers/data-views/RendererDetail/RendererDetail
职责：实现 RendererDetail（r-detail）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 table-level/data-view-container 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 renderer detail 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <div :class="['renderer-detail-layout', `renderer-detail-layout--${toolbarPositionValue}`]">
    <div v-if="showToolbar" :class="['renderer-detail-toolbar', toolbarClassValue]">
        <SparkComponentRenderer
          v-for="(action, index) in visibleToolbarConfigs"
          :key="nodeId(action) ?? `r-detail-toolbar-${index}`"
          :config="action"
        />
    </div>

    <DataViewMetaBar
      :rows="dataState.rows.value"
      :columns="dataState.columns.value"
      :selected-rows="dataState.selectedRows.value"
      :total="dataState.total.value"
      :page="dataState.page.value"
      :page-size="dataState.pageSize.value"
      :request-state="dataState.requestState.value"
      :mutating="dataState.mutating.value"
      :loading-error="dataState.loadingError.value"
      :mutating-error="dataState.mutatingError.value"
      :aggregate-result="dataState.aggregateResult.value"
      :selection-aggregate-result="dataState.selectionAggregateResult.value"
      :show-data-view-meta="props.showDataViewMeta !== false"
      :show-aggregate-summary="props.showAggregateSummary !== false"
      :show-selection-summary="props.showSelectionSummary !== false"
    />

    <div class="renderer-detail-main" v-bind="detailPropsValue" :style="detailAlignStyle">
        <div class="renderer-detail-grid" :style="gridStyle">
          <div
            v-for="(child, index) in gridChildren"
            :key="nodeId(child) ?? `r-detail-child-${index}`"
            class="renderer-detail-grid-item"
            :style="getChildGridStyle(child)"
          >
            <RendererHostScope :row="detailData">
              <SparkComponentRenderer :config="child" />
            </RendererHostScope>
          </div>
          <RendererHostScope :row="detailData">
            <slot v-bind="getDefaultScope()" />
          </RendererHostScope>
        </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @description 数据详情容器，与 r-form 结构一致但不可编辑。
 * @category container
 * @binding dataViewKey-driven
 * @notes children 内放 r-* 字段组件（只读模式展示）
 * @notes 工具栏通过结构化 `toolbar` 区域声明
 */
/**
 * RendererDetail - 详情展示容器组件
 */
import { computed, type StyleValue } from 'vue'
import { nodeId } from '@spark-appworks/spark-data'
import {
  SparkComponentRenderer,
} from '../../../internal'
import type { RDetailProps } from './RendererDetail.props'
import {
  buildFormDetailContainerProps,
  useFormDetailContainer,
} from '../../runtime/container-form-detail'
import { createRendererDetailZeroCode } from './zero-code'
import RendererHostScope from '../../support/scope/RendererHostScope.vue'
import DataViewMetaBar from '../DataViewMetaBar.vue'

const props = withDefaults(defineProps<RDetailProps>(), {
  type: 'r-detail',
  gridColumns: 24,
  gridGap: 0,
  gridAutoRows: 'minmax(32px, auto)',
  titleAlign: 'left',
  valueAlign: 'left',
})
const detailPropsValue = computed<Record<string, unknown>>(() => ({ ...(props.detailProps ?? {}) }))

const detailAlignStyle = computed<StyleValue>(() => ({
  '--spark-detail-title-align': props.titleAlign,
  '--spark-detail-value-align': props.valueAlign,
}))

const {
  registerApi,
  logger,
  resolvedView,
  dataState,
  gridChildren,
  gridStyle,
  getChildGridStyle,
  toolbarPositionValue,
  toolbarClassValue,
  visibleToolbarConfigs,
  showToolbar,
  getDefaultScope,
  contextData: detailData,
} = useFormDetailContainer(
  buildFormDetailContainerProps({
    type: props.type,
    ...(props.id !== undefined ? { id: props.id } : {}),
    ...(props.toolbar !== undefined ? { toolbar: props.toolbar } : {}),
    ...(props.children !== undefined ? { children: props.children } : {}),
    ...(props.dataSource !== undefined ? { dataSource: props.dataSource } : {}),
    dataViewKey: props.dataViewKey,
    contextDataMember: props.contextDataMember,
    contextDataField: props.contextDataField,
    autoColumns: props.autoColumns,
    gridColumns: props.gridColumns,
    gridGap: props.gridGap,
    gridAutoRows: props.gridAutoRows,
  }),
  'r-detail',
)

// ── r-detail 包装 API ────────────────────────────────────────────────────

const {
  detailApi,
} = createRendererDetailZeroCode({
  props,
  resolvedView,
  detailData,
  logger,
})

registerApi(detailApi)

</script>

<style scoped>
.renderer-detail-layout {
  display: flex;
  gap: 12px;
  width: 100%;
}

.renderer-detail-layout--top,
.renderer-detail-layout--bottom {
  flex-direction: column;
}

.renderer-detail-layout--bottom {
  flex-direction: column-reverse;
}

.renderer-detail-layout--right {
  flex-direction: row-reverse;
}

.renderer-detail-main {
  min-width: 0;
  flex: 1;
}

.renderer-detail-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.renderer-detail-layout--left .renderer-detail-toolbar,
.renderer-detail-layout--right .renderer-detail-toolbar {
  flex-direction: column;
  align-items: stretch;
}

.renderer-detail-grid-item {
  min-width: 0;
}
</style>

