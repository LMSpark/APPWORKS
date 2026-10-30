<!--
@module app:views/app/dev-system/ProjectBlueprintTree
职责：通过当前项目蓝图 DataView 显示及操作项目导航树。
边界：RendererTree 直接绑定本次 PAGE_RUNTIME 中的正式树视图；异步事件与删除确认固定本次运行时、项目及行身份。
AI用途：检查开发系统主树的正式视图绑定、节点选择与相对拖放委派。
-->
<template>
  <div class="dev-tree">
    <div v-if="viewBindingReady" :key="treeComponentKey" class="dev-tree__toolbar">
      <RendererButton v-bind="treeBindingProps" label="新增模块" button-type="primary" :disabled="!canAddRoot" @click="treeActions.addRoot" />
      <RendererButton v-bind="treeBindingProps" label="导入项目策划文档" :disabled="state.blueprintLoading.value || !treeContext" @click="treeActions.openImport" />
    </div>

    <DisplayEmpty v-if="!viewBindingReady" description="项目蓝图 DataView 尚未就绪" />
    <RendererTree
      v-else
      :key="treeComponentKey"
      v-bind="containerBindingProps"
      node-key="rowid"
      :current-key="selectedNodeId"
      filterable
      filter-placeholder="搜索蓝图节点"
      :show-data-view-meta="false"
      :tree-props="treeActions.treeProps"
      :on-node-click="treeActions.onNodeClick"
      :on-node-drop="treeActions.onNodeDrop"
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
            <RendererButton v-if="state.childCreateActionState(String(data.rowid)) === 'enabled'" v-bind="fieldBindingProps" label="添加子节点" button-size="small" @click="treeActions.addChildFromRow" />
            <RendererButton v-if="canDeleteRow(data)" v-bind="fieldBindingProps" label="删除" button-size="small" button-type="danger" @click="treeActions.openDeleteFromRow" />
          </span>
            <RendererDialog v-if="deletingTarget?.nodeId===String(data.rowid)" :model-value="true" title="确认删除" width="420px" @update:model-value="treeActions.updateDeleteVisibility">
              <DisplayAlert description="确定删除所选节点？删除只允许正式权限认可的叶子节点。" alert-type="warning" />
              <template #footer>
              <RendererButton label="取消" @click="treeActions.cancelDelete" />
                <RendererButton label="确定删除" button-type="danger" @click="treeActions.confirmDelete" />
              </template>
            </RendererDialog>
        </span>
      </template>
    </RendererTree>
  </div>
</template>

<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import { type DataRow } from '@spark-appworks/spark-data'
import { DisplayAlert, DisplayEmpty, DisplayIcon, FieldText, RendererButton, RendererDialog, RendererTree } from '@spark-appworks/spark-component'
import type { DevState } from './useDevState'
import { formatNavigationPlacementLabel } from './childPlacementLabels'
import type { BlueprintWorkspaceDataView } from '@/services/project/blueprint-workspace-dataview'
import type { PageRuntime } from '@spark-appworks/spark-project-model'

const props = defineProps<{ state: DevState }>()
const state = props.state
type TreeContext = Readonly<{owner:BlueprintWorkspaceDataView;runtime:PageRuntime;projectId:string;nodeId:string;viewKey:string}>
type DeleteTarget = Readonly<{context:TreeContext;nodeId:string;parentNodeId:string;systemId:unknown}>
const deletingTarget = shallowRef<DeleteTarget>()
const owner = computed(() => state.blueprintWorkspaceDataView.value)
const treeContext = computed<TreeContext | undefined>(() => {
  const currentOwner=owner.value,runtime=state.blueprintPageRuntime.value
  if(!currentOwner||currentOwner.projectId!==state.projectId||!runtime?.isLoaded||runtime.destroyed
    ||typeof currentOwner.dataSet.scenarioId!=='string'||runtime.getDataSet(currentOwner.dataSet.scenarioId)!==currentOwner.dataSet)return undefined
  const viewKey=currentOwner.standardComponentBinding.dataViewKey
  if(!viewKey||runtime.resolveView(viewKey)!==currentOwner.view)return undefined
  return {owner:currentOwner,runtime,projectId:state.projectId,nodeId:state.selectedNode.value?.nodeId??'',viewKey}
})
const viewKey = computed(() => treeContext.value?.viewKey ?? '')
const treeBindingProps = computed(() => viewKey.value ? {dataViewKey: viewKey.value} : {})
const containerBindingProps = treeBindingProps
const fieldBindingProps = treeBindingProps
const viewBindingReady = computed(() => Boolean(treeContext.value))
const treeComponentKey = computed(() => {
  const context=treeContext.value
  return context?`${context.runtime.instanceId}:${context.projectId}:${context.viewKey}`:'blueprint-tree-unbound'
})
const selectedNodeId = computed(() => state.selectedNode.value?.nodeId ?? null)
const canAddRoot = computed(() => {
  if(!treeContext.value)return false
  const current = owner.value
  return !!current && !current.isBusy && !current.hasPendingBlueprintCommand && current.view.addActionState() === 'enabled'
})
const currentContext = (captured:TreeContext|undefined):boolean => {
  const current=treeContext.value
  return !!captured&&!!current&&captured.owner===current.owner&&captured.runtime===current.runtime
    &&captured.projectId===current.projectId&&captured.nodeId===current.nodeId&&captured.viewKey===current.viewKey
}
function matchesFilter(value: string, row: DataRow, context:TreeContext|undefined): boolean {
  const query = value.trim().toLocaleLowerCase()
  if (!query) return true
  return ['FunName', 'name', 'rowid', 'NavigationUrl'].some(field => {
    const formalRow = resolveFormalRow(row,context)
    if (!formalRow || context?.owner.view.fieldAccess(formalRow, field).read !== 'visible') return false
    return String(row[field] ?? '').toLocaleLowerCase().includes(query)
  })
}
function resolveFormalRow(row: DataRow,context=treeContext.value): DataRow | undefined {
  const view = context?.owner.view
  if (!view) return undefined
  const rowId = row['rowid']
  if (typeof rowId !== 'string' && typeof rowId !== 'number') return undefined
  const matches = view.rows.filter(candidate => Object.is(candidate['rowid'], rowId))
  return matches.length === 1 ? matches[0] : undefined
}
function isFieldReadable(row: DataRow, field: string): boolean {
  const context=treeContext.value,formalRow = resolveFormalRow(row,context)
  return !!formalRow && context?.owner.view.fieldAccess(formalRow, field).read === 'visible'
}
function canMoveRow(row: DataRow | undefined,context=treeContext.value): boolean {
  const view = context?.owner.view
  const formalRow = row ? resolveFormalRow(row,context) : undefined
  if (!view || !formalRow || String(formalRow['rowid']) === state.project.rootNode?.id) return false
  return view.editActionState(formalRow) === 'enabled'
    && view.fieldAccess(formalRow, 'prowid').write === 'allowed'
    && view.fieldAccess(formalRow, 'FunOrderValue').write === 'allowed'
}
function canDeleteRow(row: DataRow): boolean {
  const context=treeContext.value,view = context?.owner.view
  const formalRow = resolveFormalRow(row,context)
  return !!view && !!formalRow && view.deleteActionState(formalRow) === 'enabled'
}
function formatNodeKind(value: unknown): string {
  const kind = String(value ?? '')
  const labels: Record<string, string> = {Model: '模块', Navitem: '页面', embedded: '嵌入内容', service: '服务', content: '内容'}
  return labels[kind] ?? kind
}
function formatPlacement(value: unknown): string { return formatNavigationPlacementLabel(String(value ?? '')) }

function handleNodeClick(context:TreeContext|undefined,args:unknown[]): void {
  const control = args[3]
  if (control && typeof control === 'object' && 'cancel' in control) control.cancel = true
  if(!currentContext(context))return
  const nodeId = readNodeId(args[0])
  if (!nodeId) return
  void state.selectNodeById(nodeId).catch(error => state.addStatus(`选择蓝图节点失败：${String(error)}`, 'error'))
}
function readNodeId(value: unknown): string {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !('rowid' in value)) return ''
  const rowId = value.rowid
  return typeof rowId === 'string' || typeof rowId === 'number' ? String(rowId) : ''
}
function isDataRow(value:unknown):value is DataRow{return !!value&&typeof value==='object'&&!Array.isArray(value)&&'rowid' in value}
function handleNodeDrop(context:TreeContext|undefined,args:unknown[]): void {
  const control = args[1]
  if (control && typeof control === 'object' && 'cancel' in control) control.cancel = true
  if(!currentContext(context))return
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
function addChildFromRow(context:TreeContext|undefined,args:unknown[]): void {
  if(!context||!currentContext(context))return
  stopEvent(args[1])
  const parentNodeId = readNodeId(args[0])
  if (parentNodeId) void state.addChildNodeById(parentNodeId)
}
function openDeleteFromRow(context:TreeContext|undefined,args:unknown[]): void {
  if(!context||!currentContext(context))return
  stopEvent(args[1])
  const nodeId=readNodeId(args[0]),row=args[0]
  if(!nodeId||!isDataRow(row)||!('prowid' in row)||!canDeleteRow(row))return
  deletingTarget.value={context,nodeId,parentNodeId:String(row['prowid']??''),systemId:row['SysId']}
}
function closeDelete(value = false,expected?:DeleteTarget): void { if (!value&&(!expected||deletingTarget.value===expected)) deletingTarget.value = undefined }
function cancelDelete(expected:DeleteTarget|undefined,args:unknown[]):void{stopEvent(args[1]);closeDelete(false,expected)}
function confirmDelete(context:TreeContext|undefined,expected:DeleteTarget|undefined,args:unknown[]): void {
  stopEvent(args[1])
  const target=deletingTarget.value
  if(!target||target!==expected||!context||target.context.owner!==context.owner||target.context.runtime!==context.runtime
    ||target.context.projectId!==context.projectId||target.context.nodeId!==context.nodeId
    ||target.context.viewKey!==context.viewKey||!currentContext(context))return
  deletingTarget.value=undefined
  const rows=target.context.owner.view.rows.filter(row=>String(row['rowid'])===target.nodeId)
  const row=rows[0],id=row&&target.context.owner.view.getPkKey(row)
  const edited=row&&id!==null&&id!==undefined?target.context.owner.view.getEditingRow(id)??row:row
  if(rows.length!==1||String(edited?.['prowid']??'')!==target.parentNodeId||!Object.is(edited?.['SysId'],target.systemId)
    ||target.context.owner.projectId!==target.context.projectId)return
  state.removeNodeById(target.nodeId)
}

watch(treeContext,(next,previous)=>{
  if(previous&&(!next||!currentContext(deletingTarget.value?.context)))deletingTarget.value=undefined
})

const treeActions = computed(() => {
  const context=treeContext.value
  const deleteTarget=deletingTarget.value
  return {
    treeProps:{defaultExpandAll:true,highlightCurrent:true,expandOnClickNode:false,draggable:true,
      filterNodeMethod:(value:string,row:DataRow)=>matchesFilter(value,row,context),
      allowDrag:(node:{data?:DataRow})=>currentContext(context)&&canMoveRow(node.data,context),
      allowDrop:(dragged:{data?:DataRow},target:{data?:DataRow})=>currentContext(context)&&canMoveRow(dragged.data,context)&&canMoveRow(target.data,context)},
    onNodeClick:(...args:unknown[])=>handleNodeClick(context,args),
    onNodeDrop:(...args:unknown[])=>handleNodeDrop(context,args),
    addRoot:()=>{if(currentContext(context))state.addRootNode()},
    openImport:()=>{if(currentContext(context))state.openProjectPlanningDocumentImportDialog()},
    addChildFromRow:(...args:unknown[])=>addChildFromRow(context,args),
    openDeleteFromRow:(...args:unknown[])=>openDeleteFromRow(context,args),
    confirmDelete:(...args:unknown[])=>confirmDelete(context,deleteTarget,args),
    cancelDelete:(...args:unknown[])=>cancelDelete(deleteTarget,args),
    updateDeleteVisibility:(value:boolean)=>closeDelete(value,deleteTarget),
  }
})
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
