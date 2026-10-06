<!--
@module app:views/app/dev-system/ProjectBlueprintTree
职责：提供 DevSystem 的项目蓝图树，展示并编辑需求、原型、数据空间与交付节点。
边界：只服务开发系统 UI 和调试流程，不作为运行中页面配置真源，也不绕过 ProjectWorkspace 保存链路。
AI用途：需要理解开发系统如何编辑项目蓝图节点时，用本模块定位 views/app/dev-system/ProjectBlueprintTree。
-->
<template>
  <div class="dev-tree">
    <div class="dev-tree__toolbar">
      <el-input
        v-model="treeFilter"
        placeholder="搜索节点…"
        clearable
        size="small"
        style="flex: 1"
      />
      <el-button size="small" type="primary" @click="state.addRootNode()" title="新增模块">
        <NavIcon name="Plus" :size="14" />
      </el-button>
      <el-dropdown size="small" trigger="click">
        <el-button size="small">
          <NavIcon name="MoreFilled" :size="14" />
        </el-button>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item @click="expandAll">展开全部</el-dropdown-item>
            <el-dropdown-item @click="collapseAll">折叠全部</el-dropdown-item>
            <el-dropdown-item divided @click="state.openProjectPlanningDocumentImportDialog()">
              <NavIcon name="Upload" :size="14" /> 导入项目策划文档
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
    <el-empty v-if="state.blueprintEmpty.value" description="项目蓝图为空" />
    <el-tree
      v-else
      ref="treeRef"
      :data="state.treeData.value"
      node-key="nodeId"
      :props="{ label: nodeLabel, children: 'children' }"
      :default-expand-all="true"
      :filter-node-method="filterNode"
      highlight-current
      draggable
      :allow-drag="allowNodeDrag"
      :allow-drop="allowNodeDrop"
      :expand-on-click-node="false"
      @node-click="handleNodeClick"
      @node-drop="handleNodeDrop"
    >
      <template #default="{ node, data }">
        <span class="tree-node">
          <span class="node-icon">
            <NavIcon
              :name="data.navigation?.icon ?? ''"
              :fallback="data.children?.length ? 'Folder' : data.kind === 'module' ? 'Grid' : 'Document'"
            />
          </span>
          <span class="node-label">{{ nodeLabel(data) }}</span>
          <el-tag size="small" type="success" class="node-tag node-kind-tag">
            {{ formatNodeKind(data) }}
          </el-tag>
          <span v-if="data.navigation?.target" class="node-path">{{ data.navigation?.target }}</span>
          <el-tag v-if="data.navigation?.placement" size="small" type="info" class="node-tag">
            {{ formatNavigationPlacementLabel(data.navigation?.placement) }}
          </el-tag>
          <span class="node-actions">
            <el-button size="small" link type="primary" @click.stop="state.addChildNode(data)">
              <NavIcon name="Plus" :size="12" />
            </el-button>
            <el-button
              size="small"
              link
              type="danger"
              @click.stop="handleRemove(node, data)"
            >
              <NavIcon name="Delete" :size="12" />
            </el-button>
          </span>
        </span>
      </template>
    </el-tree>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { ElMessageBox } from 'element-plus'
import type { ProjectBlueprintTreeNodeData } from '@spark-appworks/spark-project-model'
import type { DevState } from './useDevState'
import { formatNavigationPlacementLabel } from './childPlacementLabels'
import NavIcon from '@/components/NavIcon.vue'

const props = defineProps<{ state: DevState }>()
const state = props.state

const treeRef = ref()
const treeFilter = ref('')

const NODE_KIND_LABEL: Record<string,string> = {module:'模块',page:'页面',embedded:'嵌入内容',service:'服务',content:'内容',unknown:'待确认'}
function nodeLabel(node: ProjectBlueprintTreeNodeData): string { return node.navigation?.title ?? node.capability.name }
function formatNodeKind(node: ProjectBlueprintTreeNodeData): string { return NODE_KIND_LABEL[node.kind] ?? node.kind }

watch(treeFilter, (val) => { treeRef.value?.filter(val) })

// 同步 el-tree 高亮到 selectedNode
watch(() => state.selectedNode.value, async (node) => {
  if (node) {
    await nextTick()
    treeRef.value?.setCurrentKey(node.nodeId)
  }
}, { immediate: true })

function filterNode(value: string, data: ProjectBlueprintTreeNodeData) {
  if (!value) return true
  const v = value.toLowerCase()
  return nodeLabel(data).toLowerCase().includes(v) ||
    data.nodeId.toLowerCase().includes(v) ||
    (data.navigation?.target?.toLowerCase().includes(v) ?? false)
}

async function handleNodeClick(data: ProjectBlueprintTreeNodeData) {
  await state.selectNode(data)
}

function allowNodeDrag(data: ProjectBlueprintTreeNodeData): boolean {
  return data.nodeId !== state.project.rootNode?.id
}

function allowNodeDrop(draggingNode: { data: ProjectBlueprintTreeNodeData }): boolean {
  return draggingNode.data.nodeId !== state.project.rootNode?.id
}

function handleNodeDrop(draggingNode: { data: ProjectBlueprintTreeNodeData }) {
  void state.moveNodeInTree(draggingNode.data)
}

async function handleRemove(node: { parent: { data: ProjectBlueprintTreeNodeData } }, data: ProjectBlueprintTreeNodeData) {
  try {
    await ElMessageBox.confirm(
      `确定删除 "${nodeLabel(data)}"？${data.children?.length ? `（含 ${data.children.length} 个子节点）` : ''}`,
      '确认删除',
      { type: 'warning' },
    )
  } catch { return }
  state.removeNodeFromTree(node, data)
}

function expandAll() {
  for (const k of getAllKeys(state.treeData.value)) treeRef.value?.getNode(k)?.expand()
}
function collapseAll() {
  for (const k of getAllKeys(state.treeData.value)) treeRef.value?.getNode(k)?.collapse()
}
function getAllKeys(nodes: ProjectBlueprintTreeNodeData[]): string[] {
  return nodes.flatMap(n => [n.nodeId, ...(n.children ? getAllKeys(n.children) : [])])
}

defineExpose({ treeRef })
</script>

<style scoped>
.dev-tree {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.dev-tree__toolbar {
  display: flex;
  gap: 6px;
  padding: 10px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  flex-shrink: 0;
  background: var(--el-fill-color-extra-light);
}

.dev-tree :deep(.el-tree) {
  flex: 1;
  overflow: auto;
  background: transparent;
  padding: 8px;
}

.dev-tree :deep(.el-tree-node__content) {
  border-radius: 8px;
  margin-bottom: 2px;
}

.dev-tree :deep(.el-tree-node__content:hover) {
  background: var(--el-fill-color-light);
}

.tree-node {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  font-size: 13px;
  overflow: hidden;
}
.node-icon {
  display: inline-flex;
  align-items: center;
  color: var(--el-color-primary);
}
.node-label { flex-shrink: 0; font-weight: 500; }
.node-path {
  color: var(--el-text-color-placeholder);
  font-size: 11px;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.node-tag { flex-shrink: 0; }
.node-actions {
  margin-left: auto;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity .15s;
}

:deep(.node-actions .el-button) {
  margin: 0;
  min-width: 20px;
}

:deep(.el-tree-node__content:hover) .node-actions { opacity: 1; }
</style>
