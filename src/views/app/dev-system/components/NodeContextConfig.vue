<!--
@module app:views/app/dev-system/components/NodeContextConfig
职责：提供 DevSystem 的 NodeContextConfig 能力，围绕 模块入口、副作用注册或内部组合逻辑 支撑配置调试、节点编辑、预览或开发态状态管理。
边界：只服务开发系统 UI 和调试流程，不作为运行中页面配置真源，也不绕过 ProjectWorkspace 保存链路。
AI用途：需要理解开发系统如何编辑节点和文件时，用本模块定位 views/app/dev-system/components/NodeContextConfig。
-->
<template>
  <template v-if="isDirectoryNode">
    <el-divider content-position="left">模块上下文（Context）</el-divider>
    <el-form-item label="启用上下文" class="switch-item">
      <el-switch v-model="state.blueprintDraft.hasContext" @change="state.toggleContext" />
      <span class="switch-item__hint">启用后可配置下拉上下文选项</span>
    </el-form-item>
    <template v-if="state.blueprintDraft.hasContext">
      <el-form-item label="选项列表" class="fi fi--wide">
        <div class="context-items">
          <div v-for="(item, idx) in state.contextEdit.items" :key="idx" class="context-item-row">
            <el-input v-model="item.id" class="context-item-row__id" placeholder="ID" @change="state.commitContextEdit" />
            <el-input v-model="item.title" class="context-item-row__title" placeholder="显示名称" @change="state.commitContextEdit" />
            <el-button size="small" link type="danger" @click="state.removeContextItem(idx)">
              <NavIcon name="CloseBold" :size="12" />
            </el-button>
          </div>
          <el-button size="small" type="primary" link @click="state.addContextItem">
            <NavIcon name="Plus" :size="12" /> 新增选项
          </el-button>
        </div>
      </el-form-item>
      <el-form-item label="占位文字" class="fi fi--medium">
        <el-input v-model="state.contextEdit.placeholder" placeholder="请选择" />
      </el-form-item>
      <el-form-item label="默认值" class="fi fi--medium">
        <el-input v-model="state.contextEdit.defaultValue" placeholder="默认选中的 ID" />
      </el-form-item>
      <el-form-item label="URL 参数名" class="fi fi--medium">
        <el-input v-model="state.contextEdit.paramName" placeholder="同步到 route.query 的键名" />
      </el-form-item>
    </template>
  </template>
</template>

<script setup lang="ts">
import type { DevState } from '../useDevState'
import { useNodeKindFlags } from '../composables/useNodeKindFlags'
import NavIcon from '@/components/NavIcon.vue'

const props = defineProps<{ state: DevState }>()
const flags = useNodeKindFlags(props.state)
const isDirectoryNode = flags.isDirectoryNode
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
.context-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  padding: 10px;
  border: 1px dashed var(--el-border-color);
  border-radius: 8px;
  background: var(--el-fill-color-extra-light);
}
.context-item-row {
  display: grid;
  grid-template-columns: minmax(140px, 180px) minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
}
.context-item-row__id,
.context-item-row__title {
  width: 100%;
}
</style>
