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
        <RendererButton label="需求原型" :button-type="activeTab === 'prototype' ? 'primary' : 'default'" @click="selectTab('prototype')" />
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
    <DisplayAlert v-if="notice" :description="notice" alert-type="success" />
    <DisplayAlert v-if="loading" description="正在读取当前应用蓝图…" alert-type="info" />
    <DisplayAlert v-if="aiGenerating" description="AI 正在生成，完成后先预览，确认后才写入" alert-type="info" />

    <section v-if="treeContext" class="application-function-page__workspace">
      <aside class="application-function-page__tree">
        <div class="application-function-page__tree-toolbar">
          <RendererButton label="新增根模块" button-type="primary" :disabled="!canAddRoot" @click="addRootNode" />
          <RendererButton label="新增同级" :disabled="!canAddSibling" @click="addSiblingNode" />
          <RendererButton label="新增子级" :disabled="!canAddChild" @click="addChildNode" />
          <RendererButton label="AI 生成下一级" :disabled="aiGenerating || treeAiConfirming" @click="openTreeAi" />
          <RendererButton v-if="aiGenerating" label="取消生成" @click="cancelAi" />
        </div>
        <RendererTree
          :key="treeContext.key"
          v-bind="treeBinding"
          node-key="rowid"
          :current-key="selectedNodeId || null"
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
            <RendererButton label="AI 回填" :disabled="aiGenerating" @click="generateFormAi" />
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
        <template v-else-if="isSelectedNodeReady && activeTab === 'dataSpace'">
          <div class="application-function-page__details-toolbar">
            <h2>数据空间</h2>
            <RendererButton label="查询影响范围" :disabled="!canQueryImpact" :loading="impactLoading" @click="openImpact" />
            <RendererButton label="内容设计" :disabled="!canOpenDesign" @click="openDesign" />
            <RendererButton label="维度来源设计" :disabled="!canOpenDimensionSource" :title="dimensionSourceReason"
              @click="openDimensionSource" />
          </div>
          <DisplayAlert
            description="每个蓝图节点只绑定一个主数据空间；选择后若当前节点没有其他未保存修改会立即保存并回读核验，改绑前请先查询影响范围。"
            alert-type="info"
          />
          <DisplayAlert v-if="dimensionSourceReason" :description="dimensionSourceReason" alert-type="info" />
          <NodeBasicInfo :state="state" :sections="['data-space']" @scene-chosen="bindDataSpace" />
          <DisplayAlert v-if="bindingSaving" description="正在保存数据空间绑定…" alert-type="info" />
        </template>
        <template v-else-if="isSelectedNodeReady && activeTab === 'prototype'">
          <div class="application-function-page__details-toolbar">
            <h2>需求原型</h2>
            <RendererButton label="保存原型" button-type="primary" :disabled="!canSavePrototype || uploadBlocked" @click="savePrototype" />
            <RendererButton label="预览" @click="openPreview" />
            <RendererButton label="保存为历史版本" :disabled="versionBusy || uploadBlocked" @click="beginCreateVersion" />
          </div>
          <DisplayAlert v-if="uploadState.pending > 0" description="图片正在上传，完成前不能保存或切换节点" alert-type="info" />
          <DisplayAlert v-else-if="uploadState.error" :description="`图片上传失败：${uploadState.error}`" alert-type="error" />
          <RendererForm v-bind="treeBinding" context-data-member="currentRow" :auto-columns="false"
            :show-data-view-meta="false" :grid-columns="1" label-width="120px">
            <FieldHtmlEditor
              :key="selectedNodeId"
              v-bind="treeBinding"
              data-member="currentRow"
              data-field="htmlDesc"
              label="原型描述"
              :image-uploader="imageUploader"
              :on-image-upload-state="onImageUploadState"
              @update:model-value="state.notifyExternalDataViewChanged"
            />
          </RendererForm>
          <div class="application-function-page__versions">
            <h3>历史版本</h3>
            <RendererList
              v-if="versionViewKey"
              :data-view-key="versionViewKey"
              row-key="rowid"
              :show-data-view-meta="false"
              :show-pagination="false"
              empty-text="暂无历史版本"
              :on-item-click="selectVersion"
            >
              <template #default="{ row }">
                <span :class="['application-function-page__version', { 'is-selected': isSelectedVersion(row) }]">
                  {{ versionLabel(row) }}
                </span>
              </template>
            </RendererList>
            <div class="application-function-page__details-toolbar">
              <RendererButton label="设为当前版本" :disabled="!selectedVersion || versionBusy" @click="applySelectedVersion" />
              <RendererButton label="删除版本" button-type="danger" :disabled="!selectedVersion || versionBusy" @click="beginDeleteVersion" />
            </div>
          </div>
        </template>
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

    <RendererDialog v-if="treeAiOpen" :model-value="true" title="AI 生成下一级蓝图节点" width="560px" @update:model-value="cancelAi">
      <RendererForm v-if="inputViewKey" :data-view-key="inputViewKey" :context-row-id="inputRowId" :auto-columns="false"
        :show-data-view-meta="false" :grid-columns="1">
        <FieldTextarea
          data-member="currentRow"
          data-field="requirement"
          label="需求描述"
          :autosize="{minRows: 4, maxRows: 10}"
          @update:model-value="touchInput"
        />
      </RendererForm>
      <template #footer>
        <RendererButton label="取消" @click="cancelAi" />
        <RendererButton label="生成" button-type="primary" :disabled="aiGenerating || !treeAiRequirement.trim()" :loading="aiGenerating" @click="generateTreeAi" />
      </template>
    </RendererDialog>

    <RendererDialog v-if="treeAiPreview" :model-value="true" title="确认写入 AI 蓝图节点" width="760px" @update:model-value="cancelAi">
      <DisplayAlert :description="`将在“${treeAiPreview.parentLabel}”下新增 ${treeAiPreview.rows.length} 个节点；已写入 ${treeAiCreated} 个。取消不会写入剩余节点。`" alert-type="info" />
      <table class="application-function-page__preview-table">
        <thead><tr><th>导航标题</th><th>能力名称</th><th>节点类型</th><th>交付状态</th><th>能力简述</th></tr></thead>
        <tbody>
          <tr v-for="item in treeAiPreview.rows" :key="item.capabilityName">
            <td>{{ item.navigationTitle }}</td><td>{{ item.capabilityName }}</td><td>{{ item.kind }}</td><td>{{ item.deliveryStatus }}</td><td>{{ item.description }}</td>
          </tr>
        </tbody>
      </table>
      <template #footer>
        <RendererButton label="取消" :disabled="treeAiConfirming" @click="cancelAi" />
        <RendererButton label="确认写入" button-type="primary" :loading="treeAiConfirming" @click="confirmTreeAi" />
      </template>
    </RendererDialog>

    <RendererDialog v-if="formAiPreview" :model-value="true" title="确认 AI 回填" width="560px" @update:model-value="cancelAi">
      <dl class="application-function-page__preview-list">
        <template v-for="item in formAiPreviewItems" :key="item.field">
          <dt>{{ item.label }}</dt><dd>{{ item.value }}</dd>
        </template>
      </dl>
      <template #footer>
        <RendererButton label="取消" @click="cancelAi" />
        <RendererButton label="回填到表单" button-type="primary" @click="confirmFormAi" />
      </template>
    </RendererDialog>

    <RendererDialog v-if="previewHtml !== undefined" :model-value="true" title="需求原型预览" width="860px" @update:model-value="closePreview">
      <!-- previewHtml 已经 sanitizeRichTextHtml 白名单清洗 -->
      <!-- eslint-disable-next-line vue/no-v-html -->
      <div v-if="previewHtml" class="application-function-page__prototype-preview" v-html="previewHtml" />
      <DisplayEmpty v-else description="当前节点没有原型描述" />
    </RendererDialog>

    <RendererDialog v-if="versionDialogOpen" :model-value="true" title="保存为历史版本" width="480px" @update:model-value="cancelCreateVersion">
      <RendererForm v-if="inputViewKey" :data-view-key="inputViewKey" :context-row-id="inputRowId" :auto-columns="false"
        :show-data-view-meta="false" :grid-columns="1">
        <FieldTextarea
          data-member="currentRow"
          data-field="versionDescription"
          label="版本描述"
          :autosize="{minRows: 2, maxRows: 6}"
          @update:model-value="touchInput"
        />
      </RendererForm>
      <template #footer>
        <RendererButton label="取消" @click="cancelCreateVersion" />
        <RendererButton label="保存" button-type="primary" :loading="versionBusy" @click="confirmCreateVersion" />
      </template>
    </RendererDialog>

    <RendererDialog v-if="impactOpen" :model-value="true" title="数据空间影响范围" width="760px" @update:model-value="closeImpact">
      <DisplayAlert :description="impactTitle" alert-type="info" />
      <DisplayAlert v-if="impactError" :description="impactError" alert-type="error" />
      <DisplayAlert v-else-if="impactLoading" description="正在查询绑定该数据空间的蓝图节点…" alert-type="info" />
      <RendererTable v-if="impactViewKey && !impactError" :data-view-key="impactViewKey" :children="[...impactColumns]"
        :show-data-view-meta="false" :show-pagination="false" />
    </RendererDialog>

    <RendererDialog v-if="designOpen" :model-value="true" title="数据空间内容设计" width="92vw" @update:model-value="closeDesign">
      <DataPlanningPane :state="state" :field-access="state.blueprintNodeFieldAccess('conid')" />
    </RendererDialog>

    <ApplicationFunctionDimensionSourceDialog v-if="dimensionSourceOpen" :source="dimensionSource" />

    <RendererDialog v-if="deletingVersion" :model-value="true" title="删除确认" width="420px" @update:model-value="cancelDeleteVersion">
      <DisplayAlert :description="`确定要删除版本“${deletingVersion.versionName}”吗？`" alert-type="warning" />
      <template #footer>
        <RendererButton label="取消" @click="cancelDeleteVersion" />
        <RendererButton label="确定" button-type="danger" @click="confirmDeleteVersion" />
      </template>
    </RendererDialog>
  </main>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import * as SparkComponent from '@spark-appworks/spark-component'
import type { DataRow } from '@spark-appworks/spark-data'
import { useApplicationFunctionPage } from './use-application-function-page'
import NodeBasicInfo from '@/views/app/dev-system/components/NodeBasicInfo.vue'
import DataPlanningPane from '@/views/app/dev-system/blueprint-workspace/DataPlanningPane.vue'
import ApplicationFunctionDimensionSourceDialog from './application-function-dimension-source-dialog.vue'

const {DisplayAlert, DisplayEmpty, FieldHtmlEditor, FieldSelect, FieldText, FieldTextarea, RendererButton, RendererDialog, RendererForm, RendererList, RendererTable, RendererTree} = SparkComponent

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
  notice,
  inputViewKey,
  inputRowId,
  touchInput,
  ai,
  prototype,
  dataSpace,
  dimensionSource,
} = useApplicationFunctionPage()

const {
  bindingSaving, canQueryImpact, canOpenDesign, impactOpen, impactLoading, impactError, impactTitle, impactViewKey, impactColumns,
  designOpen, bindDataSpace, openImpact, closeImpact, openDesign, closeDesign,
} = dataSpace
const {canOpen: canOpenDimensionSource, disabledReason: dimensionSourceReason, open: dimensionSourceOpen, openEditor: openDimensionSource} = dimensionSource

const {
  treeAiOpen, treeAiRequirement, treeAiPreview, treeAiCreated, treeAiConfirming, formAiPreview, formAiPreviewItems, aiGenerating,
  openTreeAi, generateTreeAi, confirmTreeAi, generateFormAi, confirmFormAi, cancelAi,
} = ai
const {
  uploadState, uploadBlocked, canSavePrototype, previewHtml, versionViewKey, versionDialogOpen, selectedVersion,
  deletingVersion, versionBusy, onImageUploadState, imageUploader, savePrototype, openPreview, closePreview, selectVersion,
  isSelectedVersion, versionLabel, beginCreateVersion, cancelCreateVersion, confirmCreateVersion, applySelectedVersion, beginDeleteVersion, cancelDeleteVersion,
  confirmDeleteVersion,
} = prototype

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
