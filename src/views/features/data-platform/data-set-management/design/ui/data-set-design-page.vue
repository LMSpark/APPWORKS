<template>
  <main class="data-space-design-page" :aria-busy="loading || busy">
    <header v-if="!session">
      <div><h1>数据空间设计</h1><p>{{ title }}<span v-if="targetId"> · {{ targetId }}</span></p></div>
      <RendererButton :disabled="loading || hasPending || parameterOpen" @click="load" label="重新打开" />
    </header>
    <p v-if="loading" role="status">正在读取空间定义…</p>
    <p v-if="definitionLoading" role="status">正在读取画布关系…</p>
    <p v-if="workspaceLoading" role="status">正在读取工作区数据…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="removalMessage" role="status">{{ removalMessage }}</p>
    <p v-if="selectedId === 'parameters' && actionError" role="alert">{{ actionError }}</p>
    <p v-if="selectedId === 'parameters' && actionMessage" role="status">{{ actionMessage }}</p>
    <template v-if="session">
      <section v-if="workbenchKey" class="design-workbench" aria-label="空间工作台概览">
        <RendererDetail :data-view-key="workbenchKey" context-data-member="currentRow" :auto-columns="false" :show-data-view-meta="false" :grid-columns="1">
          <template #default="{row}"><div class="design-workbench__hero">
            <div class="design-workbench__title-block"><div class="design-workbench__title-top"><span class="design-workbench__eyebrow">数据空间设计</span></div>
              <h2>{{ row?.['title'] }}</h2><p>{{ row?.['subtitle'] }}</p>
            </div>
            <div class="design-workbench__summary">
              <article class="design-workbench__primary-stat"><span class="design-workbench__primary-label">主业务表</span>
                <strong class="design-workbench__primary-value">{{ row?.['mainModels'] }}</strong><span class="design-workbench__primary-note">{{ row?.['mainNote'] }}</span></article>
              <div class="design-workbench__secondary-stats">
                <article class="design-workbench__metric-chip"><span class="design-workbench__metric-label">数据模型</span><strong class="design-workbench__metric-value">{{ row?.['modelCount'] }}</strong></article>
                <article class="design-workbench__metric-chip"><span class="design-workbench__metric-label">关系连线</span><strong class="design-workbench__metric-value">{{ definitionLoading ? '读取中' : row?.['relationCount'] }}</strong></article>
              </div>
            </div>
          </div></template>
        </RendererDetail>
        <p v-if="workbenchError" role="alert">{{ workbenchError }}</p>
      </section>
      <p v-for="message in definitionMessages" :key="message" role="status">{{ message }}</p>
      <p v-for="message in treeMessages" :key="message" role="alert" data-tree-warning>{{ message }}</p>
      <RendererButton v-if="treeMessages.length" data-action="show-unplaced" @click="selectNode('unplaced')" label="查看未归类定义" />
      <div class="design-layout" :class="{'design-layout--directory': showDirectory}">
        <nav v-show="showDirectory" id="data-space-directory" aria-label="数据空间层次">
          <RendererTree v-if="navigationViewKey" :data-view-key="navigationViewKey" node-key="id" :current-key="findNode(selectedId)?.id ?? null"
            :tree-props="treeOptions" :on-node-click="selectTreeNode" :show-data-view-meta="false">
            <template #default="{ data }">
              <RendererButton :data-design-node="data.id" :title="data.label" :label="data.label" :disabled="definitionLoading" text @click.stop="selectNode(data.id)" />
            </template>
          </RendererTree>
        </nav>
        <section v-if="graphBinding" class="design-canvas" aria-label="关系画布">
          <RendererDetail v-if="workbenchKey" :data-view-key="workbenchKey" :auto-columns="false" :show-data-view-meta="false" :grid-columns="1">
            <template #default="{row}"><div class="design-canvas-panel__header">
              <div class="design-canvas-panel__intro"><h3>关系画布</h3><p>拖拽模型编排关系，双击节点或连线进入详细配置。</p></div>
              <div class="design-canvas-panel__meta">
                <div class="design-canvas-panel__type-list"><template v-for="index in [0,1,2,3]" :key="index">
                  <article v-if="row?.[`type${index}`]" class="design-canvas-panel__type-chip"><span class="design-canvas-panel__type-chip-label">{{ row[`type${index}`] }}</span><strong>{{ row[`typeCount${index}`] }}</strong></article>
                </template></div>
                <div class="design-canvas-panel__legend" aria-label="模型节点图例">
                  <article v-for="item in graphLegendItems" :key="item.key" class="design-canvas-panel__legend-card" :class="`design-canvas-panel__legend-card--${item.key}`">
                    <span class="design-canvas-panel__legend-card-accent" /><div class="design-canvas-panel__legend-card-content">
                      <div class="design-canvas-panel__legend-card-head"><span class="design-canvas-panel__legend-card-type">节点风格</span><span class="design-canvas-panel__legend-card-badge">{{ item.badge }}</span></div>
                      <strong class="design-canvas-panel__legend-card-title">{{ item.label }}</strong><span class="design-canvas-panel__legend-card-note">{{ item.note }}</span>
                    </div>
                  </article>
                </div>
              </div>
            </div></template>
          </RendererDetail>
          <p v-if="apiMessage" role="status">{{ apiMessage }}</p>
          <details v-if="layoutState?.messages.length"><summary>{{ layoutState.messages.length }} 项模型布局提示</summary>
            <p v-for="message in layoutState.messages" :key="message" role="status">{{ message }}</p>
          </details>
          <p v-if="layoutState?.error" role="alert">{{ layoutState.error }}</p>
          <p v-if="layoutError" role="alert">{{ layoutError }}</p>
          <p v-if="layoutMessage" role="status">{{ layoutMessage }}</p>
          <p v-if="layoutState?.status === 'unknown'" role="alert">布局提交结果未知，请核验；不会自动重复提交。</p>
          <RendererSection v-if="layoutState?.rebuildAvailable || rebuildPreview" :data-view-key="graphBinding.nodes" title="布局重建" :grid-columns="1">
            <p v-if="!rebuildPreview">尚未保存布局。可根据正式模型和关系预览重建内容。</p>
            <RendererButton v-if="!rebuildPreview" data-action="prepare-layout-rebuild" label="预览重建内容"
              :disabled="busy || hasPending || parameterOpen || detailOpen" @click="rebuildLayout('prepare')" />
            <template v-if="rebuildPreview && rebuildEdgeViewKey">
              <p>{{ title }} · {{ targetId }}；模型 {{ rebuildPreview.modelCount }} 个，关系 {{ rebuildPreview.relationCount }} 条。</p>
              <p>仅重建布局，无法恢复原有自定义坐标和标签。模型、字段、关系、视图、级联及数据权限配置保持原样。</p>
              <RendererGraph data-layout-rebuild :data-view-key="graphBinding.nodes" :edge-data-view-key="rebuildEdgeViewKey"
                label-field="Name" description-field="description" node-caption-field="Type" :node-caption-options="DataSpaceWorkbench.sourcePresentation"
                :node-badge-rules="modelBadgeRules" node-default-badge="普通模型" edge-source-field="source" edge-target-field="target"
                :node-positions="rebuildPreview.positions" style="height:420px" disabled />
              <RendererButton data-action="confirm-layout-rebuild" label="确认重建布局" :disabled="busy" @click="rebuildLayout('confirm')" />
              <RendererButton data-action="cancel-layout-rebuild" label="取消预览" :disabled="busy" @click="rebuildLayout('cancel')" />
            </template>
          </RendererSection>
          <details v-if="layoutPreview" open><summary>远端共享配置原文</summary>
            <pre>{{ layoutPreview.text === null ? '远端文件不存在' : layoutPreview.text }}</pre>
            <p>采用后放弃本地布局，刷新为刚预览的远端配置；已提交的服务器写入保持有效。</p>
            <RendererButton data-action="adopt-layout" label="放弃本地布局并采用远端" :disabled="busy" @click="layoutAction('adopt')" />
          </details>
          <RendererGraph ref="graph" :toolbar="graphToolbar" :viewport-controls="false" :on-arrange="arrangeLayout" :data-view-key="graphBinding.nodes" :additional-node-sources="graphBinding.sources" v-bind="unboundEdgeViewKey ? {additionalEdgeDataViewKey: unboundEdgeViewKey} : {}" :edge-data-view-key="graphBinding.edges"
            label-field="Name" description-field="description" node-caption-field="Type" :node-caption-options="DataSpaceWorkbench.sourcePresentation"
            :node-badge-rules="modelBadgeRules" node-default-badge="普通模型" edge-source-field="parentTable" edge-target-field="childTable"
            :edge-node-keys="graphBinding.endpoints" :node-positions="graphBinding.positions" :current="graphCurrent"
            :connectable-keys="graphConnectKeys" :on-connect="connectGraph"
            :disabled="busy" :on-select="selectGraph" :draggable-keys="parameterOpen || definitionPending ? [] : layoutState?.draggableKeys ?? []" :on-node-move="moveLayout" />
        </section>
      </div>
            <RendererDialog v-if="selectedId === 'parameters' && parameterViewKey" v-model="parameterVisible" :data-view-key="parameterViewKey" data-member="currentRow"
              title="输入参数设置" width="860px" :grid-columns="1" append-to-body :close-on-click-modal="false"
              :close-on-press-escape="canCloseParameters" :show-close="canCloseParameters">
              <p v-if="parameterState.error" role="alert">{{ parameterState.error }}</p>
              <DataSpaceParametersEditor v-else-if="parameterOpen" :data-view-key="parameterViewKey"
                :disabled="!parameterState.writable || busy || parameterState.status !== 'idle'"
                :on-editing-change="value => parameterRowEditing = value" />
              <p v-if="actionError" role="alert">{{ actionError }}</p>
              <p v-if="parameterState.status === 'unknown'" role="alert">提交结果未知，请核验后再编辑；不会自动重复提交。</p>
              <p v-else-if="parameterState.status === 'readback'" role="alert">回读尚未确认，请重新核验。</p>
              <p v-else-if="parameterState.status === 'unsubmitted'" role="alert">修改尚未提交，请先处理本地修改。</p>
              <details class="references"><summary>参数引用检查</summary>
                <p v-if="inspection.error" role="alert">{{ inspection.error }}</p>
                <template v-if="inspection.result">
                  <p>{{ inspection.result.complete ? '当前可检查的配置已完整读取' : '检查不完整' }}；声明存在不代表调用时已提供值。</p>
                  <ul><li v-for="issue in inspection.result.issues" :key="issue">{{ issue }}</li></ul>
                  <ul><li v-for="reference in inspection.result.references" :key="`${reference.kind}:${reference.recordId}:${reference.path}`">
                    {{ reference.parameterName }} · {{ reference.modelId }} · {{ reference.path }} · {{ reference.declared ? '已声明' : '未声明' }}
                  </li></ul>
                </template>
              </details>
              <template #footer>
                <div class="parameter-dialog-footer">
                <RendererButton data-action="close-parameters" :disabled="!canCloseParameters" @click="closeParameters" label="取消" />
                <RendererButton button-type="primary" data-action="save-parameters" :disabled="busy || layoutPending || parameterRowEditing || !parameterState.writable || parameterState.status !== 'idle'"
                  @click="saveParameters" label="确定" />
                <RendererButton v-if="parameterState.status !== 'idle'" data-action="verify-parameters" :disabled="busy"
                  @click="verifyParameters" :label="parameterState.pending ? '放弃本地修改并核验' : '重新核验'" />
                </div>
              </template>
            </RendererDialog>
      <RendererDialog v-if="detailOpen" v-model="definitionVisible" :data-view-key="parameterViewKey" data-member="currentRow"
        :title="selected?.table === 'DataResourceRelationDefinition' ? '节点关系设置' : selected?.label || '空间定义'" width="min(1280px, calc(100vw - 32px))" :grid-columns="1"
        :close-disabled="!canCloseDefinition" :close-on-click-modal="false">
        <section class="design-detail" aria-label="当前定义">
          <p v-if="error" role="alert">{{ error }}</p>
          <template v-if="!graphRemovalOnly">
          <h2 v-show="!viewContext && selected?.table !== 'DataResourceRelationDefinition'">{{ selected?.label || '空间定义' }}</h2>
          <template v-if="unboundEdgeSelectedId">
            <p>先配置连线两端模型及其数据视图，再设置模型关系。当前连线仅保存设计意图。</p>
            <RendererButton data-action="configure-edge-source" label="配置父模型" @click="selectEdgeModel('source')" />
            <RendererButton data-action="configure-edge-target" label="配置子模型" @click="selectEdgeModel('target')" />
            <RendererButton data-action="configure-pending-edge" label="配置模型关系" @click="openPendingEdge(unboundEdgeSelectedId)" />
          </template>
          <template v-else-if="unboundSelectedId && unboundViewKey">
            <RendererTabs :data-view-key="unboundViewKey" data-member="currentRow" model-value="source">
              <RendererTabPane :index="0" name="source" label="1 模型">
                <p>选择模型来源后自动替换</p>
                <DataSpaceModelSource workspace-actions confirm-on-selection :session="session" :revision="revision" :disabled="busy || layoutState?.staged || arrayEditorPending"
                  @changed="changed" @pending="modelCreatePending = $event" @created="selectCreatedModel" />
                <DataSpaceArrayCreate :session="session" :revision="revision" :disabled="busy || layoutState?.staged || modelCreatePending"
                  @changed="changed" @pending="arrayEditorPending = $event" @created="selectCreatedModel" />
              </RendererTabPane>
              <RendererTabPane :index="1" name="process" label="2 数据处理" disabled />
              <RendererTabPane :index="2" name="views" label="数据视图" disabled />
            </RendererTabs>
          </template>
          <template v-else-if="selectedId === 'models'">
            <RendererButton v-if="modelViewKey" :data-view-key="modelViewKey" data-action="add-directory-model" label="新增模型"
              :disabled="definitionPending || parameterOpen || !layoutState?.editable" @click="addModelNode" />
          </template>
          <template v-else>
            <p v-if="selected?.description">{{ selected.description }}</p>
            <p v-if="selected?.unplacedReason" role="alert" data-unplaced-reason>{{ selected.unplacedReason }} 保留原记录；确认身份、数据权限和归属前仅查看，不自动重挂或删除。</p>
            <template v-if="!selected?.unplacedReason">
            <template v-if="viewContext && modelViewKey">
              <RendererDialog v-model="modelPreviewOpen" :data-view-key="modelViewKey" title="数据预览"
                width="92%" top="4vh" :grid-columns="1" append-to-body destroy-on-close :close-on-click-modal="false">
                <DataSpaceQueryPreview v-if="modelPreviewOpen" :key="`${targetId}:${viewContext.modelId}`" :session="session"
                  :model-id="viewContext.modelId" :model-name="viewContext.modelName" @close="modelPreviewOpen = false" />
              </RendererDialog>
            </template>
            <RendererTabs v-if="viewContext" :key="viewContext.modelId" v-model="activeModelSection" class="node-panel-tabs"
              :data-view-key="modelViewKey" data-member="currentRow" :toolbar="modelToolbar" toolbar-placement="header">
              <RendererTabPane :index="0" name="source" label="1 模型" lazy :disabled="processEditor?.interactionLocked === true">
                <DataSpaceModelFields ref="metaFieldsEditor" workspace-actions :key="viewContext.modelId" :session="session" :model-id="viewContext.modelId" :field-ids="modelFieldIds ?? []"
                  :revision="revision" :disabled="busy || arrayEditorPending || workspaceBusy || computedConfigPending || layoutPending || viewEditorPending || modelRenamePending || dataProcessPending || modelSourcePending || modelRemovalPending || fieldCreatePending || !!activeFieldRemovalId"
                  @changed="changed" @pending="fieldEditorPending = $event" @remove="beginFieldRemoval($event, 'modelFields')">
                  <template #model-name>
                    <DataSpaceModelRename :key="viewContext.modelId" workspace-actions :session="session" :model-id="viewContext.modelId" :revision="revision"
                      :disabled="busy || arrayEditorPending || computedConfigPending || layoutPending || viewEditorPending || fieldEditorPending || fieldCreatePending || modelRemovalPending || modelEditorPending || modelSourcePending || dataProcessPending"
                      @changed="changed" @pending="modelRenamePending = $event" />
                    <div v-if="modelViewKey && sourceLabelParts.name" class="meta-source">
                      <span>绑定源: </span>
                      <DisplayText v-if="sourceLabelParts.database" :data-view-key="modelViewKey" data-member="currentRow" data-field="DbName" placeholder="" suffix="." />
                      <DisplayText :data-view-key="modelViewKey" data-member="currentRow" data-field="MetaName" placeholder="" />
                      <DisplayText v-if="sourceLabelParts.type" :data-view-key="modelViewKey" data-member="currentRow" data-field="Type" placeholder="" prefix=" (" suffix=")" />
                    </div>
                  </template>
                  <template #model-actions>
                    <DataSpaceModelSource workspace-actions :session="session" :model-id="viewContext.modelId" :revision="revision"
                      :disabled="busy || layoutPending || viewEditorPending || fieldEditorPending || fieldCreatePending || modelRemovalPending || modelConfigPending && !modelSourcePending"
                      @changed="changed" @pending="modelSourcePending = $event" />
                    <DataSpaceArrayCreate :session="session" :revision="revision" :disabled="busy || layoutPending || hasPending && !arrayEditorPending"
                      @changed="changed" @pending="arrayEditorPending = $event" @created="selectCreatedModel" />
                    <DataSpaceArrayEditor :key="`array:${viewContext.modelId}`" :session="session" :model-id="viewContext.modelId" :revision="revision"
                      :disabled="busy || layoutPending || hasPending && !arrayEditorPending" @changed="changed" @pending="arrayEditorPending = $event" />
                  </template>
                  <template #field-create>
                    <DataSpaceFieldCreate :key="viewContext.modelId" workspace-actions :session="session" :model-id="viewContext.modelId" :revision="revision"
                      :disabled="busy || computedConfigPending || layoutPending || viewEditorPending || modelRenamePending || arrayEditorPending || dataProcessPending
                        || modelSourcePending || modelRemovalPending || workspaceBusy || metaFieldsEditor?.interactionLocked === true || modelEditor?.dialogOpen === true"
                      @changed="changed" @pending="fieldCreatePending = $event" />
                  </template>
                </DataSpaceModelFields>
                <RendererSection :data-view-key="modelViewKey" title="本地计算字段" collapsible default-collapsed lazy data-local-computed :grid-columns="1">
                  <DataSpaceTableConfiguration ref="computedEditor" :key="`computed:${viewContext.modelId}`" section="columns" workspace-actions
                    :session="session" :model-id="viewContext.modelId" :field-ids="[]" :revision="revision"
                    :disabled="busy || arrayEditorPending || layoutPending || viewEditorPending || fieldCreatePending || fieldEditorPending || modelEditorPending || modelSourcePending || modelRemovalPending || modelRenamePending || dataProcessPending"
                    @changed="changed" @pending="computedConfigPending = $event" />
                </RendererSection>
                <DataSpaceModelEditor ref="modelEditor" workspace-actions :session="session" :model-id="viewContext.modelId" :revision="revision"
                  :disabled="busy || arrayEditorPending || workspaceBusy || computedConfigPending || layoutPending || viewEditorPending || fieldCreatePending || modelSourcePending || modelRemovalPending || modelRenamePending || dataProcessPending"
                  @changed="changed" @pending="modelEditorPending = $event" />
              </RendererTabPane>
              <RendererTabPane :index="1" name="dataProcess" label="2 数据处理" lazy>
                <DataSpaceTableConfiguration ref="processEditor" workspace-actions :key="viewContext.modelId" :session="session" :model-id="viewContext.modelId" :field-ids="modelFieldIds ?? []"
                  :revision="revision" :disabled="busy || computedConfigPending || layoutPending || (viewEditorPending && !dataProcessPending) || modelEditorPending || modelRenamePending || modelSourcePending || modelRemovalPending || fieldEditorPending || fieldCreatePending"
                  @changed="changed" @pending="dataProcessPending = $event" />
              </RendererTabPane>
              <RendererTabPane :index="2" name="views" label="数据视图" :disabled="processEditor?.interactionLocked === true">
                <DataSpaceViewEditor :session="session" :model-id="viewContext.modelId" :model-name="viewContext.modelName"
                  :row-key="viewContext.rowKey" :revision="revision" :disabled="busy || layoutPending || modelConfigPending || fieldEditorPending || fieldCreatePending || modelSourcePending || modelRemovalPending"
                  @changed="changed" @pending="viewEditorPending = $event" @select="selectView" />
              </RendererTabPane>
            </RendererTabs>
            <template v-else-if="fileContext && fileBindingKey">
            <RendererTabs :key="fileContext.tableName" v-model="activeFileSection" :data-view-key="fileBindingKey" data-member="currentRow">
              <RendererTabPane :index="0" name="source" label="1 模型" :disabled="viewEditorPending || fileFieldEditing" lazy>
                <p>文件模型 {{ fileContext.tableName }} · {{ fileContext.resourceId }}。字段来自此资源的原生 columns 配置。</p>
                <RendererForm :data-view-key="fileBindingKey" context-data-member="currentRow" :auto-columns="false" :show-data-view-meta="false" :grid-columns="1">
                  <FieldJson :data-view-key="fileBindingKey" data-member="currentRow" field="configuration" label="模型与字段配置"
                    value-format="native" mode="tree" :readonly="busy || fileDefinitionStatus !== 'idle'" :height="400" />
                </RendererForm>

              </RendererTabPane>
              <RendererTabPane :index="1" name="fields" label="字段" :disabled="viewEditorPending" lazy>
                <RendererForm :data-view-key="fileBindingKey" context-data-member="currentRow" :auto-columns="false" :show-data-view-meta="false" :grid-columns="1">
                  <FieldJson :data-view-key="fileBindingKey" data-member="currentRow" field="configuration" label="字段配置"
                    value-format="native" :value-path="['columns']" mode="rows" :children="fileFieldChildren" reorderable
                    :on-editing-change="value => fileFieldEditing = value" :readonly="busy || fileDefinitionStatus !== 'idle'" :height="400" />
                </RendererForm>
              </RendererTabPane>
              <RendererTabPane :index="2" name="views" label="数据视图" :disabled="fileBindingDirty || fileFieldEditing">
                <DataSpaceViewEditor ref="fileViewEditor" :session="session" :file-resource="fileContext" :row-key="fileContext.rowKey" :revision="revision"
                  :disabled="busy || layoutPending" @changed="changed" @pending="viewEditorPending = $event" @select="selectView" />
              </RendererTabPane>
            </RendererTabs>
            <template v-if="activeFileSection !== 'views'">
                <RendererButton data-action="save-file-model" :disabled="busy || fileFieldEditing || !fileBindingDirty || fileDefinitionStatus === 'pending'" :label="fileDefinitionStatus === 'unknown' ? '核验文件提交' : '保存模型配置'" @click="saveFileModel" />
                <RendererButton data-action="discard-file-model" :disabled="busy || fileFieldEditing || !fileBindingDirty || fileDefinitionStatus !== 'idle'" label="取消未提交修改" @click="discardFileModel" />
            </template>
            </template>
            <DataSpaceSourceInputEditor v-else-if="sourceFieldId" :key="sourceFieldId" :session="session" :field-id="sourceFieldId"
              :revision="revision" :disabled="busy || layoutPending" @changed="changed" @pending="sourceEditorPending = $event" />
            <template v-else-if="fieldModelId">
              <DataSpaceFieldCreate :key="fieldModelId" :session="session" :model-id="fieldModelId" :revision="revision" :disabled="busy || layoutPending || fieldEditorPending"
                @changed="changed" @pending="fieldCreatePending = $event" />
              <DataSpaceModelFields v-if="!fieldCreatePending && !activeFieldRemovalId" :key="selectedId" :session="session" :model-id="fieldModelId" :field-ids="modelFieldIds ?? []"
                :revision="revision" :disabled="busy || layoutPending" @changed="changed" @pending="fieldEditorPending = $event" @remove="beginFieldRemoval($event, 'modelFields')" />
            </template>
            <DataSpaceFieldEditor v-else-if="fieldEditorId" :key="dataFieldId || selectedId" :session="session" :field-id="fieldEditorId"
              :revision="revision" :disabled="busy || layoutPending" @changed="changed" @pending="fieldEditorPending = $event" @remove="beginFieldRemoval" />
            <DataSpaceRelationEditor v-else-if="selectedId === 'relations' || selectedId === 'native-relations' || selected?.table === 'DataResourceRelationDefinition'" ref="relationEditor"
              :session="session" :row-key="selected?.table === 'DataResourceRelationDefinition' ? selected.rowKey : undefined"
              :revision="revision" :disabled="busy || layoutPending" @changed="changed" @pending="relationEditorPending = $event" @select="selectRelation" />
            <DataSpaceCascadeEditor v-else-if="selectedId === 'cascades' || selected?.table === 'DataViewCascadeDefinition'"
              :session="session" :row-key="selected?.table === 'DataViewCascadeDefinition' ? selected.rowKey : undefined"
              :revision="revision" :disabled="busy || layoutPending" @changed="changed" @pending="cascadeEditorPending = $event" @select="selectCascade" />
            <p v-else-if="!detail.length">在左侧选择具体定义查看，或选择模型、数据视图、原生关系、数据级联和输入参数进行维护。</p>
            </template>
          </template>
            <details v-if="detail.length && selected?.table !== 'DataResourceRelationDefinition' && (!viewContext || viewContext.rowKey !== undefined)" :open="!viewContext && !sourceFieldId && !dataFieldId && selected?.table !== 'DataViewCascadeDefinition'">
              <summary>定义详情</summary>
              <dl data-definition-detail>
                <template v-for="field in detail" :key="field.name"><dt>{{ field.name }}</dt><dd>{{ field.value }}</dd></template>
              </dl>
            </details>
          </template>
          <DataSpaceModelRemoval v-if="removalModelId" ref="modelRemovalEditor" :key="`remove:${removalModelId}`" :session="session" :model-id="removalModelId" :revision="revision"
            :disabled="busy || layoutPending || viewEditorPending || fieldEditorPending || fieldCreatePending || modelConfigPending || modelSourcePending || !!activeFieldRemovalId" @changed="changed" @begin="beginModelRemoval" @ended="endModelRemoval" />
          <DataSpaceFieldRemoval v-if="activeFieldRemovalId" :key="`remove-field:${activeFieldRemovalId}`" :session="session" :field-id="activeFieldRemovalId"
            :field-view-id="activeFieldRemovalViewId" :revision="revision" @changed="changed" @ended="endFieldRemoval" />
        </section>
        <template #footer>
          <RendererButton data-action="close-definition" label="关闭配置"
            :disabled="!canCloseDefinition" @click="closeDefinition" />
        </template>
      </RendererDialog>
    </template>
  </main>
</template>

<script setup lang="ts">
import {computed, nextTick, onBeforeUnmount, ref, shallowRef, watch} from 'vue'
import DataSpaceArrayEditor from './node-panel/DataSpaceArrayEditor.vue'
import {useRoute} from 'vue-router'
import {useSystemPageDirtySource} from '@spark-appworks/spark-app'
import {DataSpaceDesignApi} from '@spark-appworks/spark-lowcode-api'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {PAGE_RUNTIME, DisplayText, FieldJson, RendererForm, RendererButton, RendererTree, RendererGraph, RendererSection, RendererTabs, RendererTabPane, RendererDialog, RendererDetail, useSparkComponent, type RGraphProps} from '@spark-appworks/spark-component'
import {isRecord} from '@spark-appworks/spark-utils'
import {buildDataViewKey, RequestState, type DataRow, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import {openLowcodeDataSpaceDesignSession} from '@/lowcode/data-space/lowcode-data-space-design'
import type {LowcodeDataSpaceDesignSession} from '@/lowcode/data-space/view-design/lowcode-data-space-view-design'
import DataSpaceParametersEditor from '../parameters/DataSpaceParametersEditor.vue'
import DataSpaceViewEditor from '../views/DataSpaceViewEditor.vue'
import DataSpaceQueryPreview from '../views/preview/DataSpaceQueryPreview.vue'
import DataSpaceSourceInputEditor from '../source-input/DataSpaceSourceInputEditor.vue'
import DataSpaceFieldEditor from './node-panel/fields/DataSpaceFieldEditor.vue'
import DataSpaceModelFields from './node-panel/fields/DataSpaceModelFields.vue'
import DataSpaceTableConfiguration from './node-panel/configuration/DataSpaceTableConfiguration.vue'
import {DataSpaceWorkbench} from '../workbench/data-space-workbench'
import DataSpaceModelRename from '../model/rename/DataSpaceModelRename.vue'
import DataSpaceFieldCreate from './node-panel/fields/create/DataSpaceFieldCreate.vue'
import DataSpaceFieldRemoval from './node-panel/fields/removal/DataSpaceFieldRemoval.vue'
import DataSpaceModelEditor from './node-panel/data-set-design-node-panel.vue'
import DataSpaceModelSource from '../model/source/DataSpaceModelSource.vue'
import DataSpaceArrayCreate from './node-panel/DataSpaceArrayCreate.vue'
import DataSpaceModelRemoval from '../model/removal/DataSpaceModelRemoval.vue'
import DataSpaceRelationEditor from './edge-panel/data-set-design-edge-panel.vue'
import DataSpaceCascadeEditor from './cascades/DataSpaceCascadeEditor.vue'
import {DataSpaceLayoutEdit} from '../graph/data-space-layout-edit'

type DesignNode = {id: string; label: string; table?: string; viewId?: string; rowKey?: string | number; workspace?: 'views' | 'fields'; description?: string; children?: DesignNode[]; recordIndex?: number; unplacedReason?: string; removalModelId?: string}
const route = useRoute()
const {sparkProvide, sparkRemove} = useSparkComponent({type: 'data-space-design'})
let pageRuntime: PageRuntime | undefined
const session = shallowRef<LowcodeDataSpaceDesignSession | null>(null)
const loading = ref(false)
const definitionLoading = ref(false)
const workspaceLoading = ref(false)
const busy = ref(false)
const error = ref('')
const actionError = ref('')
const actionMessage = ref('')
const apiMessage = ref('')
const selectedId = ref('space')
const graphRemovalOnly = ref(false)
const modelRemovalEditor = ref<InstanceType<typeof DataSpaceModelRemoval>>()
const relationEditor = ref<InstanceType<typeof DataSpaceRelationEditor>>()
const treeOptions = computed<Record<string, unknown>>(() => ({
  defaultExpandedKeys: ['space', 'models', selectedId.value], highlightCurrent: true, expandOnClickNode: false,
}))
const navigationView = shallowRef<DataView>()
const navigationViewKey = computed(() => navigationView.value
  ? buildDataViewKey(navigationView.value.tableName, navigationView.value.viewId, session.value?.metadataDataSet.scenarioId) : undefined)
const revision = ref(0)
const showDirectory = ref(false)
const workbench = shallowRef<DataSpaceWorkbench>()
const workbenchError = ref('')
const workbenchKey = computed(() => workbench.value ? buildDataViewKey(workbench.value.view.tableName, 'default', session.value?.metadataDataSet.scenarioId) : undefined)
const modelBadgeRules: NonNullable<RGraphProps['nodeBadgeRules']> = [
  ...[1, '1', true].map(value => ({field: 'IsBusinessMain', value, label: '主业务', tone: 'danger' as const})),
  ...[1, '1', true].map(value => ({field: 'IsBusiness', value, label: '业务模型', tone: 'primary' as const})),
]
const graphLegendItems = [
  {key: 'main', badge: '主业务', label: '主业务模型', note: '画布主线，优先关注核心业务表'},
  {key: 'business', badge: '业务层', label: '业务模型', note: '围绕主业务扩展关系和字段语义'},
  {key: 'default', badge: '基础层', label: '普通模型', note: '承载通用来源和补充信息'},
]
watch(revision, () => {
  try {workbench.value?.refresh(); workbenchError.value = ''}
  catch (cause) {workbenchError.value = cause instanceof Error ? cause.message : String(cause)}
})
const layoutEdit = shallowRef<DataSpaceLayoutEdit>()
const graph = ref<InstanceType<typeof RendererGraph>>()
const fileViewEditor = ref<InstanceType<typeof DataSpaceViewEditor>>()
const layoutState = computed(() => {revision.value; return layoutEdit.value?.state()})
const layoutPending = computed(() => {revision.value; return layoutEdit.value?.pending === true})
const unboundViewKey = computed(() => layoutEdit.value ? buildDataViewKey(layoutEdit.value.nodes.tableName, 'default', session.value?.metadataDataSet.scenarioId) : undefined)
const unboundEdgeViewKey = computed(() => layoutEdit.value ? buildDataViewKey(layoutEdit.value.edges.tableName, 'default', session.value?.metadataDataSet.scenarioId) : undefined)
const unboundEdgeSelectedId = computed(() => {
  revision.value
  const id = selectedId.value.startsWith('unbound-edge:') ? selectedId.value.slice(13) : ''
  return layoutEdit.value?.connection(id) ? id : ''
})
const unboundSelectedId = computed(() => {
  revision.value
  const id = selectedId.value.startsWith('unbound:') ? selectedId.value.slice(8) : ''
  return layoutEdit.value?.nodes.rows.some(row => row['rowid'] === id) ? id : ''
})
const layoutError = ref(''), layoutMessage = ref('')
const layoutPreview = shallowRef<Awaited<ReturnType<DataSpaceLayoutEdit['preview']>>>()
const rebuildPreview = computed(() => {revision.value; return layoutEdit.value?.rebuild})
const rebuildEdgeViewKey = computed(() => layoutEdit.value ? buildDataViewKey(layoutEdit.value.rebuildEdges.tableName, 'default', session.value?.metadataDataSet.scenarioId) : undefined)
const viewEditorPending = ref(false)
const sourceEditorPending = ref(false)
const fieldEditorPending = ref(false)
const fieldCreatePending = ref(false)
const modelEditorPending = ref(false)
const metaFieldsEditor = ref<InstanceType<typeof DataSpaceModelFields>>()
const modelEditor = ref<InstanceType<typeof DataSpaceModelEditor>>()
const processEditor = ref<InstanceType<typeof DataSpaceTableConfiguration>>()
const computedEditor = ref<InstanceType<typeof DataSpaceTableConfiguration>>()
const computedConfigPending = ref(false)
const workspaceBusy = computed(() => metaFieldsEditor.value?.busy === true || modelEditor.value?.busy === true
  || processEditor.value?.busy === true || computedEditor.value?.busy === true)
const modelRenamePending = ref(false)
const dataProcessPending = ref(false)
const arrayEditorPending = ref(false)
const modelConfigPending = computed(() => modelEditorPending.value || modelRenamePending.value || dataProcessPending.value || computedConfigPending.value || arrayEditorPending.value)
const modelCreatePending = ref(false)
const modelSourcePending = ref(false)
const activeRemovalId = ref('')
const activeFieldRemovalId = ref('')
const activeFieldRemovalViewId = ref<'default' | 'modelFields'>('default')
const removalMessage = ref('')
const modelRemovalPending = computed(() => !!activeRemovalId.value)
const relationEditorPending = ref(false)
const cascadeEditorPending = ref(false)
const parameterOpen = ref(false)
const parameterRowEditing = ref(false)
const modelPreviewOpen = ref(false)
const detailOpen = ref(false)
const canCloseDefinition = computed(() => !(unboundSelectedId.value || unboundEdgeSelectedId.value ? definitionPending.value : hasPending.value) && !parameterOpen.value && !modelPreviewOpen.value)
const definitionVisible = computed({get: () => detailOpen.value, set: value => {if (!value) closeDefinition()}})
const canCloseParameters = computed(() => !busy.value && parameterState.value.status === 'idle')
const parameterVisible = computed({get: () => parameterOpen.value, set: value => {if (!value) closeParameters()}})
let generation = 0
let active = true
let unsubscribe: (() => void) | undefined
let parameterBaseline: unknown
const targetId = computed(() => typeof route.query['scenarioId'] === 'string' ? route.query['scenarioId'] : '')
const readError = (cause: unknown) => cause instanceof Error ? cause.message : String(cause)
const changed = () => {revision.value++}

function view(table: string): DataView | undefined {return session.value?.metadataDataSet.getView(table, 'default')}
async function copyApi(): Promise<void> {
  const current = session.value
  if (!current || loading.value || isPending() || parameterOpen.value) return
  busy.value = true; apiMessage.value = ''; error.value = ''
  try {
    const content = await current.readApiInfo()
    if (!active || current !== session.value || targetId.value !== current.targetId) return
    if (current.viewState?.dirty) throw new Error('配置已变化，请重新读取 API 信息')
    if (!navigator.clipboard?.writeText) throw new Error('当前环境不支持剪贴板写入')
    await navigator.clipboard.writeText(content)
    if (active && current === session.value) apiMessage.value = 'API 信息已复制（空间、模型、正式主键及命名视图）'
  } catch (cause) {if (active && current === session.value) error.value = readError(cause)}
  finally {if (active && current === session.value) busy.value = false}
}
function readable(table: string, row: DataRow, field: string, source = view(table)): boolean {
  try {return !table.startsWith('Base_') || source?.fieldAccess(row, field).read === 'visible'}
  catch {return false}
}
function text(table: string, row: DataRow, field: string, source = view(table)): string {
  if (!readable(table, row, field, source)) return '不可读'
  const value = row[field]
  return typeof value === 'string' ? value : value === undefined || value === null ? '—' : JSON.stringify(value)
}
function rowNode(table: string, row: DataRow, label: string): DesignNode | null {
  const rowKey = view(table)?.getPkKey(row)
  if (rowKey === undefined || !readable(table, row, table.startsWith('Base_') ? 'rowid' : 'dataSetId')) return null
  return {id: JSON.stringify([table, rowKey]), table, rowKey, label}
}
function nodes(table: string, label: string, parentId?: string): DesignNode[] {
  const source = table === 'DataResourceRelationDefinition' ? relationDisplayView() : view(table)
  return (source?.rows ?? []).flatMap(row => {
    if (parentId !== undefined && (!readable(table, row, 'dataModelId') || row['dataModelId'] !== parentId)) return []
    const title = table === 'DataViewCascadeDefinition' && row['cascadeId'] === undefined
      ? `${text(table, row, 'parentTable')}@${text(table, row, 'parentViewId')} → ${text(table, row, 'childTable')}@${text(table, row, 'childViewId')}`
      : text(table, row, label)
    const node = rowNode(table, row, title)
    return node ? [node] : []
  })
}
const title = computed(() => {
  revision.value
  const row = view('Base_DataSet')?.rows[0]
  return row ? text('Base_DataSet', row, 'Name') : '通过 URL 传入一个目标空间'
})
function unplacedReason(table: string, row: DataRow, source = view(table)): string {
  const identity = table.startsWith('Base_') ? 'rowid' : 'dataSetId'
  if (!readable(table, row, identity, source)) return '记录身份不可读，无法确定层次位置。'
  if (source?.getPkKey(row) === undefined || table === 'Base_DataModel' && typeof row['rowid'] !== 'string') return '记录身份为空或无效，无法确定层次位置。'
  if (table === 'Base_DataModel_Field' || table === 'DataViewDefinition') {
    if (!readable(table, row, 'dataModelId', source)) return '所属模型身份不可读，无法确定归属。'
    if (typeof row['dataModelId'] !== 'string' || !row['dataModelId'].trim()) return '所属模型身份为空或无效。'
    return '所属模型未出现在当前可读模型列表；无法据此判断模型不存在或没有读取权限。'
  }
  return '记录无法归入当前层次，请核查定义身份。'
}
// 待删除对象的工作区只读取DataView原生删除快照，保留取消/核验入口，不复制编辑状态。
const bindingRows = computed(() => {
  revision.value
  const bindings = view('DataTableBindingDefinition')
  return bindings ? [...bindings.rows, ...[...bindings.dirtyTracking.pendingDeleteIds].flatMap(id => {
    const snapshot = bindings.dirtyTracking.getPendingDeleteSnapshot(id)
    return snapshot ? [snapshot] : []
  })] : []
})
const hierarchy = computed(() => {
  revision.value
  const current = session.value
  if (!current) return {nodes: [], messages: []}
  const modelNodes = (view('Base_DataModel')?.rows ?? []).flatMap(row => {
    const node = rowNode('Base_DataModel', row, text('Base_DataModel', row, 'Name'))
    if (!node || typeof row['rowid'] !== 'string') return []
    const fields = nodes('Base_DataModel_Field', 'Name', row['rowid'])
    // 暂存或未决删除只保留原命令的恢复入口，不把目标重新插入正式字段视图。
    for (const removal of current.getModelFieldRemovals(row['rowid'], 'default')) {
      const target = removal.getState().preview
      if (target && !fields.some(field => field.rowKey === target.id)) fields.push({
        id: JSON.stringify(['Base_DataModel_Field', target.id]), table: 'Base_DataModel_Field', rowKey: target.id,
        label: `${target.name}（待处理删除）`, removalModelId: target.modelId,
      })
    }
    const views = nodes('DataViewDefinition', 'viewId', row['rowid'])
    node.children = [{id: `${node.id}:fields`, label: `字段（${view('Base_DataModel_Field')?.requestState === RequestState.Loaded ? fields.length : '未加载'}）`, children: fields},
      {id: `${node.id}:views`, label: `数据视图（${views.length}）`, table: 'Base_DataModel', rowKey: row['rowid'], workspace: 'views', children: views}]
    return [node]
  })
  for (const row of bindingRows.value) {
    const configuration = row['configuration'], tableName = row['tableName']
    if (row['dataSetId'] !== current.targetId || typeof tableName !== 'string' || !isRecord(configuration)
      || configuration['resourceType'] !== 'file' || typeof configuration['resourceId'] !== 'string' || configuration['modelBinding'] !== undefined) continue
    const node = rowNode('DataTableBindingDefinition', row, tableName)
    if (!node) continue
    const views = (view('DataViewDefinition')?.rows ?? []).flatMap(item => {
      if (item['dataSetId'] !== current.targetId || item['tableName'] !== tableName || item['dataModelId'] !== undefined || item['dataModelName'] !== undefined) return []
      const child = rowNode('DataViewDefinition', item, text('DataViewDefinition', item, 'viewId'))
      return child ? [child] : []
    })
    node.children = [{...node, id: `${node.id}:fields`, label: `字段（${Array.isArray(configuration['columns']) ? configuration['columns'].length : 0}）`, workspace: 'fields'},
      {...node, id: `${node.id}:views`, label: `数据视图（${views.length}）`, workspace: 'views', children: views}]
    modelNodes.push(node)
  }
  const root: DesignNode = {id: 'space', label: title.value, table: 'Base_DataSet', rowKey: current.targetId, children: [
    {id: 'parameters', label: '输入参数'}, {id: 'models', label: `模型（${modelNodes.length}）`, children: modelNodes},
    {id: 'relations', label: '模型关系', description: '模型之间的稳定关系，以完整过滤表达式定义；不会因选中或输入变化而改写。', children: [
      {id: 'native-relations', label: '原生关系定义', children: nodes('DataResourceRelationDefinition', 'relationId')},
      {id: 'source-relations', label: `数据库来源记录${view('Base_DataModel_Relation')?.requestState === RequestState.Loaded ? '' : '（未加载）'}`, children: nodes('Base_DataModel_Relation', 'rowid')},
    ]},
    {id: 'cascades', label: '数据级联', description: '输入值变化 → 子选项视图重新查询 → 按配置处理子值。与模型关系独立。',
      children: nodes('DataViewCascadeDefinition', 'cascadeId')},
  ]}
  const placed = new Map<string, Set<string | number>>()
  function collect(items: DesignNode[]): void {
    for (const node of items) {
      if (node.table && node.rowKey !== undefined) {
        const keys = placed.get(node.table) ?? new Set<string | number>()
        keys.add(node.rowKey); placed.set(node.table, keys)
      }
      if (node.children) collect(node.children)
    }
  }
  collect([root])
  const groups: DesignNode[] = [], messages: string[] = []
  let count = 0
  for (const [table, label, nameField] of [
    ['Base_DataModel', '模型', 'Name'], ['Base_DataModel_Field', '字段', 'Name'], ['DataViewDefinition', '数据视图', 'viewId'],
    ['Base_DataModel_Relation', '数据库关系', 'rowid'], ['DataResourceRelationDefinition', '原生关系', 'relationId'], ['DataViewCascadeDefinition', '数据级联', 'cascadeId'],
  ] as const) {
    const children = (view(table)?.rows ?? []).flatMap((row, recordIndex): DesignNode[] => {
      const key = view(table)?.getPkKey(row)
      if (key !== undefined && placed.get(table)?.has(key)) return []
      // The index only locates this read result; it is never a formal identity or a write target.
      return [{id: `unplaced:${table}:${recordIndex}`, table, recordIndex,
        label: `记录 ${recordIndex + 1} · ${text(table, row, nameField)} · ${text(table, row, table.startsWith('Base_') ? 'rowid' : 'dataSetId')}`,
        unplacedReason: unplacedReason(table, row)}]
    })
    if (table === 'Base_DataModel_Field') for (const {view: source, recordIndex} of workbench.value?.unplacedNamedFields() ?? []) {
      const row = source.rows[recordIndex]!
      children.push({id: `unplaced:${table}:${source.viewId}:${recordIndex}`, table, viewId: source.viewId, recordIndex,
        label: `记录 ${recordIndex + 1} · ${text(table, row, nameField, source)} · ${text(table, row, 'rowid', source)}`,
        unplacedReason: unplacedReason(table, row, source)})
    }
    if (!children.length) continue
    count += children.length
    groups.push({id: `unplaced:${table}`, label: `${label}（${children.length}）`, children})
    messages.push(`${label}有 ${children.length} 条记录无法定位到可读的模型或身份；未归入层次，请核查数据权限和定义归属。`)
  }
  if (count) root.children?.push({id: 'unplaced', label: `未归类定义（${count}）`, children: groups,
    description: '以下记录已由当前元数据查询读取，但身份或模型归属尚未确认。选择记录查看可读字段和具体原因；核实正式模型与数据权限后重新打开，不将其视为已删除。'})
  return {nodes: [root], messages}
})
const tree = computed(() => hierarchy.value.nodes)
const treeMessages = computed(() => hierarchy.value.messages)
// This local projection contains only already-authorized navigation labels and identities.
// Definitions, edits and persistence remain in their original metadata views.
watch(() => JSON.stringify(tree.value), () => {
  const current = navigationView.value
  if (!current || current.destroyed) return
  const rows: DataRow[] = []
  function collect(items: DesignNode[], parentId: string | null): void {
    for (const item of items) {
      rows.push({id: item.id, label: item.label, parentId})
      if (item.children) collect(item.children, item.id)
    }
  }
  collect(tree.value, null)
  current.replaceRows(rows)
  current.setCurrentRowById(rows.some(row => row['id'] === selectedId.value) ? selectedId.value : null)
})
const selectTreeNode: NonNullable<InstanceType<typeof RendererTree>['$props']['onNodeClick']> = (...[data, , , control]) => {
  if (typeof data.id === 'string') selectNode(data.id)
  control.cancel = data.id !== selectedId.value
}
function findNode(id: string, candidates = tree.value): DesignNode | undefined {
  for (const node of candidates) {
    if (node.id === id) return node
    const child = node.children && findNode(id, node.children)
    if (child) return child
  }
  return undefined
}
async function openDefinition(mode: 'edit' | 'remove' = 'edit'): Promise<void> {
  graphRemovalOnly.value = mode === 'remove'
  if (selectedId.value === 'parameters') {
    if (session.value) view('Base_DataSet')?.setCurrentRowById(session.value.targetId)
    detailOpen.value = false; parameterOpen.value = true
  }
  else {
    const current = session.value, selection = selectedId.value
    if (!current) return
    detailOpen.value = false; busy.value = true; workspaceLoading.value = true
    try {
      const node = findNode(selection)
      const ownsModelView = node?.table === 'Base_DataModel' || node?.table === 'DataViewDefinition' || node?.table === 'DataTableBindingDefinition'
      const ownsRelation = selection === 'native-relations' || selection === 'relations' || node?.table === 'DataResourceRelationDefinition'
      const ownsCascade = selection === 'cascades' || node?.table === 'DataViewCascadeDefinition'
      if (ownsRelation) await current.loadRelationDefinitions()
      if (selection !== 'space' && selection !== 'models' && !ownsModelView && !ownsRelation && !ownsCascade && !node?.viewId && !unboundSelectedId.value) await current.loadMetadataViews(selection === 'source-relations'
        ? ['Base_DataModel_Relation'] : ['Base_DataModel_Field', 'Base_DataModel_Relation'])
      if (active && session.value === current && selectedId.value === selection) {detailOpen.value = true; error.value = ''}
    } catch (cause) {if (active && session.value === current) error.value = readError(cause)}
    finally {if (active && session.value === current) {busy.value = false; workspaceLoading.value = false; changed()}}
  }
}
function closeDefinition(): void {
  if (canCloseDefinition.value) {detailOpen.value = false; graphRemovalOnly.value = false}
}
function selectNode(id: string, open = true): void {
  if (definitionLoading.value) return
  if (rebuildPreview.value || busy.value) {error.value = '请先完成或取消当前操作，再切换定义'; return}
  const unbound = id.startsWith('unbound:') && layoutEdit.value?.nodes.rows.some(row => row['rowid'] === id.slice(8))
    || id.startsWith('unbound-edge:') && !!layoutEdit.value?.connection(id.slice(13))
  if (layoutPending.value && (!unbound || layoutState.value?.staged)) {error.value = '请先保存、取消或核验当前布局，再切换定义'; return}
  if (id === selectedId.value) {if (open) void openDefinition(); return}
  if (parameterOpen.value) {error.value = '请先保存、关闭或核验当前输入参数，再切换定义'; return}
  if (modelRemovalPending.value || session.value?.hasPendingModelRemovals()) {error.value = '请先取消或核验当前模型删除，再切换定义'; return}
  if (activeFieldRemovalId.value) {error.value = '请先取消或核验当前字段删除，再切换定义'; return}
  if (cascadeEditorPending.value) {error.value = '请先保存或明确处理当前级联草稿，再切换定义'; return}
  if (relationEditorPending.value) {error.value = '请先保存或明确处理当前关系草稿，再切换定义'; return}
  if (viewEditorPending.value) {error.value = '请先保存或明确处理当前视图草稿，再切换定义'; return}
  if (fileBindingDirty.value || fileFieldEditing.value) {error.value = '请先保存、取消或核验当前文件模型配置，再切换定义'; return}
  if (sourceEditorPending.value) {error.value = '请先保存、取消或核验当前来源入参，再切换定义'; return}
  if (fieldEditorPending.value || fieldCreatePending.value) {error.value = '请先保存、取消或核验当前字段配置，再切换定义'; return}
  if (modelConfigPending.value) {error.value = '请先保存、取消或核验当前模型配置，再切换定义'; return}
  if (modelSourcePending.value || session.value?.hasPendingModelSourceEdits()) {error.value = '请先取消预览、替换或核验当前来源，再切换定义'; return}
  if (dataProcessPending.value) {error.value = '请先保存、取消或核验当前数据处理，再切换定义'; return}
  if (modelCreatePending.value || session.value?.hasPendingModelCreate()) {error.value = '请先取消预览、创建或核验本次新增，再切换定义'; return}
  if (findNode(id) || unbound) {selectedId.value = id; error.value = ''; if (open) void openDefinition()}
}
const selected = computed(() => unboundSelectedId.value ? {id: selectedId.value,
  label: String(layoutEdit.value?.nodes.getEditingRow(unboundSelectedId.value)?.['Name'] ?? '待配置模型')} as DesignNode
  : unboundEdgeSelectedId.value ? {id: selectedId.value, label: '节点关系设置'} as DesignNode : findNode(selectedId.value))
watch(selected, (current, previous) => {
  if (!current && previous?.removalModelId) {
    const model = JSON.stringify(['Base_DataModel', previous.removalModelId])
    if (findNode(model)) {selectedId.value = model; changed()}
  }
})
function addModelNode(): void {
  if (definitionPending.value || parameterOpen.value || detailOpen.value && selectedId.value !== 'models') return
  try {const id = layoutEdit.value?.addNode(); if (id) {selectedId.value = `unbound:${id}`; error.value = ''; changed()}}
  catch (cause) {error.value = readError(cause)}
}
function removeUnboundNode(): void {
  if (definitionPending.value || parameterOpen.value || !unboundSelectedId.value) return
  try {layoutEdit.value?.removeNode(unboundSelectedId.value); selectedId.value = 'space'; detailOpen.value = false; error.value = ''; changed()}
  catch (cause) {error.value = readError(cause)}
}
function removeUnboundEdge(): void {
  if (definitionPending.value || parameterOpen.value || !unboundEdgeSelectedId.value) return
  try {layoutEdit.value?.removeEdge(unboundEdgeSelectedId.value); selectedId.value = 'space'; detailOpen.value = false; error.value = ''; changed()}
  catch (cause) {error.value = readError(cause)}
}
function selectEdgeModel(endpoint: 'source' | 'target'): void {
  const modelId = layoutEdit.value?.connection(unboundEdgeSelectedId.value)?.[endpoint]
  if (modelId) selectNode(layoutEdit.value?.nodes.rows.some(row => row['rowid'] === modelId)
    ? `unbound:${modelId}` : JSON.stringify(['Base_DataModel', modelId]))
}
async function openPendingEdge(id: string): Promise<void> {
  const current = session.value, edge = layoutEdit.value?.connection(id)
  if (!edge) return
  selectNode(`unbound-edge:${id}`, false)
  if (selectedId.value !== `unbound-edge:${id}`) return
  await openDefinition()
  if (!active || session.value !== current || selectedId.value !== `unbound-edge:${id}` || !detailOpen.value) return
  try {
    graphTable(edge.source); graphTable(edge.target)
    if (layoutPending.value) throw new Error('请先保存当前布局，再配置模型关系')
    await connectGraph(edge, id)
  } catch (cause) {error.value = readError(cause)}
}
function relationDisplayView(): DataView | undefined {
  const current = session.value
  try {
    const definitions = current?.metadataDataSet.getView('DataResourceRelationDefinition', 'default')
    // 原生定义的查询与目标运行装配独立；保存不切换到另一个视图的查询行身份。
    return definitions?.requestState === RequestState.Loaded && current?.relationDefinitionsReady
      ? definitions : current?.metadataDataSet.getView('DataResourceRelationDefinition', 'graph')
  }
  catch {return undefined} // 失效owner由definitionMessages诊断，不能再投影旧关系。
}
const graphBinding = computed(() => {
  revision.value
  if (definitionLoading.value) return null
  const current = session.value, scenarioId = current?.metadataDataSet.scenarioId
  if (!current || !scenarioId) return null
  const endpoints: Record<string, string> = {}
  if (current.metadataDataSet.destroyed) return null
  // 画布展示文件中的模型绑定；保存失效的运行投影不参与展示或编辑。
  let tables: unknown
  try {tables = current.viewState?.config['tables']} catch {return null} // 失效owner由definitionMessages显示；不投影旧图。
  const models = current.metadataDataSet.getView('Base_DataModel', 'default')
  for (const [tableName, table] of Object.entries(isRecord(tables) ? tables : {})) {
    const binding = isRecord(table) ? table['modelBinding'] : undefined
    if (!isRecord(binding) || typeof binding['modelId'] !== 'string') continue
    const modelId = binding['modelId'], matches = models?.rows.filter(row => row['rowid'] === modelId) ?? []
    const row = matches[0]
    if (!models || matches.length !== 1 || !row || row['Name'] !== binding['modelName'] || row['dataSetId'] !== current.targetId
      || !['rowid', 'Name', 'dataSetId'].every(field => models.fieldAccess(row, field).read === 'visible')) continue
    endpoints[tableName] = modelId
  }
  const files = current.metadataDataSet.getView('DataTableBindingDefinition', 'fileModels')
  if (files?.requestState === RequestState.Loaded) for (const row of files.rows) {
    const key = files.getPkKey(row)
    if (typeof key === 'string' && typeof row['tableName'] === 'string' && row['dataSetId'] === current.targetId
      && ['dataSetId', 'tableName', 'resourceType'].every(field => files.fieldAccess(row, field).read === 'visible')) endpoints[row['tableName']] = key
  }
  const tableEndpoints = {...endpoints}
  const conflictingEndpoints = new Set<string>()
  for (const row of layoutEdit.value?.edges.rows ?? []) for (const [field, endpoint] of [['parentTable', 'source'], ['childTable', 'target']] as const) {
    const key = String(row[field]), id = String(row[endpoint])
    if (Object.hasOwn(endpoints, key) && endpoints[key] !== id) conflictingEndpoints.add(key)
    else endpoints[key] = id
  }
  for (const key of conflictingEndpoints) Reflect.deleteProperty(endpoints, key)
  return {nodes: buildDataViewKey('Base_DataModel', 'default', scenarioId),
    sources: [{dataViewKey: buildDataViewKey('DataTableBindingDefinition', 'fileModels', scenarioId), labelField: 'tableName', descriptionField: '', nodeCaptionField: 'resourceType'},
      ...unboundViewKey.value ? [{dataViewKey: unboundViewKey.value}] : []],
    edges: buildDataViewKey('DataResourceRelationDefinition', relationDisplayView()?.viewId ?? 'graph', scenarioId), tableEndpoints, endpoints,
    positions: layoutState.value?.positions ?? {}}
})
const graphDeleteBlocked = computed(() => {
  revision.value
  if (busy.value || loading.value || parameterOpen.value || detailOpen.value || definitionPending.value) return true
  if (unboundSelectedId.value || unboundEdgeSelectedId.value) return !layoutState.value?.editable
  if (layoutPending.value || !graphCurrent.value) return true
  const node = selected.value, current = node?.table === 'DataResourceRelationDefinition'
    ? relationDisplayView() : node?.table ? view(node.table) : undefined
  const row = node?.rowKey === undefined ? undefined : current?.rows.find(item => current.getPkKey(item) === node.rowKey)
  if (!row) return true
  // 原生关系是文件配置编辑域；删除条件由原关系owner校验，不能套用数据库行删除权限。
  if (node?.table === 'DataResourceRelationDefinition') return session.value?.viewState?.saveStatus !== 'idle'
  if (node?.table === 'DataTableBindingDefinition') return session.value?.viewState?.saveStatus !== 'idle' || current?.deleteActionState(row) !== 'enabled'
  return current?.deleteActionState(row) !== 'enabled'
})
async function deleteGraphSelection(expectedSelection: string): Promise<void> {
  if (expectedSelection !== selectedId.value || graphDeleteBlocked.value) return
  if (unboundSelectedId.value) {removeUnboundNode(); return}
  if (unboundEdgeSelectedId.value) {removeUnboundEdge(); return}
  const current = session.value, kind = graphCurrent.value?.kind
  if (!current || !kind) return
  const fileModel = selected.value?.table === 'DataTableBindingDefinition'
  await openDefinition(kind === 'node' && !fileModel ? 'remove' : 'edit')
  if (!active || current !== session.value || selectedId.value !== expectedSelection || !detailOpen.value) return
  error.value = ''
  await nextTick()
  if (!active || current !== session.value || selectedId.value !== expectedSelection || !detailOpen.value) return
  if (fileModel) {
    activeFileSection.value = 'views'; await nextTick()
    await fileViewEditor.value?.previewBindingRemoval()
  } else if (kind === 'node') await modelRemovalEditor.value?.preview()
  else await relationEditor.value?.remove()
}
const graphToolbar = computed(() => {
  const selection = selectedId.value
  return {wrap: true, children: [
  {type: 'r-button', props: {'data-action': 'select-graph-current', label: '选择', disabled: busy.value, onClick: () => graph.value?.selectCurrent()}},
  {type: 'r-button', props: {'data-action': 'add-model-node', label: '新增模型', buttonType: 'primary', disabled: definitionPending.value || parameterOpen.value || detailOpen.value || !layoutState.value?.editable, onClick: addModelNode}},
  {type: 'r-button', props: {'data-action': 'center-graph', label: '居中', disabled: busy.value, onClick: () => graph.value?.center()}},
  {type: 'r-button', props: {'data-action': 'fit-graph', label: '全图', disabled: busy.value, onClick: () => graph.value?.fitView()}},
  {type: 'r-button', props: {'data-action': 'arrange-graph', label: '对齐',
    disabled: busy.value || definitionPending.value || parameterOpen.value || detailOpen.value || !layoutState.value?.editable, onClick: () => graph.value?.arrange()}},
  {type: 'r-button', props: {'data-action': 'zoom-in-graph', label: '放大', disabled: busy.value, onClick: () => graph.value?.zoomIn()}},
  {type: 'r-button', props: {'data-action': 'zoom-out-graph', label: '缩小', disabled: busy.value, onClick: () => graph.value?.zoomOut()}},
  {type: 'r-button', props: {label: '输入参数', onClick: () => selectNode('parameters')}},
  {type: 'r-button', props: {'data-action': 'copy-api', label: '复制API', dataViewKey: parameterViewKey.value,
    visible: !!parameterViewKey.value, disabled: loading.value || hasPending.value || parameterOpen.value, onClick: copyApi}},
  {type: 'r-button', props: {'data-action': 'remove-graph-selection', label: '删除', buttonType: 'danger',
    dataViewKey: unboundSelectedId.value ? unboundViewKey.value : unboundEdgeSelectedId.value ? unboundEdgeViewKey.value
      : selected.value?.table === 'DataTableBindingDefinition' ? fileBindingKey.value : graphCurrent.value?.kind === 'edge' ? graphBinding.value?.edges : graphBinding.value?.nodes,
    disabled: graphDeleteBlocked.value, onClick: () => deleteGraphSelection(selection)}},
  {type: 'r-button', props: {'data-action': 'save-layout', label: '保存布局', buttonType: 'primary',
    disabled: busy.value || !layoutPending.value || !!layoutState.value?.error || layoutState.value?.status !== 'idle', onClick: () => layoutAction('save')}},
  ], tail: {children: [
  {type: 'r-button', props: {'data-action': 'toggle-directory', label: showDirectory.value ? '收起模型目录' : '模型目录',
    'aria-expanded': showDirectory.value, 'aria-controls': 'data-space-directory', onClick: () => {showDirectory.value = !showDirectory.value}}},
  {type: 'r-button', props: {label: '重新打开', disabled: loading.value || hasPending.value || parameterOpen.value, onClick: load}},
  {type: 'r-button', props: {label: '模型关系', dataViewKey: graphBinding.value?.edges, onClick: () => selectNode('native-relations')}},
  {type: 'r-button', props: {label: '数据级联', onClick: () => selectNode('cascades')}},
  {type: 'r-button', props: {'data-action': 'cancel-layout', label: '取消布局修改',
    disabled: busy.value || !layoutPending.value || layoutState.value?.staged, onClick: () => layoutAction('cancel')}},
  {type: 'r-button', props: {'data-action': 'verify-layout', label: '核验布局保存',
    visible: layoutState.value?.staged && layoutState.value.status === 'unknown', disabled: busy.value, onClick: () => layoutAction('verify')}},
  {type: 'r-button', props: {'data-action': 'preview-layout', label: '预览远端布局文件',
    visible: layoutPending.value, disabled: busy.value, onClick: () => layoutAction('preview')}},
]}}})
const graphCurrent = computed(() => {
  if (unboundSelectedId.value) return {kind: 'node' as const, id: unboundSelectedId.value}
  if (unboundEdgeSelectedId.value) return {kind: 'edge' as const, id: unboundEdgeSelectedId.value}
  const node = selected.value
  if (node?.rowKey === undefined || node.unplacedReason) return null
  if (node.table === 'Base_DataModel' || node.table === 'DataTableBindingDefinition') return {kind: 'node' as const, id: node.rowKey}
  if (node.table === 'DataResourceRelationDefinition') return {kind: 'edge' as const, id: node.rowKey}
  return null
})
function graphTable(modelId: string | number): string {
  const files = session.value?.metadataDataSet.getView('DataTableBindingDefinition', 'fileModels')
  const models = files?.rows.some(row => files.getPkKey(row) === modelId) ? files : view('Base_DataModel')
  if (!models || models.requestState !== RequestState.Loaded || models.mutating || models.rows.length !== models.total
    || models.queryContext['dataSpaceId'] !== session.value?.targetId) throw new Error('当前模型查询尚未完整确认')
  const rows = models.rows.filter(row => models.getPkKey(row) === modelId && row['dataSetId'] === session.value?.targetId
    && (models === files ? ['tableName', 'dataSetId'] : ['rowid', 'dataSetId']).every(field => models.fieldAccess(row, field).read === 'visible'))
  const bindings = Object.entries(graphBinding.value?.tableEndpoints ?? {}).filter(([, id]) => id === modelId)
  const binding = bindings[0]
  if (rows.length !== 1 || bindings.length !== 1 || !binding) throw new Error('连线两端须唯一对应当前空间可读模型和表绑定')
  return binding[0]
}
const graphConnectKeys = computed(() => {
  revision.value
  if (definitionPending.value || parameterOpen.value || detailOpen.value || !graphBinding.value) return []
  try {
    return layoutState.value?.editable ? layoutState.value.draggableKeys : []
  } catch {return []}
})
async function connectGraph(event: Readonly<{source: string | number; target: string | number}>, pendingId?: string): Promise<void> {
  const current = session.value, relations = view('DataResourceRelationDefinition')
  if (!current || !relations || parameterOpen.value || isPending(false)) return
  if (!pendingId) {
    const prior = layoutEdit.value?.edges.rows.find(row => row['source'] === event.source && row['target'] === event.target)
    if (prior) {selectedId.value = `unbound-edge:${String(prior['rowid'])}`; changed(); return}
    let bound = true
    try {graphTable(event.source); graphTable(event.target)} catch {bound = false}
    if (!bound || layoutPending.value) {
      try {
        if (typeof event.source !== 'string' || typeof event.target !== 'string') throw new Error('模型节点身份无效')
        const id = layoutEdit.value?.connect(event.source, event.target)
        if (id) {selectedId.value = `unbound-edge:${id}`; error.value = ''; changed()}
      } catch (cause) {error.value = readError(cause)}
      return
    }
  }
  let addedId: string | undefined
  try {
    await current.loadRelationDefinitions()
    await relations.refresh()
    if (relations.loadingError) throw relations.loadingError
    if (!active || session.value !== current) return
    const file = current.viewState
    if (!file || file.dirty || file.saveStatus !== 'idle') throw new Error('请先处理共享配置再建立关系')
    const parentTable = graphTable(event.source), childTable = graphTable(event.target)
    const existing = relations.rows.filter(row => row['parentTable'] === parentTable && row['childTable'] === childTable)
    if (!pendingId && existing.length > 1) throw new Error('两端已有多条关系，请从模型关系列表选择要编辑的定义')
    const original = existing[0]
    if (original && !pendingId) {
      const key = relations.getPkKey(original)
      if (key === undefined) throw new Error('现有关系身份不可确认')
      selectNode(JSON.stringify(['DataResourceRelationDefinition', key]))
    } else {
      busy.value = true
      if (typeof crypto?.randomUUID !== 'function') throw new Error('当前环境无法安全生成关系标识')
      addedId = pendingId ?? crypto.randomUUID().replaceAll('-', '').toUpperCase()
      await relations.addRow({dataSetId: current.targetId, relationId: addedId, parentTable, childTable})
      if (!active || session.value !== current || current.viewState?.revision !== file.revision
        || current.viewState.text !== file.text || graphTable(event.source) !== parentTable || graphTable(event.target) !== childTable) throw new Error('连线期间目标或配置已变化，本次新增取消')
      const row = relations.rows.find(item => item['relationId'] === addedId), key = row && relations.getPkKey(row)
      if (key === undefined) throw new Error('新增关系草稿身份不可确认')
      selectedId.value = JSON.stringify(['DataResourceRelationDefinition', key])
    }
    error.value = ''; changed()
    await openDefinition()
  } catch (cause) {
    if (addedId && !relations.destroyed) {
      const row = relations.rows.find(item => item['relationId'] === addedId), key = row && relations.getPkKey(row)
      if (key !== undefined) await relations.removeRow(key)
    }
    if (active && session.value === current) error.value = readError(cause)
  } finally {if (active && session.value === current) {busy.value = false; changed()}}
}
const selectGraph: NonNullable<InstanceType<typeof RendererGraph>['$props']['onSelect']> = event => {
  if (event.kind === 'edge' && layoutEdit.value?.connection(String(event.id))) {
    const id = `unbound-edge:${event.id}`
    if (event.open) {event.control.cancel = true; void openPendingEdge(String(event.id))}
    else {selectNode(id, false); event.control.cancel = selectedId.value !== id}
    return
  }
  const fileNodes = session.value?.metadataDataSet.getView('DataTableBindingDefinition', 'fileModels')
  const fileNode = fileNodes?.rows.some(row => fileNodes.getPkKey(row) === event.id)
  const id = event.kind === 'node' && layoutEdit.value?.nodes.rows.some(row => row['rowid'] === event.id) ? `unbound:${event.id}`
    : JSON.stringify([event.kind === 'node' ? (fileNode ? 'DataTableBindingDefinition' : 'Base_DataModel') : 'DataResourceRelationDefinition', event.id])
  selectNode(id, event.open)
  event.control.cancel = selectedId.value !== id
}
const moveLayout: NonNullable<InstanceType<typeof RendererGraph>['$props']['onNodeMove']> = position => {
  if (parameterOpen.value || isPending(false)) return
  layoutError.value = ''; layoutMessage.value = ''; layoutPreview.value = undefined
  try {layoutEdit.value?.move(position)} catch (cause) {layoutError.value = readError(cause)}
  changed()
}
const arrangeLayout: NonNullable<InstanceType<typeof RendererGraph>['$props']['onArrange']> = event => {
  if (parameterOpen.value || detailOpen.value || isPending(false) || !layoutEdit.value) {event.control.cancel = true; return}
  layoutError.value = ''; layoutMessage.value = ''; layoutPreview.value = undefined
  try {layoutEdit.value.arrange(event.nodes)} catch (cause) {event.control.cancel = true; layoutError.value = readError(cause)}
  changed()
}
async function layoutAction(action: 'save' | 'cancel' | 'verify' | 'preview' | 'adopt'): Promise<void> {
  const editor = layoutEdit.value
  if (!editor || busy.value) return
  busy.value = true; layoutError.value = ''; layoutMessage.value = ''
  try {
    if (action === 'save') {await editor.save(); layoutMessage.value = editor.pending ? '本轮布局保存已确认，仍有修改待保存' : '布局已保存并回读确认'}
    else if (action === 'cancel') {editor.cancel(); layoutMessage.value = '已取消本地布局修改'}
    else if (action === 'verify') {layoutMessage.value = await editor.verify() === 'confirmed'
      ? editor.pending ? '本轮布局保存已确认，仍有修改待保存；未重复提交' : '布局已回读确认；未重复提交' : '确认原提交未应用；草稿保留'}
    else if (action === 'preview') layoutPreview.value = await editor.preview()
    else if (layoutPreview.value) {await editor.adopt(layoutPreview.value); layoutMessage.value = '已采用远端共享配置'}
    error.value = ''
    if (action !== 'preview') layoutPreview.value = undefined
  } catch (cause) {if (active && layoutEdit.value === editor) layoutError.value = readError(cause)}
  finally {if (active && layoutEdit.value === editor) {busy.value = false; changed()}}
}
async function rebuildLayout(action: 'prepare' | 'confirm' | 'cancel'): Promise<void> {
  const editor = layoutEdit.value
  if (!editor || busy.value || action === 'prepare' && (isPending() || parameterOpen.value || detailOpen.value)) return
  busy.value = true; layoutError.value = ''; layoutMessage.value = ''
  try {
    if (action === 'prepare') await editor.prepareRebuild()
    else if (action === 'cancel') editor.cancelRebuild()
    else if (editor.rebuild) {await editor.confirmRebuild(editor.rebuild); layoutMessage.value = editor.pending ? '本轮布局重建已确认，仍有修改待保存' : '布局已重建并回读确认'}
  } catch (cause) {if (active && layoutEdit.value === editor) layoutError.value = readError(cause)}
  finally {if (active && layoutEdit.value === editor) {busy.value = false; changed()}}
}
async function selectCreatedModel(id: string): Promise<void> {
  const current = session.value
  if (!current) return
  const pendingId = unboundSelectedId.value, layout = layoutEdit.value
  busy.value = true; error.value = ''
  try {
    if (pendingId) layout?.bindCreatedNode(pendingId, id)
    await current.refresh()
    if (pendingId && active && session.value === current) {await layout?.save(); layoutMessage.value = layout?.pending
      ? '模型已创建，本轮节点位置保存已确认，仍有修改待保存' : '模型已创建，节点位置已保存并回读确认'}
  }
  catch (cause) {if (active && session.value === current) error.value = `新模型已创建；${pendingId ? '布局或' : ''}目标视图装配仍需处理：${readError(cause)}`}
  finally {
    if (active && session.value === current) {
      selectedId.value = JSON.stringify(['Base_DataModel', id])
      if (pendingId && layout?.pending) detailOpen.value = false
      busy.value = false; changed()
    }
  }
}
const sourceFieldId = computed(() => {
  revision.value
  const node = selected.value
  if (node?.unplacedReason || node?.table !== 'Base_DataModel_Field' || typeof node.rowKey !== 'string') return null
  const fields = view(node.table)
  const row = fields?.rows.find(item => fields.getPkKey(item) === node.rowKey)
  return row && readable(node.table, row, 'type') && row['type'] === 'inputParams' ? node.rowKey : null
})
const dataFieldId = computed(() => {
  revision.value
  const node = selected.value
  if (node?.unplacedReason || node?.table !== 'Base_DataModel_Field' || typeof node.rowKey !== 'string') return null
  if (node.removalModelId) return node.rowKey
  const fields = view(node.table), row = fields?.rows.find(item => fields.getPkKey(item) === node.rowKey)
  return row && readable(node.table, row, 'type') && row['type'] === 'dataModel' ? node.rowKey : null
})
const fieldModelId = computed(() => {
  revision.value
  const node = selectedId.value.endsWith(':fields') ? findNode(selectedId.value.slice(0, -7)) : null
  return viewContext.value?.modelId ?? (node?.table === 'Base_DataModel' && typeof node.rowKey === 'string' ? node.rowKey : undefined)
})
const modelFieldIds = computed(() => {
  revision.value
  const modelId = fieldModelId.value
  if (!modelId) return undefined
  return (view('Base_DataModel_Field')?.rows ?? []).flatMap(row =>
    ['rowid', 'dataModelId', 'type'].every(key => readable('Base_DataModel_Field', row, key))
      && row['dataModelId'] === modelId && row['type'] === 'dataModel' && typeof row['rowid'] === 'string' ? [row['rowid']] : [])
})
const fieldEditorId = computed(() => dataFieldId.value ?? modelFieldIds.value?.[0])
const viewContext = computed(() => {
  revision.value
  const node = selected.value
  if (node?.unplacedReason || !node?.table || node.rowKey === undefined || !['Base_DataModel', 'DataViewDefinition'].includes(node.table)) return null
  const row = view(node.table)?.getEditingRow(node.rowKey)
  const modelId = node.table === 'Base_DataModel' ? row?.['rowid'] : row?.['dataModelId']
  const models = view('Base_DataModel')?.rows.filter(item => readable('Base_DataModel', item, 'rowid') && item['rowid'] === modelId) ?? []
  const model = models[0]
  if (models.length !== 1 || !model || typeof modelId !== 'string' || !readable('Base_DataModel', model, 'Name') || typeof model['Name'] !== 'string') return null
  return {modelId, modelName: model['Name'], rowKey: node.table === 'DataViewDefinition' ? node.rowKey : undefined}
})
const fileContext = computed(() => {
  revision.value
  const node = selected.value
  if (node?.unplacedReason || !node?.table || node.rowKey === undefined || !['DataTableBindingDefinition', 'DataViewDefinition'].includes(node.table)) return null
  const source = view(node.table)
  const record = source?.getEditingRow(node.rowKey) ?? source?.dirtyTracking.getPendingDeleteSnapshot(node.rowKey), tableName = record?.['tableName']
  const bindings = view('DataTableBindingDefinition')
  const matches = bindingRows.value.filter(row => row['dataSetId'] === targetId.value && row['tableName'] === tableName)
  const binding = matches[0], configuration = binding?.['configuration'], key = binding && bindings?.getPkKey(binding)
  if (matches.length !== 1 || key === undefined || typeof tableName !== 'string' || !isRecord(configuration)
    || configuration['resourceType'] !== 'file' || typeof configuration['resourceId'] !== 'string' || configuration['modelBinding'] !== undefined
    || record?.['dataSetId'] !== targetId.value || record['dataModelId'] !== undefined || record['dataModelName'] !== undefined) return null
  return {tableName, resourceId: configuration['resourceId'], bindingKey: key, rowKey: node.table === 'DataViewDefinition' ? node.rowKey : undefined}
})
watch(fileContext, (current, previous) => {
  if (!current && previous && !fileBindingDirty.value) {detailOpen.value = false; selectedId.value = 'space'}
})
const fileBindingKey = computed(() => session.value ? buildDataViewKey('DataTableBindingDefinition', 'default', session.value.metadataDataSet.scenarioId) : undefined)
const fileBindingDirty = computed(() => {revision.value; const bindings = view('DataTableBindingDefinition'); return bindings?.hasEditingChanges() === true || bindings?.dirtyTracking.hasPendingChanges() === true})
const fileDefinitionStatus = computed(() => {revision.value; try {return session.value?.viewState?.saveStatus ?? 'idle'} catch {return 'pending'}})
const activeFileSection = ref<string | number>('source')
const fileFieldEditing = ref(false)
const fileFieldChildren: SparkNode[] = [
  {type:'r-text',props:{field:'name',label:'名称'}},
  {type:'r-text',props:{field:'label',label:'标题'}},
  {type:'r-text',props:{field:'type',label:'类型'}},
  {type:'r-checkbox',props:{field:'isPrimaryKey',label:'主键'}},
  {type:'r-checkbox',props:{field:'required',label:'必填'}},
  {type:'r-checkbox',props:{field:'allowDBNull',label:'允许空值'}},
  {type:'r-text',props:{field:'computeExpression',label:'计算表达式'}},
]
watch(() => [fileContext.value?.tableName, fileContext.value?.rowKey, selected.value?.workspace], ([table, rowKey, workspace], [previous]) => {
  if (!table) return
  if (table !== previous) activeFileSection.value = 'source'
  if (workspace === 'fields') activeFileSection.value = 'fields'
  if (rowKey !== undefined || workspace === 'views') activeFileSection.value = 'views'
  const bindings = view('DataTableBindingDefinition'), key = fileContext.value?.bindingKey
  if (key !== undefined && bindings?.getPkKey(bindings.currentRow ?? {}) !== key) bindings?.setCurrentRowById(key)
}, {flush: 'sync'})
async function saveFileModel(): Promise<void> {
  const current = session.value
  if (!current || busy.value || fileFieldEditing.value || !fileContext.value || !fileBindingDirty.value) return
  busy.value = true; error.value = ''
  try {
    const result = await current.metadataDataSet.saveChanges({views: [{tableName: 'DataTableBindingDefinition', viewId: 'default'}]})
    if (!result.success) throw new Error(result.message)
    const refreshed = await current.metadataDataSet.getView('DataTableBindingDefinition', 'fileModels')?.requestRefresh()
    if (refreshed && !refreshed.success) throw new Error(`文件配置已保存，画布回读未完成：${refreshed.message ?? '查询失败'}`)
  } catch (cause) {error.value = readError(cause)}
  finally {busy.value = false; changed()}
}
function discardFileModel(): void {
  if (busy.value || fileFieldEditing.value || !fileContext.value || fileDefinitionStatus.value !== 'idle') return
  try {view('DataTableBindingDefinition')?.discardPendingChanges(); error.value = ''; changed()}
  catch (cause) {error.value = readError(cause)}
}
const modelViewKey = computed(() => session.value?.metadataDataSet.scenarioId
  ? buildDataViewKey('Base_DataModel', 'default', session.value.metadataDataSet.scenarioId) : undefined)
const sourceLabelParts = computed(() => {
  revision.value
  const modelView = view('Base_DataModel'), row = modelView?.currentRow
  if (!modelView || !row || !readable('Base_DataModel', row, 'rowid') || row['rowid'] !== viewContext.value?.modelId) {
    return {name: false, database: false, type: false}
  }
  const access = (field: string) => modelView.fieldAccess(row, field).read
  const present = (field: string) => access(field) === 'masked'
    || access(field) === 'visible' && typeof row[field] === 'string' && row[field].trim() !== ''
  // 只决定标点和重复前缀；实际值与脱敏结果由标准组件从视图读取。
  const duplicateDatabase = access('DbName') === 'visible' && access('MetaName') === 'visible'
    && String(row['DbName']).trim() === String(row['MetaName']).trim()
  return {name: present('MetaName'), database: present('DbName') && !duplicateDatabase, type: present('Type')}
})
const activeModelSection = ref<string | number>('source')
const activeSave = computed(() => activeModelSection.value === 'dataProcess' ? processEditor.value
    : activeModelSection.value === 'source'
      ? computedConfigPending.value ? computedEditor.value : metaFieldsEditor.value?.hasEditor ? metaFieldsEditor.value : modelEditor.value : undefined)
const modelToolbar = computed(() => ({wrap: true, children: [
  {type: 'r-button', props: {'data-action': 'open-model-preview', label: '预览', buttonType: 'primary',
    visible: activeModelSection.value !== 'views',
    disabled: busy.value || parameterOpen.value || workspaceBusy.value || arrayEditorPending.value || modelEditor.value?.dialogOpen === true,
    onClick: () => {modelPreviewOpen.value = true}}},
  {type: 'r-button', props: {'data-action': 'save-model-workspace', label: '保存', buttonType: 'primary',
    visible: activeModelSection.value !== 'views', disabled: busy.value || arrayEditorPending.value || workspaceBusy.value || modelEditor.value?.dialogOpen === true || activeSave.value?.canSave !== true,
    onClick: async () => {await activeSave.value?.save(); changed()}}},
]}))
watch([() => viewContext.value?.modelId, () => viewContext.value?.rowKey, () => selected.value?.workspace], ([modelId, rowKey, workspace], [previousModelId]) => {
  modelPreviewOpen.value = false
  if (modelId !== previousModelId) activeModelSection.value = 'source'
  if (rowKey !== undefined || workspace === 'views') activeModelSection.value = 'views'
})
watch(activeModelSection, section => {
  const context = viewContext.value
  if (section !== 'views' || !context || context.rowKey !== undefined || isPending()) return
  const definitions = view('DataViewDefinition')
  const defaults = definitions?.rows.filter(row => row['dataModelId'] === context.modelId
    && row['dataSetId'] === targetId.value && row['viewId'] === 'default') ?? []
  if (defaults.length === 1) selectView(definitions?.getPkKey(defaults[0]!))
})
const removalModelId = computed(() => activeRemovalId.value || (graphRemovalOnly.value && selected.value?.table === 'Base_DataModel' ? viewContext.value?.modelId : undefined))
function beginModelRemoval(id: string): void {activeRemovalId.value = id; removalMessage.value = ''}
function beginFieldRemoval(id: string, fieldViewId: 'default' | 'modelFields' = 'default'): void {
  if (busy.value || parameterOpen.value || activeFieldRemovalId.value || fieldViewId !== 'modelFields' && isPending()) return
  const fields = session.value?.metadataDataSet.getView('Base_DataModel_Field', fieldViewId), row = fields?.rows.find(item => item['rowid'] === id)
  if (!row || fields?.fieldAccess(row, 'dataModelId').read !== 'visible' || typeof row['dataModelId'] !== 'string') return
  activeFieldRemovalId.value = id; removalMessage.value = ''
  activeFieldRemovalViewId.value = fieldViewId
}
function endFieldRemoval(): void {
  activeFieldRemovalId.value = ''; changed()
}
function endModelRemoval(confirmed: boolean, close = false): void {
  const id = activeRemovalId.value
  activeRemovalId.value = ''; changed()
  if (confirmed || id && !view('Base_DataModel')?.rows.some(row => row['rowid'] === id)) {
    selectedId.value = 'models'
    removalMessage.value = confirmed ? '模型及其从属定义已删除并回读确认' : '已采用当前查询结果；不代表原删除完整成功'
  }
  if (graphRemovalOnly.value && (confirmed || close)) {detailOpen.value = false; graphRemovalOnly.value = false}
}
function selectView(key: string | number | undefined): void {
  if (fileContext.value) {
    selectedId.value = JSON.stringify(key === undefined ? ['DataTableBindingDefinition', fileContext.value.bindingKey] : ['DataViewDefinition', key])
    error.value = ''; changed(); return
  }
  const context = viewContext.value
  if (!context) return
  selectedId.value = JSON.stringify(key === undefined ? ['Base_DataModel', context.modelId] : ['DataViewDefinition', key])
  error.value = ''; changed()
}
function selectRelation(key: string | number | undefined): void {
  selectedId.value = key === undefined ? 'native-relations' : JSON.stringify(['DataResourceRelationDefinition', key])
  error.value = ''; changed()
}
function selectCascade(key: string | number | undefined): void {
  selectedId.value = key === undefined ? 'cascades' : JSON.stringify(['DataViewCascadeDefinition', key])
  error.value = ''; changed()
}
const detail = computed(() => {
  revision.value
  const node = selected.value
  if (!node?.table) return []
  const currentView = session.value?.metadataDataSet.getView(node.table, node.viewId ?? 'default')
  const row = node.recordIndex !== undefined ? currentView?.rows[node.recordIndex]
    : node.rowKey !== undefined ? currentView?.getEditingRow(node.rowKey) : undefined
  if (!currentView || !row) return []
  return currentView.columns.filter(column => column.name !== '_pk' && column.name !== 'inputParams')
    .map(column => ({name: column.name, value: text(node.table!, row, column.name, currentView)}))
})
const definitionMessages = computed(() => {
  if (definitionLoading.value) return []
  revision.value
  const current = session.value
  if (!current) return []
  try {
    const status = current.definitionStatus
    if (status === 'absent') return ['尚无视图配置；正式模型、字段和输入参数仍可维护。']
    if (status === 'unloaded') return ['模型定义待按需读取；已保存的配置和画布仍可查看。']
    if (status === 'loading') return ['正在读取模型定义…']
    if (status === 'failed') return [current.definitionError!.message]
    return [...current.definitionDiagnostics]
  } catch (cause) {return [readError(cause)]}
})
const parameterViewKey = computed(() => session.value?.metadataDataSet.scenarioId
  ? buildDataViewKey('Base_DataSet', 'default', session.value.metadataDataSet.scenarioId) : undefined)
const parameterState = computed(() => {
  revision.value
  try {
    const current = session.value
    const currentView = view('Base_DataSet')
    const row = currentView?.rows[0]
    if (!current || !currentView || !row || currentView.rows.length !== 1 || currentView.getPkKey(row) !== current.targetId
      || currentView.fieldAccess(row, 'inputParams').read !== 'visible') throw new Error('当前参数声明不可读')
    const state = current.getInputParameters().getState()
    DataSpaceDesignApi.readInputParameters({value: currentView.getEditingRow(current.targetId)?.['inputParams'], editable: true})
    return {...state, error: '', writable: currentView.fieldAccess(row, 'inputParams').write === 'allowed'
      && currentView.editActionState(row) === 'enabled'}
  } catch (cause) {return {status: 'idle', pending: false, writable: false, error: readError(cause)}}
})
const inspection = computed(() => {
  revision.value
  if (selectedId.value !== 'parameters') return {result: null, error: ''}
  try {return {result: session.value?.inspectInputParameters() ?? null, error: ''}} catch (cause) {return {result: null, error: readError(cause)}}
})
function isPending(includeLayout = true): boolean {
  if (parameterRowEditing.value) return true
  if (layoutEdit.value?.rebuild) return true
  if (activeFieldRemovalId.value) return true
  if (includeLayout && layoutEdit.value?.pending) return true
  if (busy.value || dataProcessPending.value || fileFieldEditing.value || fieldCreatePending.value || modelRemovalPending.value || viewEditorPending.value || sourceEditorPending.value || fieldEditorPending.value || modelConfigPending.value || modelCreatePending.value || modelSourcePending.value || relationEditorPending.value || cascadeEditorPending.value) return true
  const current = session.value
  if (!current) return false
  try {
    const state = current.getInputParameters().getState()
    const definitions = ['DataTableBindingDefinition', 'DataViewDefinition', 'DataResourceRelationDefinition', 'DataViewCascadeDefinition'].map(view)
    const fields = view('Base_DataModel_Field')
    const models = view('Base_DataModel')
    return state.pending || state.status !== 'idle' || current.hasPendingSourceInputs() || current.hasPendingFieldEdits() || fields?.hasEditingChanges() === true || fields?.dirtyTracking.hasPendingChanges() === true
      || current.hasPendingModelEdits() || current.hasPendingModelRemovals() || current.hasPendingModelCreate() || current.hasPendingModelSourceEdits() || models?.hasEditingChanges() === true || models?.dirtyTracking.hasPendingChanges() === true
      || definitions.some(definition => definition?.hasEditingChanges() === true || definition?.dirtyTracking.hasPendingChanges() === true)
      || current.viewState?.dirty === true || current.viewState?.saveStatus !== 'idle' && current.viewState !== null
  } catch {return true}
}
const hasPending = computed(() => {revision.value; return isPending()})
const definitionPending = computed(() => {revision.value; return isPending(false)})
useSystemPageDirtySource({get isDirty() {return isPending()}})
function beforeUnload(event: BeforeUnloadEvent): void {if (isPending()) {event.preventDefault(); event.returnValue = ''}}
window.addEventListener('beforeunload', beforeUnload)

async function load(): Promise<void> {
  if (session.value && (isPending() || parameterOpen.value)) {error.value = '请先保存或明确处理本地修改和待核验提交，并关闭输入参数窗口'; return}
  const ownGeneration = ++generation
  definitionLoading.value = false
  workspaceLoading.value = false; busy.value = false
  unsubscribe?.(); unsubscribe = undefined
  layoutEdit.value?.dispose(); layoutEdit.value = undefined
  layoutError.value = ''; layoutMessage.value = ''; layoutPreview.value = undefined
  sparkRemove(PAGE_RUNTIME); pageRuntime?.dispose(); pageRuntime = undefined
  session.value?.dispose(); session.value = null; navigationView.value = undefined; workbench.value = undefined; workbenchError.value = ''
  error.value = ''; actionError.value = ''; actionMessage.value = ''; apiMessage.value = ''; selectedId.value = 'space'; detailOpen.value = false
  const id = route.query['scenarioId']
  if (typeof id !== 'string' || !id || id.trim() !== id || id === '.' || id === '..' || /[\\/%@#\u0000-\u001f\u007f]/.test(id)
    || Object.hasOwn(route.query, 'dataSpaceId') || Object.hasOwn(route.query, 'additionalScenarioIds')) {
    loading.value = false; error.value = '请通过唯一的 scenarioId URL 参数指定目标空间，不能同时传入其他空间身份'; return
  }
  loading.value = true
  try {
    const opened = await openLowcodeDataSpaceDesignSession(id)
    if (!active || generation !== ownGeneration) {opened.dispose(); return}
    // 页面后续创建的控件输入和投影视图各自响应绑定；不将其变化回灌整个空间。
    // 保留正式表实例身份，其按需创建的命名视图仍属于本次元数据定义。
    const definitionTables = new Set(Object.values(opened.metadataDataSet.tables))
    let runtime: PageRuntime | undefined
    try {
      const scenarioId = opened.metadataDataSet.scenarioId
      if (!scenarioId) throw new Error('元数据空间缺少正式场景身份')
      runtime = new PageRuntime({pageId: '/data-space-design', scenarioIds: [scenarioId],
        loadScenario: async () => opened.metadataDataSet})
      await runtime.load()
      if (!active || generation !== ownGeneration) {runtime.dispose(); opened.dispose(); return}
      sparkProvide(PAGE_RUNTIME, runtime)
      pageRuntime = runtime
    } catch (cause) {runtime?.dispose(); opened.dispose(); throw cause}
    const navigation = opened.metadataDataSet.addTable(`DesignNavigation_${crypto.randomUUID().replaceAll('-', '')}`,
      ['id', 'label', 'parentId'].map(name => ({name, type: 'string', isPrimaryKey: name === 'id'})))
    navigation.resourceType = 'static-data'
    navigationView.value = navigation.getOrCreateView('default')
    navigationView.value.configure({treeConfig: {idField: 'id', parentIdField: 'parentId', textField: 'label', treeMode: 'flat'}})
    session.value = opened
    workbench.value = new DataSpaceWorkbench(opened.metadataDataSet, opened.targetId)
    loading.value = false; definitionLoading.value = true; changed()
    await nextTick()
    try {await opened.loadGraphRelations()} catch (cause) {
      if (!active || generation !== ownGeneration) return
      error.value = readError(cause)
    }
    if (!active || generation !== ownGeneration) return
    definitionLoading.value = false; changed()
    const layout = new DataSpaceLayoutEdit(opened)
    layoutEdit.value = layout
    try {await layout.initialize()} catch (cause) {
      if (active && generation === ownGeneration) layoutError.value = readError(cause)
    }
    if (!active || generation !== ownGeneration) {layout.dispose(); return}
    parameterBaseline = view('Base_DataSet')?.rows[0]?.['inputParams']
    const metadataChanged = (tableName: string): void => {
      const table = opened.metadataDataSet.getTable(tableName)
      if (session.value === opened && table && definitionTables.has(table)) changed()
    }
    unsubscribe = opened.metadataDataSet.onAnyViewChange({rowsChanged: metadataChanged, editingChanged: metadataChanged,
      editingFieldChanged: metadataChanged, editingDiscarded: metadataChanged, requestStateChanged: metadataChanged})
    changed()
  } catch (cause) {if (active && generation === ownGeneration) error.value = readError(cause)}
  finally {if (active && generation === ownGeneration) {loading.value = false; definitionLoading.value = false}}
}
async function parameterAction(action: 'save' | 'verify'): Promise<void> {
  const current = session.value
  if (!current || busy.value) return
  busy.value = true; actionError.value = ''; actionMessage.value = ''
  try {
    const owner = current.getInputParameters()
    if (action === 'save') await owner.save({expectedValue: parameterBaseline})
    else await owner.reload({discardPending: owner.getState().pending})
    if (!active || session.value !== current) return
    parameterBaseline = view('Base_DataSet')?.rows[0]?.['inputParams']
    if (owner.getState().pending) actionMessage.value = '原输入参数提交已回读确认；仍有未保存修改，请继续保存或放弃'
    else {
      if (action === 'save') parameterOpen.value = false
      actionMessage.value = action === 'save' ? '输入参数已保存并回读确认' : '已重新读取当前声明；未重复提交'
    }
  } catch (cause) {if (active && session.value === current) actionError.value = readError(cause)}
  finally {if (active && session.value === current) {busy.value = false; changed()}}
}
function saveParameters(): Promise<void> {
  if (parameterRowEditing.value) return Promise.resolve()
  if (!parameterState.value.pending) {closeParameters(); return Promise.resolve()}
  return parameterAction('save')
}
function verifyParameters(): Promise<void> {return parameterAction('verify')}
function cancelParameters(): void {
  const current = session.value
  if (!current || busy.value) return
  try {
    if (current.getInputParameters().getState().status !== 'idle') return
    view('Base_DataSet')?.discardPendingChanges([current.targetId])
    actionError.value = ''; actionMessage.value = '已放弃本地修改'; changed()
  } catch (cause) {actionError.value = readError(cause)}
}
function closeParameters(): void {
  // Dialog may emit false again after a successful save's close animation.
  if (!parameterOpen.value || !canCloseParameters.value) return
  if (parameterState.value.pending) cancelParameters()
  if (!parameterState.value.pending) parameterOpen.value = false
}
watch(() => route.fullPath, () => {void load()}, {immediate: true})
onBeforeUnmount(() => {
  active = false; generation++; unsubscribe?.(); sparkRemove(PAGE_RUNTIME)
  layoutEdit.value?.dispose()
  pageRuntime?.dispose(); session.value?.dispose()
  window.removeEventListener('beforeunload', beforeUnload)
})
</script>

<style scoped src="./data-set-design-page.css"></style>
<style scoped>
.data-space-design-page {
  --spark-primary:color-mix(in srgb, var(--el-color-primary) 50%, var(--el-text-color-primary));
  --spark-primary-hover:var(--spark-primary); --spark-primary-weak:var(--el-color-primary-light-9);
  --spark-danger:color-mix(in srgb, var(--el-color-danger) 50%, var(--el-text-color-primary)); --spark-danger-weak:var(--el-color-danger-light-9);
  --spark-bg-page:var(--el-bg-color); --spark-bg-soft:var(--el-fill-color-lighter); --spark-text-primary:var(--el-text-color-primary);
  --spark-text-regular:var(--el-text-color-regular); --spark-text-secondary:var(--el-text-color-secondary);
  --spark-radius-lg:12px; --spark-radius-md:8px; --spark-radius-pill:999px;
  --spark-space-1:4px; --spark-space-2:8px; --spark-space-3:12px; --spark-space-4:16px;
  --spark-font-size-xs:11px; --spark-font-size-sm:12px; --spark-font-size-base:14px; --spark-font-size-lg:16px; --spark-font-size-xl:18px;
  padding:1rem; min-width:0; height:100%; box-sizing:border-box; overflow:auto; color:var(--el-text-color-primary);
}
header {display: flex; justify-content: space-between; align-items: center; gap: 1rem; border-bottom: 1px solid var(--el-border-color); margin-bottom: 1rem;}
h1 {font-size: 1.35rem; margin: 0;} h2 {font-size: 1.15rem; margin-top: 0; overflow-wrap: anywhere;}
header p {color: var(--el-text-color-secondary); word-break: break-all;}
.design-workbench {margin-bottom:12px;}
.design-layout {display: grid; grid-template-columns: minmax(0, 1fr); gap: 1.25rem;}
.design-layout--directory {grid-template-columns: minmax(13rem, 20%) minmax(0, 1fr);}
nav {border-right: 1px solid var(--el-border-color); padding-right: 1rem; overflow: auto; max-height: calc(100vh - 16rem);}
.design-canvas {min-width:0; min-height:560px; display:flex; flex-direction:column; gap:10px;}
.design-canvas > .renderer-graph {height:calc(100vh - 340px); min-height:460px;}
.design-canvas > p {color: var(--el-text-color-secondary);}
nav button {background: transparent; border: 0; color: inherit; cursor: pointer; text-align: left; font: inherit; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;}
.design-detail {min-width: 0; padding: .5rem;}
dl {display: grid; grid-template-columns: minmax(8rem, 25%) minmax(0, 1fr); gap: .75rem;}
dt {font-weight: 600; word-break: break-word;} dd {margin: 0; white-space: pre-wrap; overflow-wrap: anywhere;}
.actions {display: flex; gap: .5rem; flex-wrap: wrap; margin: 1rem 0;}
.references {margin-top: 1.5rem; color: var(--el-text-color-secondary); overflow-wrap: anywhere;}
.parameter-dialog-footer {display: flex; justify-content: flex-end; gap: .75rem; width: 100%;}
[role="alert"] {color: var(--el-color-danger); white-space: pre-wrap;}
@media (max-width: 760px) {.design-layout {grid-template-columns: 1fr;} nav {border-right: 0; border-bottom: 1px solid var(--el-border-color); max-height: 18rem; padding-bottom: 1rem;}}
</style>
