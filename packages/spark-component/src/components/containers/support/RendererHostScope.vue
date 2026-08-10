<!--
@module @spark-appworks/spark-component:components/containers/support/RendererHostScope
职责：维护 @spark-appworks/spark-component 中 components/containers/support/RendererHostScope 的模块能力，围绕 模块入口、副作用注册或内部组合逻辑 提供稳定的公开契约。
边界：只覆盖当前模块职责，不把相邻包、运行时副作用或业务配置混入同一语义入口。
AI用途：需要定位 components/containers/support/RendererHostScope 的声明、导出和使用边界时，从本模块开始。
-->
<template>
  <template v-for="(child, index) in props.children" :key="nodeId(child) ?? index">
    <SparkComponentRenderer :config="child" />
  </template>
  <slot />
</template>

<script setup lang="ts">
/**
 * 作用域 host 载体：为子树提供行数据。
 *
 * 主要职责：
 * 1. 按 row 有条件地 provide DATA_ROW（通过 rowMirror 同步，防止引用替换）。
 * 2. 渲染 children 子节点（也可用 slot 替代）。
 */
import { shallowReactive, watch } from 'vue'
import { type SparkNode, type DataRow, nodeId } from '@spark-appworks/spark-data'
import {
  DATA_ROW,
  SparkComponentRenderer,
  useSparkComponent,
} from '../../internal'
import { syncReactiveRow } from './row-mirror-sync'

const props = withDefaults(defineProps<{
  type?: string
  row?: DataRow | undefined
  children?: SparkNode[]
}>(), {
  type: 'r-host-data-scope',
  children: () => [],
})

const { sparkProvide, sparkRemove } = useSparkComponent({ type: props.type })

const rowMirror = shallowReactive<DataRow>({})
let hasProvidedRow = false

function resolveInputRow(): DataRow | undefined {
  return props.row
}

watch(
  resolveInputRow,
  (newRow) => {
    if (newRow === undefined) {
      if (hasProvidedRow) {
        sparkRemove(DATA_ROW)
        hasProvidedRow = false
      }
      return
    }
    if (!hasProvidedRow) {
      sparkProvide(DATA_ROW, rowMirror)
      hasProvidedRow = true
    }
    syncReactiveRow(rowMirror, newRow)
  },
  { immediate: true, deep: true },
)

</script>
