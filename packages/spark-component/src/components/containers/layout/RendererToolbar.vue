<!--
@module @spark-appworks/spark-component:components/containers/layout/RendererToolbar
职责：实现 RendererToolbar（r-toolbar）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 container/layout-container 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 renderer toolbar 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <!--
    工具栏整体布局：
    - 根容器使用 Grid 做“主区 + 尾区”两列分区。
    - 主区渲染 props.children。
    - 尾区渲染 props.tail.children，并固定右对齐。
  -->
  <div class="renderer-toolbar" :style="rootStyle">
    <div
      v-if="startChildren.length > 0"
      class="renderer-toolbar-lane renderer-toolbar-lane--start"
      :style="laneStyle"
    >
      <SparkComponentRenderer
        v-for="(child, index) in startChildren"
        :key="nodeId(child) ?? `r-toolbar-start-${index}`"
        :config="child"
      />
    </div>

    <div
      v-if="endChildren.length > 0"
      :class="['renderer-toolbar-lane', 'renderer-toolbar-lane--end', props.tail?.class]"
      :style="[laneStyle, { justifyContent: 'end' }]"
    >
      <SparkComponentRenderer
        v-for="(child, index) in endChildren"
        :key="nodeId(child) ?? `r-toolbar-end-${index}`"
        :config="child"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * @description 工具栏容器，flex 水平布局分为起始区（默认 children）和尾部区（r-tail 子节点），组织操作按钮。
 */
import { computed, ref, toRef } from 'vue'
import {
  DATA_ROW,
  DATA_SOURCE,
  SparkComponentRenderer,
  useSparkPageComponent,
} from '../../internal'
import { type SparkNode, type DataView, type DataRow, getSparkNodeChildren, nodeInputProp, nodeId } from '@spark-appworks/spark-data'
import { mergeNodeBeforeRenderProps, resolveNodeBeforeRender } from '../../support/beforeRender'
import type { RToolbarProps } from './RendererToolbar.types'
import { useContainerDataSource } from '../data-views/view-data-source'
import { useDataViewEventBridge } from '../runtime/useDataViewEventBridge'

// ============================================================================
// 1) 组件输入与能力入口
//    - 接收工具栏配置 props
//    - 通过 useSparkPageComponent 获取能力消费/提供接口
// ============================================================================
const props = withDefaults(defineProps<RToolbarProps>(), {
  type: 'r-toolbar',
})

const { sparkConsume, sparkProvide } = useSparkPageComponent(props)

// ============================================================================
// 2) 上下文能力与响应触发器
//    - DATA_SOURCE: 上游提供的数据源
//    - DATA_ROW: 上游行上下文（优先级高于 currentRow）
//    - toolbarReactiveVersion: 事件触发计数器，用于让 beforeRender 相关逻辑重新计算
// ============================================================================
const inheritedDataSource = sparkConsume(DATA_SOURCE)
const inheritedDataRow = sparkConsume(DATA_ROW)
const toolbarReactiveVersion = ref(0)

// ============================================================================
// 3) 数据源解析策略
//    优先级：
//    1. 显式 props.dataSource
//    2. dataViewKey + dataMember 解析得到的 dataSource
//    3. 继承父级 DATA_SOURCE
// ============================================================================
const dataState = useContainerDataSource({
  dataViewKey: toRef(props, 'dataViewKey'),
  contextDataMember: toRef(props, 'dataMember'),
  contextDataField: toRef(props, 'dataField'),
  sparkConsume,
  externalDataSource: computed(() => props.dataSource),
  inheritedDataSource: computed(() => inheritedDataSource),
  provideDataSource: (source: DataView) => {
    // 工具栏子动作通常直接消费 DATA_SOURCE；统一在数据解析层提供。
    sparkProvide(DATA_SOURCE, source)
  },
})
useDataViewEventBridge({
  resolvedView: dataState.resolvedView,
  onCurrentRowChanged: () => {
    toolbarReactiveVersion.value += 1
  },
  onSelectedRowsChanged: () => {
    toolbarReactiveVersion.value += 1
  },
  onRowsChanged: () => {
    toolbarReactiveVersion.value += 1
  },
})

// ============================================================================
// 4) 动作节点预处理（beforeRender 作用域注入）
//    - 解析当前 row / dataSource / permissionSnapshot
//    - 执行 onBeforeRender 并合并 patch
// ============================================================================
function resolveToolbarActionNode(node: SparkNode): SparkNode {
  // 显式读取版本号，建立与 DataView 事件的依赖关系。
  // 事件触发时该值递增，从而让动作节点计算链整体刷新。
  void toolbarReactiveVersion.value

  const dataSource = dataState.resolvedView.value

  // 行上下文优先使用父级明确传入的 DATA_ROW，
  // 若不存在则回退到当前 DataView.currentRow。
  const rowInput = inheritedDataRow ?? dataSource?.currentRow
  const row: DataRow | undefined = rowInput ?? undefined

  const beforeRender = resolveNodeBeforeRender(node, {
    row,
    data: row,
    dataSource,
    permissionSnapshot: dataState.permissionSnapshot.value,
    host: { type: 'r-toolbar' },
  })

  // 工具栏容器仅负责合并 onBeforeRender 的 propsPatch，
  // 具体权限禁用策略仍由叶子动作组件自行解释。
  return mergeNodeBeforeRenderProps(node, beforeRender.propsPatch, {
    markResolved: true,
  })
}

// ============================================================================
// 5) 分区子节点构建
//    - startChildren: 常规 children
//    - endChildren: tail 区 children
//    两者流程一致：提取 SparkNode -> beforeRender 处理 -> visible 过滤
// ============================================================================
const startChildren = computed(() =>
  getSparkNodeChildren(props.children)
    .map(resolveToolbarActionNode)
    .filter((node) => nodeInputProp(node, 'visible') !== false)
)

const endChildren = computed(() =>
  getSparkNodeChildren(props.tail?.children)
    .map(resolveToolbarActionNode)
    .filter((node) => nodeInputProp(node, 'visible') !== false)
)

// ============================================================================
// 6) 布局样式计算
//    - rootStyle: 控制主/尾两列栅格以及列间距
//    - laneStyle: 控制分区内按钮横向流式排列
// ============================================================================
const rootStyle = computed<Record<string, string>>(() => ({
  display: 'grid',
  gridTemplateColumns: endChildren.value.length > 0 ? 'minmax(0, 1fr) auto' : 'minmax(0, 1fr)',
  columnGap: typeof props.zoneGap === 'number' ? `${props.zoneGap}px` : (props.zoneGap ?? '12px'),
  alignItems: props.align ?? 'center',
}))

const laneStyle = computed<Record<string, string>>(() => ({
  display: 'grid',
  gridAutoFlow: 'column',
  gridAutoColumns: 'max-content',
  gap: typeof props.gap === 'number' ? `${props.gap}px` : (props.gap ?? '8px'),
  alignItems: props.align ?? 'center',
  justifyContent: props.justify ?? 'start',
}))
</script>

<style scoped>
.renderer-toolbar {
  width: 100%;
}

.renderer-toolbar-lane {
  min-width: 0;
}

.renderer-toolbar-lane--end {
  justify-self: end;
}
</style>
