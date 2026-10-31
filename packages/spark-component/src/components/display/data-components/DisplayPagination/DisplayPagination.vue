<!--
@module @spark-appworks/spark-component:components/display/data-components/DisplayPagination/DisplayPagination
职责：实现 DisplayPagination（display-pagination）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 display/data-display 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 display pagination 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <el-pagination
    v-if="isVisible"
    :total="resolvedTotal"
    :page-size="resolvedPageSize"
    :current-page="resolvedCurrentPage"
    :page-sizes="pageSizes"
    :pager-count="pagerCount"
    :layout="layout"
    :background="background"
    :small="small"
    :disabled="isDisabled"
    :hide-on-single-page="hideOnSinglePage"
    @update:current-page="handleCurrentChange"
    @update:page-size="handleSizeChange"
  />
</template>

<script setup lang="ts">
/**
 * @description 分页控制组件；绑定 DataView（dataViewKey 或继承的数据上下文）时读取其 total/page/pageSize 并调用 setPage/setPageSize 翻页，未绑定时按 props 呈现并只触发事件。
 */
import { computed, toRef } from 'vue'
import { useSparkPageComponent, DATA_SOURCE } from '../../../internal'
import { useContainerDataSource } from '../../../containers/data-views/view-data-source'
import type { RPaginationProps } from './DisplayPagination.props'

const props = withDefaults(defineProps<RPaginationProps>(), {
  type: 'r-pagination',
  pageSize: 10,
  currentPage: 1,
  pageSizes: () => [10, 20, 50, 100],
  pagerCount: 7,
  layout: 'total, sizes, prev, pager, next, jumper',
  background: true,
  small: false,
  hideOnSinglePage: false,
})

const emit = defineEmits<{
  'update:currentPage': [page: number]
  'update:pageSize': [size: number]
}>()

const { isVisible, isDisabled, sparkConsume, logger } = useSparkPageComponent(props)
const dataState = useContainerDataSource({dataViewKey: toRef(props, 'dataViewKey'), sparkConsume,
  inheritedDataSource: () => sparkConsume(DATA_SOURCE), skipEffects: true, logger, logPrefix: 'DisplayPagination'})
const view = dataState.resolvedView

const resolvedTotal = computed(() => view.value ? dataState.total.value : props.total ?? 0)
const resolvedPageSize = computed(() => view.value ? dataState.pageSize.value : props.pageSize)
const resolvedCurrentPage = computed(() => view.value ? dataState.page.value : props.currentPage)

function handleCurrentChange(page: number) {
  emit('update:currentPage', page)
  view.value?.setPage(page).catch((error: unknown) => logger.error('DisplayPagination: setPage() 失败', error))
}

function handleSizeChange(size: number) {
  emit('update:pageSize', size)
  view.value?.setPageSize(size).catch((error: unknown) => logger.error('DisplayPagination: setPageSize() 失败', error))
}
</script>


