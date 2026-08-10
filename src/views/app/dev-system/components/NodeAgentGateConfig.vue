<!--
@module app:views/app/dev-system/components/NodeAgentGateConfig
职责：提供 DevSystem 的 NodeAgentGateConfig 能力，围绕 模块入口、副作用注册或内部组合逻辑 支撑配置调试、节点编辑、预览或开发态状态管理。
边界：只服务开发系统 UI 和调试流程，不作为运行中页面配置真源，也不绕过 ProjectWorkspace 保存链路。
AI用途：需要理解开发系统如何编辑节点和文件时，用本模块定位 views/app/dev-system/components/NodeAgentGateConfig。
-->
<template>
  <div v-if="showGateFields">
    <el-divider content-position="left">AI 闸门</el-divider>
    <el-alert
      type="info"
      :closable="false"
      show-icon
      class="gate-hint"
      title="pageDesign Agent 读取 implGate / effectiveDescription；未放行时 runner fail-fast。"
    />
    <el-form-item label="实现闸门" class="fi fi--wide">
      <el-select
        v-model="implGateModel"
        clearable
        placeholder="默认开放（过渡期）"
        @change="state.markBlueprintDirty"
      >
        <el-option label="关闭 closed" value="closed" />
        <el-option label="放行 open" value="open" />
      </el-select>
    </el-form-item>
    <el-form-item label="上游契约" class="fi fi--wide">
      <el-switch
        v-model="state.blueprintDraft.upstreamContractsSatisfied"
        active-text="已就绪"
        inactive-text="未就绪"
        @change="state.markBlueprintDirty"
      />
    </el-form-item>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { DevState } from '../useDevState'
import { useNodeKindFlags } from '../composables/useNodeKindFlags'

const props = defineProps<{
  state: DevState
}>()

const flags = useNodeKindFlags(props.state)
const showGateFields = computed(() => flags.isPageNode.value || flags.isSubPageNode.value)

const implGateModel = computed({
  get: () => props.state.blueprintDraft.implGate ?? '',
  set: (value: '' | 'closed' | 'open') => {
    props.state.blueprintDraft.implGate = value === '' ? undefined : value
  },
})
</script>

<style scoped>
.gate-hint {
  margin-bottom: 12px;
}
</style>
