<!--
@module app:views/app/dev-system/components/NodeStateConfig
职责：提供 DevSystem 的 NodeStateConfig 能力，围绕 模块入口、副作用注册或内部组合逻辑 支撑配置调试、节点编辑、预览或开发态状态管理。
边界：只服务开发系统 UI 和调试流程，不作为运行中页面配置真源，也不绕过 ProjectWorkspace 保存链路。
AI用途：需要理解开发系统如何编辑节点和文件时，用本模块定位 views/app/dev-system/components/NodeStateConfig。
-->
<template>
  <div>
    <el-divider content-position="left">状态控制</el-divider>
    <el-form-item label="隐藏" class="switch-item">
      <el-switch v-model="state.blueprintDraft.hidden" :disabled="isSubPage" @change="state.markBlueprintDirty" />
      <span class="switch-item__hint">
        {{ isSubPage ? '子页面固定为隐藏（true 持久化）' : '不投影到运行菜单（仅 true 持久化，false 为默认值不落库）' }}
      </span>
    </el-form-item>
    <el-form-item label="禁用" class="switch-item">
      <el-switch v-model="state.blueprintDraft.disabled" @change="state.markBlueprintDirty" />
      <span class="switch-item__hint">保留显示但不可点击（仅 true 持久化，false 为默认值不落库）</span>
    </el-form-item>
    <el-form-item label="后置分割线" class="switch-item">
      <el-switch v-model="state.blueprintDraft.dividerAfter" @change="state.markBlueprintDirty" />
      <span class="switch-item__hint">在当前节点后显示分割线</span>
    </el-form-item>

    <el-divider content-position="left">权限控制</el-divider>
    <el-form-item label="权限模式">
      <el-radio-group v-model="state.blueprintDraft.permissionMode" @change="state.markBlueprintDirty">
        <el-radio value="none">不控制</el-radio>
        <el-radio value="masked">可见+脱敏</el-radio>
        <el-radio value="invisible">不可见</el-radio>
      </el-radio-group>
    </el-form-item>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { isNestedConfigPageNode } from '@spark-appworks/spark-project-model'
import type { DevState } from '../useDevState'

const props = defineProps<{ state: DevState }>()

const isSubPage = computed(() => isNestedConfigPageNode(props.state.blueprintDraft))
</script>

<style scoped>
.switch-item :deep(.el-form-item__content) {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}
.switch-item__hint {
  color: var(--el-text-color-placeholder);
  font-size: 12px;
}
</style>
