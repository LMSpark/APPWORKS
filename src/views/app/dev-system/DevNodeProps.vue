<!--
@module app:views/app/dev-system/DevNodeProps
职责：提供 DevSystem 的 DevNodeProps 能力，围绕 模块入口、副作用注册或内部组合逻辑 支撑配置调试、节点编辑、预览或开发态状态管理。
边界：只服务开发系统 UI 和调试流程，不作为运行中页面配置真源，也不绕过 ProjectWorkspace 保存链路。
AI用途：需要理解开发系统如何编辑节点和文件时，用本模块定位 views/app/dev-system/DevNodeProps。
-->
<template>
  <div class="dev-node-props">
    <!-- 自动保存状态指示器 -->
    <transition name="fade">
      <div v-if="autoSaveVisible" class="auto-save-indicator">
        <el-tag v-if="state.autoSaveStatus.value === 'pending'" type="info" size="small" effect="plain">
          <NavIcon name="Clock" :size="12" /> 待保存…
        </el-tag>
        <el-tag v-else-if="state.autoSaveStatus.value === 'saving'" type="info" size="small" effect="dark">
          <NavIcon name="Loading" :size="12" /> 保存中…
        </el-tag>
        <el-tag v-else-if="state.autoSaveStatus.value === 'saved'" type="success" size="small" effect="plain">
          <NavIcon name="SuccessFilled" :size="12" /> 已自动保存
        </el-tag>
        <el-tag v-else-if="state.autoSaveStatus.value === 'error'" type="danger" size="small" effect="plain">
          <NavIcon name="CircleCloseFilled" :size="12" /> 保存失败
        </el-tag>
      </div>
    </transition>

    <el-form :model="state.blueprintDraft" label-width="100px" size="default" class="node-form">
      <NodeBasicInfo :state="state" />
      <NodeTargetConfig :state="state" />
      <NodeLayoutConfig :state="state" />
      <NodeStateConfig :state="state" />
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { DevState } from './useDevState'
import NavIcon from '@/components/NavIcon.vue'
import NodeBasicInfo from './components/NodeBasicInfo.vue'
import NodeTargetConfig from './components/NodeTargetConfig.vue'
import NodeLayoutConfig from './components/NodeLayoutConfig.vue'
import NodeStateConfig from './components/NodeStateConfig.vue'

const props = defineProps<{ state: DevState }>()

const autoSaveVisible = computed(() => props.state.autoSaveStatus.value !== 'idle')
</script>

<style scoped>
.dev-node-props {
  padding: 12px 16px 20px;
  overflow: auto;
  height: 100%;
  background: var(--el-bg-color);
}

.system-dir-alert {
  margin-bottom: 12px;
}

.node-form {
  max-width: 960px;
  --fi-wide: 100%;
  --fi-medium: 520px;
  --fi-narrow: 240px;
}

.node-form :deep(.fi .el-form-item__content > *) {
  width: 100%;
}

.node-form :deep(.fi--wide .el-form-item__content > *) {
  max-width: var(--fi-wide);
}

.node-form :deep(.fi--medium .el-form-item__content > *) {
  max-width: var(--fi-medium);
}

.node-form :deep(.fi--narrow .el-form-item__content > *) {
  max-width: var(--fi-narrow);
}

.node-form :deep(.switch-item .el-form-item__content) {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

.node-form :deep(.path-status-item) {
  margin-top: -4px;
}

.node-form :deep(.path-status-item .el-form-item__content) {
  justify-content: flex-start;
}

.auto-save-indicator {
  position: sticky;
  top: 0;
  z-index: 1;
  text-align: right;
  margin-bottom: 4px;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.dev-node-props :deep(.el-tag) {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.dev-node-props :deep(.el-form-item) {
  margin-bottom: 14px;
}

.dev-node-props :deep(.el-form-item__label) {
  color: var(--el-text-color-secondary);
  font-weight: 600;
}

.dev-node-props :deep(.el-divider--horizontal) {
  margin: 22px 0 14px;
}

.dev-node-props :deep(.el-divider__text) {
  font-size: 13px;
  font-weight: 700;
  color: var(--el-text-color-primary);
  letter-spacing: 0.2px;
}

.dev-node-props :deep(.el-input),
.dev-node-props :deep(.el-select),
.dev-node-props :deep(.el-input-number) {
  width: 100%;
}

.dev-node-props :deep(.el-radio-group) {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(88px, 1fr));
  gap: 6px;
  width: 100%;
}

.dev-node-props :deep(.el-radio-button) {
  margin: 0;
  width: 100%;
}

.dev-node-props :deep(.el-radio-button__inner) {
  border-left: 1px solid var(--el-border-color) !important;
  border-radius: 6px !important;
  width: 100%;
  text-align: center;
}

.dev-node-props :deep(.el-input-number) {
  max-width: 220px;
}

.dev-node-props :deep(.type-radio-group) {
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 8px;
}

.dev-node-props :deep(.type-radio-group .el-radio-button__inner) {
  min-height: 34px;
  padding: 8px 6px;
  font-size: 12px;
  line-height: 1.2;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@media (max-width: 1200px) {
  .dev-node-props {
    padding: 10px 12px 16px;
  }

  .dev-node-props :deep(.type-radio-group) {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  .node-form {
    --fi-medium: 100%;
    --fi-narrow: 100%;
  }

  .node-form :deep(.switch-item__hint) {
    display: none;
  }
}
</style>
