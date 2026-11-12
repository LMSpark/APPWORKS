<template>
  <main class="application-function-page">
    <header class="application-function-page__header">
      <div>
        <h1>项目蓝图</h1>
        <p>应用 {{ state.projectId }} · 节点 {{ selectedNodeId || '未选择' }}</p>
      </div>
      <div class="application-function-page__tabs">
        <RendererButton label="基本信息" :button-type="activeTab === 'basic' ? 'primary' : 'default'" @click="selectTab('basic')" />
        <RendererButton label="数据空间" :button-type="activeTab === 'dataSpace' ? 'primary' : 'default'" @click="selectTab('dataSpace')" />
        <RendererButton
          v-if="canSaveChanges || state.blueprintSaving.value"
          label="保存蓝图修改"
          button-type="primary"
          :disabled="state.blueprintSaving.value"
          :loading="state.blueprintSaving.value"
          @click="saveBlueprintChanges"
        />
        <RendererButton v-if="canCancelChanges" label="取消修改" @click="cancelBlueprintChanges" />
      </div>
    </header>

    <DisplayAlert v-if="error" :description="error" alert-type="error" />
    <DisplayAlert v-if="loading" description="正在读取当前应用蓝图…" alert-type="info" />

    <section v-if="treeContext" class="application-function-page__workspace">
      <aside class="application-function-page__tree">
        <div class="application-function-page__tree-toolbar">
          <RendererButton label="新增根模块" button-type="primary" :disabled="!canAddRoot" @click="addRootNode" />
          <RendererButton label="新增同级" :disabled="!canAddSibling" @click="addSiblingNode" />
          <RendererButton label="新增子级" :disabled="!canAddChild" @click="addChildNode" />
        </div>
        <RendererTree
          :key="treeContext.key"
          v-bind="treeBinding"
          node-key="rowid"
          :current-key="selectedNodeId"
          :tree-props="treeProps"
          :on-node-click="onNodeClick"
          :on-node-expand="onNodeExpand"
          :on-node-collapse="onNodeCollapse"
          :on-node-drop="onNodeDrop"
          class="application-function-page__tree-body"
        >
          <template #default="{ data }">
            <span class="application-function-page__tree-node">
              <FieldText v-bind="treeBinding" data-member="currentRow" data-field="FunName" :display-fallback-fields="['name']" :readonly="true" />
              <span class="application-function-page__tree-actions">
                <RendererButton
                  v-if="state.childCreateActionState(String(data.rowid)) === 'enabled'"
                  v-bind="treeBinding"
                  label="添加子节点"
                  button-size="small"
                  @click="addChildFromRow(data)"
                />
                <RendererButton
                  v-if="canDeleteRow(data)"
                  v-bind="treeBinding"
                  label="删除"
                  button-size="small"
                  button-type="danger"
                  @click="beginDelete(data)"
                />
              </span>
            </span>
          </template>
        </RendererTree>
      </aside>

      <section class="application-function-page__details">
        <template v-if="isSelectedNodeReady && activeTab === 'basic'">
          <div class="application-function-page__details-toolbar">
            <h2>基本信息</h2>
            <RendererButton label="保存名称" :disabled="!canSaveName" @click="saveNodeName" />
          </div>
          <DisplayAlert v-if="optionsError" :description="optionsError" alert-type="warning" />
          <RendererForm v-bind="treeBinding" context-data-member="currentRow" :auto-columns="false"
            :show-data-view-meta="false" :grid-columns="1" label-width="120px">
            <FieldText v-bind="treeBinding" data-member="currentRow" data-field="rowid" label="节点 ID" :readonly="true" />
            <FieldText v-bind="treeBinding" data-member="currentRow" data-field="FunName" label="导航名称"
              @update:model-value="state.notifyExternalDataViewChanged" />
            <FieldSelect v-if="optionsReady" v-bind="treeBinding" data-member="currentRow" data-field="status" label="阶段"
              :option-data-view-key="statusOptionViewKey" option-value-field="val" option-label-field="txt"
              :readonly="stageLocked" @update:model-value="onStageChange" />
            <FieldText v-else v-bind="treeBinding" data-member="currentRow" data-field="status" label="阶段" :readonly="true" />
            <FieldText v-bind="treeBinding" data-member="currentRow" data-field="name" label="能力名称"
              @update:model-value="state.notifyExternalDataViewChanged" />
            <FieldSelect v-bind="treeBinding" data-member="currentRow" data-field="conType" label="节点类型"
              :options="[...nodeTypeOptions]" @update:model-value="state.notifyExternalDataViewChanged" />
            <FieldSelect v-if="optionsReady && peopleAvailable" v-bind="treeBinding" data-member="currentRow" data-field="personCharge" label="负责人"
              :option-data-view-key="personOptionViewKey" option-value-field="rowid" option-label-field="UserName"
              @update:model-value="state.notifyExternalDataViewChanged" />
            <FieldText v-else v-bind="treeBinding" data-member="currentRow" data-field="personCharge" label="负责人" :readonly="true" />
            <FieldText v-bind="treeBinding" data-member="currentRow" data-field="funCode" label="功能编码"
              @update:model-value="state.notifyExternalDataViewChanged" />
            <FieldTextarea v-bind="treeBinding" data-member="currentRow" data-field="memo" label="功能描述"
              :autosize="{minRows: 4, maxRows: 12}" @update:model-value="state.notifyExternalDataViewChanged" />
          </RendererForm>
        </template>
        <DisplayAlert
          v-else-if="isSelectedNodeReady && activeTab === 'dataSpace'"
          description="数据空间编辑属于后续迁移批次；本批只保留 blueprintTab 定位，不提供未核实的编辑入口。"
          alert-type="info"
        />
        <DisplayEmpty v-else description="请选择蓝图节点" />
      </section>
    </section>

    <RendererDialog
      v-if="deletingTarget"
      :model-value="true"
      title="确认删除蓝图节点"
      width="420px"
      @update:model-value="cancelDelete"
    >
      <DisplayAlert description="只允许删除当前 DataView 权限认可且没有子节点的叶子。" alert-type="warning" />
      <template #footer>
        <RendererButton label="取消" @click="cancelDelete" />
        <RendererButton label="确认删除" button-type="danger" @click="confirmDelete" />
      </template>
    </RendererDialog>
  </main>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import * as SparkComponent from '@spark-appworks/spark-component'
import type { DataRow } from '@spark-appworks/spark-data'
import { useApplicationFunctionPage } from './use-application-function-page'

const {DisplayAlert, DisplayEmpty, FieldSelect, FieldText, FieldTextarea, RendererButton, RendererDialog, RendererForm, RendererTree} = SparkComponent

const {
  state,
  loading,
  error,
  activeTab,
  treeBinding,
  treeContext,
  selectedNodeId,
  isSelectedNodeReady,
  canAddRoot,
  canAddSibling,
  canAddChild,
  canSaveChanges,
  canSaveName,
  stageLocked,
  canCancelChanges,
  deletingTarget,
  expandedKeys,
  optionsReady,
  peopleAvailable,
  statusOptionViewKey,
  personOptionViewKey,
  optionsError,
  nodeTypeOptions,
  canMove,
  onNodeClick,
  onNodeExpand,
  onNodeCollapse,
  onNodeDrop,
  addRootNode,
  addSiblingNode,
  addChildNode,
  addChildFromRow,
  beginDelete,
  cancelDelete,
  confirmDelete,
  selectTab,
  saveBlueprintChanges,
  saveNodeName,
  onStageChange,
  cancelBlueprintChanges,
} = useApplicationFunctionPage()

const treeProps = computed(() => {
  const context = treeContext.value
  return {
    defaultExpandedKeys: expandedKeys.value,
    highlightCurrent: true,
    expandOnClickNode: false,
    draggable: true,
    allowDrag: (node: { data?: DataRow }) => !!context && canMove(node.data, context),
    allowDrop: (dragged: { data?: DataRow }, target: { data?: DataRow }) =>
      !!context && canMove(dragged.data, context) && canMove(target.data, context),
  }
})

function canDeleteRow(value: DataRow): boolean {
  const context = treeContext.value
  if (!context) return false
  const nodeId = String(value['rowid'] ?? '')
  const rows = context.owner.view.rows.filter(row => String(row['rowid']) === nodeId)
  return rows.length === 1 && rows[0] !== undefined
    && context.owner.view.deleteActionState(rows[0]) === 'enabled'
    && !context.owner.view.rows.some(row => String(row['prowid'] ?? '') === nodeId)
}
</script>

<style src="./application-function-page.css"></style>
