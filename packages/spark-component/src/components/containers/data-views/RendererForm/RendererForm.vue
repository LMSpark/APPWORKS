<!--
@module @spark-appworks/spark-component:components/containers/data-views/RendererForm/RendererForm
职责：实现 RendererForm（r-form）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 table-level/data-view-container 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 renderer form 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <div :class="['renderer-form-layout', `renderer-form-layout--${toolbarPositionValue}`]">
    <div v-if="showToolbar" :class="['renderer-form-toolbar', toolbarClassValue]">
        <SparkComponentRenderer
          v-for="(action, index) in visibleToolbarConfigs"
          :key="nodeId(action) ?? `r-form-toolbar-${index}`"
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

    <el-form ref="nativeFormRef" class="renderer-form-main" :model="formModel" :label-width="labelWidth" v-bind="formPropsValue">
        <div class="renderer-form-grid" :style="gridStyle">
          <div
            v-for="(child, index) in gridChildren"
            :key="nodeId(child) ?? `r-form-child-${index}`"
            class="renderer-form-grid-item"
            :style="getChildGridStyle(child)"
          >
            <RendererHostScope :row="formModel">
              <SparkComponentRenderer :config="child" />
            </RendererHostScope>
          </div>
          <RendererHostScope :row="formModel">
            <slot v-bind="getDefaultScope()" />
          </RendererHostScope>
        </div>
    </el-form>
  </div>
</template>

<script setup lang="ts">
/**
 * @description 数据表单容器，通过 CONTEXT_DATA 能力向子组件暴露表单数据。
 * @category container
 * @binding dataViewKey-driven
 * @notes children 内放 r-* 字段组件用于编辑 currentRow
 * @notes 工具栏通过结构化 `toolbar` 区域声明
 */
/**
 * RendererForm - 表单容器组件
 */
import { computed, ref } from 'vue'
import { nodeId } from '@spark-appworks/spark-data'
import {
  SparkComponentRenderer,
} from '../../../internal'
import type { RFormProps } from './RendererForm.props'
import {
  buildFormDetailContainerProps,
  useFormDetailContainer,
} from '../../runtime/container-form-detail'
import { createRendererFormZeroCode } from './zero-code'
import RendererHostScope from '../../support/RendererHostScope.vue'
import DataViewMetaBar from '../DataViewMetaBar.vue'

const props = withDefaults(defineProps<RFormProps>(), {
  type: 'r-form',
  labelWidth: '100px',
  gridColumns: 24,
  gridGap: 0,
  gridAutoRows: 'minmax(32px, auto)',
})

const formPropsValue = computed<Record<string, unknown>>(() => ({ ...(props.formProps ?? {}) }))

const {
  registerApi,
  logger,
  resolvedView,
  dataState,
  contextData: formModel,
  gridChildren,
  gridStyle,
  getChildGridStyle,
  toolbarPositionValue,
  toolbarClassValue,
  visibleToolbarConfigs,
  showToolbar,
  getDefaultScope,
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
  'r-form',
)

const nativeFormRef = ref<unknown>(null)
const {
  formApi,
} = createRendererFormZeroCode({
  props,
  resolvedView,
  formModel,
  nativeFormRef,
  logger,
})

registerApi(formApi)

</script>

<style scoped>
.renderer-form-layout {
  display: flex;
  gap: 12px;
  width: 100%;
}

.renderer-form-layout--top,
.renderer-form-layout--bottom {
  flex-direction: column;
}

.renderer-form-layout--bottom {
  flex-direction: column-reverse;
}

.renderer-form-layout--right {
  flex-direction: row-reverse;
}

.renderer-form-main {
  min-width: 0;
  flex: 1;
}

.renderer-form-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.renderer-form-layout--left .renderer-form-toolbar,
.renderer-form-layout--right .renderer-form-toolbar {
  flex-direction: column;
  align-items: stretch;
}

.renderer-form-grid-item {
  min-width: 0;
}
</style>

