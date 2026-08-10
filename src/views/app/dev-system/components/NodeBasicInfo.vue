<!--
@module app:views/app/dev-system/components/NodeBasicInfo
职责：提供 DevSystem 的 NodeBasicInfo 能力，围绕 模块入口、副作用注册或内部组合逻辑 支撑配置调试、节点编辑、预览或开发态状态管理。
边界：只服务开发系统 UI 和调试流程，不作为运行中页面配置真源，也不绕过 ProjectWorkspace 保存链路。
AI用途：需要理解开发系统如何编辑节点和文件时，用本模块定位 views/app/dev-system/components/NodeBasicInfo。
-->
<template>
  <div>
    <el-divider content-position="left">基础信息</el-divider>
    <el-form-item label="节点 ID" class="fi fi--wide">
      <el-input :model-value="state.blueprintDraft.id" disabled placeholder="NODE_ID" />
    </el-form-item>
    <el-form-item label="标题" class="fi fi--wide">
      <el-input v-model="state.blueprintDraft.title" placeholder="显示名称" @change="state.markBlueprintDirty" />
    </el-form-item>
    <div class="fi-inline-row">
      <el-form-item label="图标" class="fi fi--narrow fi-inline-row__icon">
        <IconPicker
          v-model="state.blueprintDraft.icon"
          class="icon-picker-compact"
          placeholder="选择图标"
          width="220"
          @update:model-value="state.markBlueprintDirty"
        />
      </el-form-item>
      <el-form-item label="蓝图业务类型" class="fi fi--medium fi-inline-row__type">
        <el-select v-model="state.blueprintDraft.blueprintKind" @change="state.markBlueprintDirty">
          <el-option v-for="option in blueprintKindOptions" :key="option.value" :label="option.label" :value="option.value" />
        </el-select>
      </el-form-item>
    </div>
    <el-form-item label="运行交付投影" class="fi fi--wide">
        <el-radio-group :model-value="nodeKindUiValue" class="type-radio-group" @change="onNodeKindUiChange">
          <el-radio-button value="system-directory">系统模块</el-radio-button>
          <el-radio-button value="module" :disabled="moduleKindDisabled">模块</el-radio-button>
          <el-radio-button value="system-page">系统页面</el-radio-button>
          <el-radio-button value="system-action">系统动作</el-radio-button>
          <el-radio-button value="page">普通页面</el-radio-button>
          <el-radio-button value="link">超链接</el-radio-button>
          <el-radio-button value="nested-page">子页面</el-radio-button>
          <el-radio-button value="ref">跨工程引用</el-radio-button>
        </el-radio-group>
    </el-form-item>
    <el-form-item label="功能描述" class="fi fi--wide">
      <el-input
        v-model="state.blueprintDraft.description"
        type="textarea"
        :autosize="{ minRows: 4, maxRows: 12 }"
        placeholder="页面功能策划，也是 AI 用户需求。&#10;示例：级联操作演示页 — 展示 DataSet 主从表联动，父表选中行变更自动驱动子表数据过滤与刷新。"
        @change="state.markBlueprintDirty"
      />
    </el-form-item>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ProjectBlueprintDeliveryKind, ProjectBlueprintNodeKind } from '@spark-appworks/spark-project-model'
import { isNestedConfigPageNode } from '@spark-appworks/spark-project-model'
import type { DevState } from '../useDevState'
import IconPicker from '@/components/IconPicker.vue'

const props = defineProps<{
  state: DevState
  moduleKindDisabled: boolean
}>()

const blueprintKindOptions: ReadonlyArray<{ value: ProjectBlueprintNodeKind; label: string }> = [
  { value: 'project', label: '项目' },
  { value: 'module', label: '模块' },
  { value: 'requirement', label: '需求' },
  { value: 'prototype', label: '原型' },
  { value: 'data-space', label: '数据空间' },
  { value: 'page', label: '页面' },
  { value: 'sub-page', label: '子页面' },
  { value: 'report', label: '报表' },
  { value: 'workflow', label: '工作流' },
  { value: 'integration', label: '集成' },
  { value: 'action', label: '动作' },
  { value: 'external', label: '外部资源' },
  { value: 'permission-management', label: '权限管理' },
  { value: 'unresolved', label: '待确认' },
]

const nodeKindUiValue = computed(() =>
  isNestedConfigPageNode(props.state.blueprintDraft) ? 'nested-page' : props.state.blueprintDraft.nodeKind,
)

function onNodeKindUiChange(value: string): void {
  if (value === 'nested-page') {
    props.state.applyNestedConfigPagePreset()
    return
  }
  if (isDeliveryKind(value)) props.state.handleNodeKindChange(value)
}

function isDeliveryKind(value: string): value is ProjectBlueprintDeliveryKind {
  return value === 'system-directory'
    || value === 'module'
    || value === 'system-page'
    || value === 'system-action'
    || value === 'page'
    || value === 'link'
    || value === 'ref'
}
</script>

<style scoped>
.fi-inline-row {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}
.icon-picker-compact {
  width: 100%;
}
</style>
