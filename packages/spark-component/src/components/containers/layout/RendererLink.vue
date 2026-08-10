<!--
@module @spark-appworks/spark-component:components/containers/layout/RendererLink
职责：实现 RendererLink（r-link）的 Vue 渲染入口，把配置 props、数据上下文和事件桥接成用户可见的组件界面。
边界：负责 container/layout-container 的视图组合与事件转发，不定义跨组件数据模型，也不替代 zero-code 行为 API。
AI用途：需要理解 renderer link 的实际渲染结构、slot/toolbar/状态呈现或事件触发点时，优先查看本模块。
-->
<template>
  <el-link
    v-if="effectiveVisible"
    :type="linkType"
    :underline="underline"
    :disabled="effectiveDisabled"
    :href="href"
    :target="target"
  >
    {{ label }}
    <SparkComponentRenderer
      v-for="(child, index) in resolvedChildren"
      :key="nodeId(child) ?? `r-link-child-${index}`"
      :config="child"
    />
  </el-link>
</template>

<script setup lang="ts">
/**
 * @description 链接组件，可渲染子内容。
 */
import { computed } from 'vue'
import type { DataRow } from '@spark-appworks/spark-data'
import {
  DATA_ROW,
  DATA_SOURCE,
  SparkComponentRenderer,
  getSparkNodeChildren,
  nodeId,
  useSparkPageComponent,
  type SparkNode,
} from '../../internal'
import type { RLinkProps } from './RendererLink.props'
import { usePermission, extractPermissionSnapshot } from '../../../permission'



const props = withDefaults(defineProps<RLinkProps>(), {
  type: 'r-link',
  linkType: 'default',
  underline: true,
  target: '_self',
})

const { isVisible, isDisabled, resolvedProps, sparkConsume } = useSparkPageComponent(props)
const permission = usePermission()

function readActionNode(): SparkNode {
  return {
    type: props.type,
    props: resolvedProps.value,
    ...(props.children !== undefined ? { children: props.children } : {}),
  }
}

function resolvePermissionScopeRows(): DataRow[] {
  const dataRow = sparkConsume(DATA_ROW)
  if (dataRow !== null) {
    return [dataRow]
  }
  const dataSource = sparkConsume(DATA_SOURCE)
  if (dataSource && dataSource.isMultiSelect === true) {
    const selected = dataSource.selectedRows ?? []
    return selected.length > 0 ? selected.slice() : []
  }
  const currentRow = dataSource?.currentRow
  return currentRow !== null && currentRow !== undefined ? [currentRow] : []
}

const permissionAllowed = computed(() => {
  const actionNode = readActionNode()
  const dataSource = sparkConsume(DATA_SOURCE)
  const permissionSnapshot = extractPermissionSnapshot(dataSource)

  if (!permission.isModelActionAllowed(actionNode, permissionSnapshot)) return false

  const scopeRows = resolvePermissionScopeRows()
  if (scopeRows.length === 0) {
    return permission.isRowActionAllowed(actionNode, undefined)
  }
  return scopeRows.every((row) => permission.isRowActionAllowed(actionNode, row))
})

const permissionDeniedMode = computed<'disable' | 'hide'>(() => {
  const mode = resolvedProps.value['permissionDeniedMode']
  return mode === 'hide' ? 'hide' : 'disable'
})

const effectiveVisible = computed(() => {
  if (!isVisible.value) return false
  if (permissionAllowed.value) return true
  return permissionDeniedMode.value !== 'hide'
})

const effectiveDisabled = computed(() => {
  if (!permissionAllowed.value && permissionDeniedMode.value === 'disable') {
    return true
  }
  return isDisabled.value
})

const resolvedChildren = computed(() => getSparkNodeChildren(props.children))
</script>


