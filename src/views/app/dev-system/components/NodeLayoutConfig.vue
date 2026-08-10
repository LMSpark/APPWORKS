<!--
@module app:views/app/dev-system/components/NodeLayoutConfig
职责：提供 DevSystem 的 NodeLayoutConfig 能力，围绕 模块入口、副作用注册或内部组合逻辑 支撑配置调试、节点编辑、预览或开发态状态管理。
边界：只服务开发系统 UI 和调试流程，不作为运行中页面配置真源，也不绕过 ProjectWorkspace 保存链路。
AI用途：需要理解开发系统如何编辑节点和文件时，用本模块定位 views/app/dev-system/components/NodeLayoutConfig。
-->
<template>
  <div v-if="flags.isDirectoryNode.value">
    <el-divider content-position="left">布局配置</el-divider>
    <el-form-item label="子项布局" class="fi fi--wide">
      <el-radio-group v-model="state.blueprintDraft.childPlacement" @change="state.markBlueprintDirty">
        <el-radio-button
          v-for="option in CHILD_PLACEMENT_OPTIONS"
          :key="option.value || '__default__'"
          :value="option.value"
        >
          {{ option.label }}
        </el-radio-button>
      </el-radio-group>
    </el-form-item>
  </div>
</template>

<script setup lang="ts">
import type { DevState } from '../useDevState'
import { useNodeKindFlags } from '../composables/useNodeKindFlags'
import { CHILD_PLACEMENT_OPTIONS } from '../childPlacementLabels'

const props = defineProps<{ state: DevState }>()

const flags = useNodeKindFlags(props.state)
</script>
