<!--
@module @spark-appworks/spark-component:components/containers/support/scope/RendererHostScope
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
import { inject, provide, shallowReactive, toRaw, watch } from 'vue'
import { type SparkNode, type DataRow, nodeId } from '@spark-appworks/spark-data'
import {
  DATA_SOURCE,
  DATA_ROW,
  SparkComponentRenderer,
  useSparkComponent,
  useSparkConsume,
} from '../../../internal'
import { resolveDataViewRow, resolveReactiveRow, syncReactiveRow } from './row-mirror-sync'
import {FIELD_ROW_CONTEXT} from '../../../fields/context/row/fieldRowContext'
import {ROW_ITEM_CONTEXT} from './row-item-context'

const props = withDefaults(defineProps<{
  type?: string
  row?: DataRow | undefined
  /** 集合行项的动作边界；表单/详情展示宿主不新建该边界。 */
  rowItem?: boolean
  children?: SparkNode[]
}>(), {
  type: 'r-host-data-scope',
  children: () => [],
  rowItem: false,
})

const { sparkProvide, sparkRemove } = useSparkComponent({ type: props.type })
const {sparkConsume} = useSparkConsume()
const inheritedView = sparkConsume(DATA_SOURCE)
const inheritedRowContext = inject(FIELD_ROW_CONTEXT, undefined)
if (props.rowItem) {
  const view = () => sparkConsume(DATA_SOURCE)
  provide(ROW_ITEM_CONTEXT, {view, row: () => {
    const source = view()
    return source ? resolveDataViewRow(source, props.row) : resolveReactiveRow(props.row)
  }})
}
let ownsFormalRow = false
// 正式逐行宿主优先于外层表单固定行；表单镜像/局部JSON模型不冒充原记录。
provide(FIELD_ROW_CONTEXT, {row: source => {
  if (source && toRaw(source) === toRaw(inheritedView)) {
    const row = resolveDataViewRow(source, props.row)
    const original = props.row && toRaw(resolveReactiveRow(props.row)) === toRaw(props.row)
    if (row && original) {ownsFormalRow = true; return row}
    if (ownsFormalRow) return null
  }
  return inheritedRowContext?.row(source)
}})

const rowMirror = shallowReactive<DataRow>({})
let hasProvidedRow = false

function resolveInputRow(): DataRow | undefined {
  return props.row
}

watch(
  [resolveInputRow, () => resolveReactiveRow(props.row)],
  ([newRow]) => {
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
    const sourceRow = resolveDataViewRow(inheritedView, newRow)
    syncReactiveRow(rowMirror, newRow, sourceRow ? {sourceRow} : undefined)
  },
  { immediate: true, deep: true },
)

</script>
