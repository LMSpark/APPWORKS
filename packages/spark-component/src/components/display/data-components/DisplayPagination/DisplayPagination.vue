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
 * @description 分页控制组件，触发页码/页大小变更事件。
 */
import { computed } from 'vue'
import { useSparkPageComponent, useSparkConsume, DATA_SOURCE } from '../../../internal'
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

const { isVisible, isDisabled } = useSparkPageComponent(props)

const { sparkConsume } = useSparkConsume()
const dataSource = sparkConsume(DATA_SOURCE)

const resolvedTotal = computed(() => {
  if (props.total !== undefined) return props.total
  return dataSource?.total ?? 0
})

const resolvedPageSize = computed(() => {
  return dataSource?.pageSize ?? props.pageSize
})

const resolvedCurrentPage = computed(() => {
  return dataSource?.page ?? props.currentPage
})

function handleCurrentChange(page: number) {
  emit('update:currentPage', page)
}

function handleSizeChange(size: number) {
  emit('update:pageSize', size)
}
</script>


