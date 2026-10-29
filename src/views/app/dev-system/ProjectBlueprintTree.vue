<!--
@module app:views/app/dev-system/ProjectBlueprintTree
职责：通过当前项目蓝图 DataView 显示及操作项目导航树。
边界：RendererTree 直接绑定本次 PAGE_RUNTIME 中的正式树视图；领域操作只接收稳定行身份。
AI用途：检查开发系统主树的正式视图绑定、节点选择与相对拖放委派。
-->
<template>
  <div class="dev-tree">
    <div class="dev-tree__toolbar">
      <RendererButton label="新增模块" button-type="primary" :disabled="!canAddRoot" @click="state.addRootNode" />
      <RendererButton label="导入项目策划文档" :disabled="state.blueprintLoading.value" @click="state.openProjectPlanningDocumentImportDialog" />
    </div>

    <DisplayEmpty v-if="!viewBindingReady" description="项目蓝图 DataView 尚未就绪" />
    <RendererTree
      v-else
      :key="viewKey || 'builtin-blueprint-file-view'"
      v-bind="containerBindingProps"
      node-key="rowid"
      :current-key="selectedNodeId"
      filterable
      filter-placeholder="搜索蓝图节点"
      :show-data-view-meta="false"
      :tree-props="treeProps"
      :on-node-click="handleNodeClick"
      :on-node-drop="handleNodeDrop"
      class="dev-tree__renderer"
    >
      <template #default="{ data }">
        <span class="tree-node">
          <DisplayIcon v-if="isFieldReadable(data, 'NavigationImageWxz')" :icon="String(data.NavigationImageWxz ?? '')" class="node-icon" />
          <FieldText v-bind="fieldBindingProps" data-member="currentRow" data-field="FunName" :display-fallback-fields="['name']" readonly />
          <FieldText v-if="isFieldReadable(data, 'conType')" v-bind="fieldBindingProps" data-member="currentRow" data-field="conType" :display-formatter="formatNodeKind" readonly class="node-tag" />
          <FieldText v-bind="fieldBindingProps" data-member="currentRow" data-field="NavigationUrl" readonly class="node-path" />
          <FieldText v-bind="fieldBindingProps" data-member="currentRow" data-field="ChildItemLocation" :display-formatter="formatPlacement" readonly class="node-tag" />
          <span class="node-actions">
            <RendererButton v-if="state.childCreateActionState(String(data.rowid)) === 'enabled'" v-bind="fieldBindingProps" label="添加子节点" button-size="small" @click="addChildFromRow" />
            <RendererButton v-if="canDeleteRow(data)" v-bind="fieldBindingProps" label="删除" button-size="small" button-type="danger" @click="openDeleteFromRow" />
          </span>
        </span>
      </template>
    </RendererTree>

    <RendererDialog v-if="deletingNodeId" :model-value="true" title="确认删除" width="420px" @update:model-value="closeDelete">
      <DisplayAlert description="确定删除所选节点？删除只允许正式权限认可的叶子节点。" alert-type="warning" />
      <template #footer>
        <RendererButton label="取消" @click="closeDelete(false)" />
        <RendererButton label="确定删除" button-type="danger" @click="confirmDelete" />
      </template>
    </RendererDialog>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { type DataRow } from '@spark-appworks/spark-data'
import { DisplayAlert, DisplayEmpty, DisplayIcon, FieldText, RendererButton, RendererDialog, RendererTree } from '@spark-appworks/spark-component'
import type { DevState } from './useDevState'
import { formatNavigationPlacementLabel } from './childPlacementLabels'

const props = defineProps<{ state: DevState }>()
const state = props.state
const deletingNodeId = ref('')
const owner = computed(() => state.blueprintWorkspaceDataView.value)
const componentBinding = computed(() => owner.value?.projectId === state.projectId ? owner.value.standardComponentBinding : undefined)
const viewKey = computed(() => componentBinding.value?.dataViewKey ?? '')
const directDataSource = computed(() => componentBinding.value?.dataSource)
const containerBindingProps = computed(() => viewKey.value ? {dataViewKey: viewKey.value}
  : directDataSource.value ? {dataSource: directDataSource.value} : {})
const fieldBindingProps = computed(() => viewKey.value ? {dataViewKey: viewKey.value} : {})
const viewBindingReady = computed(() => Boolean(viewKey.value || directDataSource.value))
const selectedNodeId = computed(() => state.selectedNode.value?.nodeId ?? null)
const canAddRoot = computed(() => {
  const current = owner.value
  return !!current && !current.isBusy && !current.hasPendingBlueprintCommand && current.view.addActionState() === 'enabled'
})
const treeProps = computed(() => ({
  defaultExpandAll: true,
  highlightCurrent: true,
  expandOnClickNode: false,
  draggable: true,
  filterNodeMethod: (value: string, row: DataRow) => matchesFilter(value, row),
  allowDrag: (node: { data?: DataRow }) => canMoveRow(node.data),
  allowDrop: (dragged: { data?: DataRow }, target: { data?: DataRow }) => canMoveRow(dragged.data) && canMoveRow(target.data),
}))
function matchesFilter(value: string, row: DataRow): boolean {
  const query = value.trim().toLocaleLowerCase()
  if (!query) return true
  return ['FunName', 'name', 'rowid', 'NavigationUrl'].some(field => {
    const formalRow = resolveFormalRow(row)
    if (!formalRow || owner.value?.view.fieldAccess(formalRow, field).read !== 'visible') return false
    return String(row[field] ?? '').toLocaleLowerCase().includes(query)
  })
}
function resolveFormalRow(row: DataRow): DataRow | undefined {
  const view = owner.value?.view
  if (!view) return undefined
  const rowId = row['rowid']
  if (typeof rowId !== 'string' && typeof rowId !== 'number') return undefined
  const matches = view.rows.filter(candidate => Object.is(candidate['rowid'], rowId))
  return matches.length === 1 ? matches[0] : undefined
}
function isFieldReadable(row: DataRow, field: string): boolean {
  const formalRow = resolveFormalRow(row)
  return !!formalRow && owner.value?.view.fieldAccess(formalRow, field).read === 'visible'
}
function canMoveRow(row: DataRow | undefined): boolean {
  const view = owner.value?.view
  const formalRow = row ? resolveFormalRow(row) : undefined
  if (!view || !formalRow || String(formalRow['rowid']) === state.project.rootNode?.id) return false
  return view.editActionState(formalRow) === 'enabled'
    && view.fieldAccess(formalRow, 'prowid').write === 'allowed'
    && view.fieldAccess(formalRow, 'FunOrderValue').write === 'allowed'
}
function canDeleteRow(row: DataRow): boolean {
  const view = owner.value?.view
  const formalRow = resolveFormalRow(row)
  return !!view && !!formalRow && view.deleteActionState(formalRow) === 'enabled'
}
function formatNodeKind(value: unknown): string {
  const kind = String(value ?? '')
  const labels: Record<string, string> = {Model: '模块', Navitem: '页面', embedded: '嵌入内容', service: '服务', content: '内容'}
  return labels[kind] ?? kind
}
function formatPlacement(value: unknown): string { return formatNavigationPlacementLabel(String(value ?? '')) }

function handleNodeClick(...args: unknown[]): void {
  const control = args[3]
  if (control && typeof control === 'object' && 'cancel' in control) control.cancel = true
  const nodeId = readNodeId(args[0])
  if (!nodeId) return
  void state.selectNodeById(nodeId).catch(error => state.addStatus(`选择蓝图节点失败：${String(error)}`, 'error'))
}
function readNodeId(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !('rowid' in value)) return ''
  const rowId = value.rowid
  return typeof rowId === 'string' || typeof rowId === 'number' ? String(rowId) : ''
}
function handleNodeDrop(...args: unknown[]): void {
  const control = args[1]
  if (control && typeof control === 'object' && 'cancel' in control) control.cancel = true
  const event = args[0]
  if (!event || typeof event !== 'object' || !('draggedKey' in event) || !('targetKey' in event) || !('dropType' in event)) return
  const position = event.dropType
  if (position !== 'before' && position !== 'after' && position !== 'inner') return
  void state.moveBlueprintNodeRelative({nodeId: String(event.draggedKey), targetNodeId: String(event.targetKey), position})
    .catch(error => state.addStatus(`节点移动失败：${String(error)}`, 'error'))
}
function stopEvent(event: unknown): void {
  if (event && typeof event === 'object' && 'stopPropagation' in event && typeof event.stopPropagation === 'function') event.stopPropagation()
}
function addChildFromRow(...args: unknown[]): void {
  stopEvent(args[1])
  const parentNodeId = readNodeId(args[0])
  if (parentNodeId) void state.addChildNodeById(parentNodeId)
}
function openDeleteFromRow(...args: unknown[]): void {
  stopEvent(args[1])
  deletingNodeId.value = readNodeId(args[0])
}
function closeDelete(value = false): void { if (!value) deletingNodeId.value = '' }
function confirmDelete(): void {
  const nodeId = deletingNodeId.value
  deletingNodeId.value = ''
  if (nodeId) state.removeNodeById(nodeId)
}
</script>

<style scoped>
.dev-tree { display:flex; flex-direction:column; height:100%; overflow:hidden; }
.dev-tree__toolbar { display:flex; align-items:center; gap:6px; padding:10px; border-bottom:1px solid var(--el-border-color-lighter); flex-shrink:0; background:var(--el-fill-color-extra-light); }
.dev-tree__renderer { flex:1; min-height:0; overflow:auto; padding:8px; }
.tree-node { display:inline-flex; align-items:center; gap:6px; flex:1; min-width:0; font-size:13px; overflow:hidden; }
.node-icon { flex-shrink:0; color:var(--el-color-primary); }
.node-path { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--el-text-color-placeholder); font-size:11px; }
.node-tag { flex-shrink:0; }
.node-actions { display:flex; gap:4px; margin-left:auto; flex-shrink:0; opacity:0; transition:opacity .15s; }
.tree-node:hover .node-actions { opacity:1; }
</style>
