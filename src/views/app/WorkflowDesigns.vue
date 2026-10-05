<!--
@module app:views/app/WorkflowDesigns
职责：提供工作流设计稿的可视化编辑入口，连接 Dify-like JSON graph、文件保存 API 与 workflow definition 发布。
边界：只处理设计态 JSON，不执行 Agent workflow 运行时。
AI用途：需要验证 workflow 编辑器如何配置业务节点、ClassModel model context 或步骤线投影时，用本页面定位。
-->
<template>
  <div class="workflow-design-page">
    <div class="workflow-design-shell" :style="workflowShellStyle">
      <aside class="workflow-design-sidebar" :class="{ 'is-collapsed': leftPanelCollapsed }">
        <button
          v-if="leftPanelCollapsed"
          type="button"
          class="workflow-sidebar-collapsed-button"
          title="展开设计列表"
          @click="leftPanelCollapsed = false"
        >
          <span>设计</span>
          <strong>{{ designs.length }}</strong>
        </button>
        <template v-else>
          <div class="panel-heading workflow-list-heading">
            <span>工作流设计</span>
            <span class="workflow-list-heading-actions">
              <el-tag size="small" type="info">{{ designs.length }}</el-tag>
              <el-button link size="small" @click="leftPanelCollapsed = true">收起</el-button>
            </span>
          </div>
          <el-skeleton v-if="loadingList && designs.length === 0" :rows="6" animated />
          <el-empty v-else-if="designs.length === 0" description="暂无工作流设计" />
          <div v-else class="workflow-list">
            <div
              v-for="item in designs"
              :key="item.workflowId"
              class="workflow-list-item"
              :class="{
                'is-active': item.workflowId === currentWorkflowId,
                'is-unreadable': isUnreadableDesign(item),
              }"
              :title="workflowDesignListItemTitle(item)"
              role="button"
              tabindex="0"
              @click="openDesign(item.workflowId)"
              @keydown.enter.prevent="openDesign(item.workflowId)"
            >
              <div class="workflow-list-main">
                <strong>{{ item.title || item.workflowId }}</strong>
                <span>{{ item.workflowId }}</span>
              </div>
              <div class="workflow-list-meta">
                <el-tag size="small" :type="isUnreadableDesign(item) ? 'danger' : 'success'">
                  {{ item.status || 'draft' }}
                </el-tag>
                <span>{{ item.version ? `v${item.version}` : 'v1' }}</span>
              </div>
              <div class="workflow-list-actions">
                <el-button link size="small" :icon="FolderOpened" @click.stop="openDesign(item.workflowId)">
                  打开
                </el-button>
                <el-button link size="small" type="danger" :icon="Delete" @click.stop="deleteDesign(item.workflowId)">
                  删除
                </el-button>
              </div>
            </div>
          </div>
        </template>
      </aside>

      <div
        class="layout-resize-handle"
        :class="{ 'is-disabled': leftPanelCollapsed }"
        title="Resize workflow list"
        role="separator"
        aria-orientation="vertical"
        @pointerdown.prevent="startLayoutResize($event, 'left')"
      />

      <main class="workflow-design-canvas">
        <div v-if="currentDocument" class="canvas-toolbar">
          <div class="document-title">
            <span class="document-title-label">工作流设计</span>
            <span class="document-title-id">{{ currentDocument.workflow.id }}</span>
            <el-tag size="small">{{ currentDocument.kind }}</el-tag>
            <el-tag size="small" :type="hasUnsavedChanges ? 'warning' : 'success'">
              {{ hasUnsavedChanges ? 'unsaved' : 'saved' }}
            </el-tag>
          </div>
          <div class="document-stats">
            <span>节点 {{ allNodes.length }}</span>
            <span>业务节点 {{ businessNodes.length }}</span>
            <span v-if="currentTimestamp">ts {{ currentTimestamp }}</span>
          </div>
        </div>

        <el-empty v-if="currentDocument === null && !opening" description="选择或新建工作流" />
        <el-skeleton v-else-if="opening" :rows="12" animated />

        <template v-else-if="currentDocument">
          <section
            v-if="currentMainGraphView"
            class="graph-split"
            :class="{
              'is-top-collapsed': graphSplitCollapsed === 'top',
              'is-bottom-collapsed': graphSplitCollapsed === 'bottom' || currentChildGraphView === null,
            }"
            :style="graphSplitStyle"
          >
            <template v-for="panel in graphSplitPanels" :key="panel.key">
              <section
                class="graph-split-pane graph-section"
                :class="[
                  `graph-split-pane--${panel.role}`,
                  { 'is-collapsed': panel.collapsed },
                ]"
              >
                <button
                  v-if="panel.collapsed"
                  type="button"
                  class="graph-collapse-rail"
                  :title="panel.role === 'main' ? 'Main graph collapsed' : 'Child graph collapsed'"
                  @click="resetGraphSplit"
                />

                <template v-else-if="panel.graphView">
                  <div class="section-label graph-panel-label">
                    <span class="section-title">{{ graphPanelTitle(panel) }}</span>
                    <span class="section-label-actions" @click.stop>
                      <select
                        v-if="panel.role === 'child' && mainChildGraphOptions.length > 1"
                        v-model="currentChildGraphKey"
                        class="native-select graph-child-select"
                        title="选择下部子图"
                      >
                        <option v-for="child in mainChildGraphOptions" :key="child.key" :value="child.key">
                          {{ child.title }}
                        </option>
                      </select>
                      <el-tag v-if="panel.graphView.carrier === 'loop'" size="small" type="warning">循环分组</el-tag>
                      <el-tag size="small" type="info">节点 {{ nodesForGraph(panel.graphView).length }}</el-tag>
                      <el-tag size="small" type="info">连线 {{ linesForGraph(panel.graphView).length }}</el-tag>
                      <el-button
                        v-if="panel.role === 'main' && currentMainParentGraphView"
                        link
                        size="small"
                        :icon="ArrowUp"
                        @click.stop.prevent="returnMainGraphToParent"
                      >
                        回父级
                      </el-button>
                      <el-button
                        v-if="panel.role === 'child'"
                        link
                        size="small"
                        :icon="ArrowDown"
                        @click.stop.prevent="promoteChildGraphToMain"
                      >
                        提升为 main
                      </el-button>
                    </span>
                  </div>

                  <div class="graph-panel-body">
                    <div
                      v-if="panel.graphView.carrier === 'loop'"
                      class="loop-group-meta"
                      role="group"
                      aria-label="循环分组配置摘要"
                    >
                      <span>owner {{ panel.graphView.ownerNodeId }}</span>
                      <span>mode {{ panel.graphView.ownerNode?.data?.loop?.mode || 'progressive' }}</span>
                      <span>max {{ panel.graphView.ownerNode?.data?.loop?.maxLoopCount ?? 1 }}</span>
                      <span>exit {{ panel.graphView.ownerNode?.data?.loop?.exitNodeId || '-' }}</span>
                    </div>

                    <div
                      v-if="selectedNodeInGraph(panel.graphView) && selectedNode?.isBusinessNode === true && selectedClassModelOption"
                      class="graph-class-model-strip"
                    >
                      <span class="class-model-pin" aria-hidden="true"></span>
                      <strong>ClassModel</strong>
                      <span class="graph-class-model-strip-badge">{{ selectedClassModelOption.kind }}</span>
                      <span class="graph-class-model-strip-badge">attributes {{ selectedClassModelOption.attributes.length }}</span>
                      <span class="graph-class-model-strip-badge">actions {{ selectedClassModelOption.methods.length }}</span>
                      <span class="graph-class-model-strip-spacer" />
                      <el-button link size="small" :icon="DocumentCopy" @click="openClassModelDrawer">
                        知识抽屉
                      </el-button>
                      <el-button
                        link
                        size="small"
                        :loading="classModelLoading"
                        :icon="Refresh"
                        @click="refreshClassModelOptions"
                      >
                        刷新
                      </el-button>
                    </div>

                    <div class="workflow-flow-shell graph-panel-flow">
                      <VueFlow
                        :id="flowId(panel.graphView)"
                        class="workflow-flow"
                        :class="{ 'workflow-flow--subgraph': panel.graphView.carrier !== 'root' }"
                        :nodes="flowNodesForGraph(panel.graphView)"
                        :edges="flowConnectionsForGraph(panel.graphView)"
                        :default-viewport="flowDefaultViewport(panel.graphView)"
                        :connection-mode="ConnectionMode.Strict"
                        :connection-line-type="ConnectionLineType.SmoothStep"
                        :default-edge-options="flowDefaultLineOptions"
                        :edges-updatable="true"
                        :delete-key-code="null"
                        :min-zoom="0.3"
                        :max-zoom="1.6"
                        @nodes-change="changes => handlePanelFlowNodesChange(changes, panel.graphView)"
                        @node-drag-stop="handleFlowNodeDragStop"
                        @edges-change="changes => handlePanelFlowLineChanges(changes, panel.graphView)"
                        @edge-double-click="event => handlePanelFlowLineDoubleClick(event, panel.graphView)"
                        @edge-update="event => handlePanelFlowLineUpdate(event, panel.graphView)"
                        @connect="connection => handlePanelFlowConnect(connection, panel.graphView)"
                        @viewport-change-end="viewport => handlePanelFlowViewportChangeEnd(viewport, panel.graphView)"
                      >
                        <Background pattern-color="#dbe3ee" :gap="24" />
                        <Controls position="bottom-left" />
                        <MiniMap pannable zoomable />

                        <template #node-workflow="{ data, selected, id }">
                          <div class="workflow-node" :class="{
                            'is-selected': selected || selectedNodeKey === data.viewKey,
                            'is-business': data.isBusinessNode,
                            'is-boundary': data.isBoundaryNode,
                            'is-loop': data.nodeType === 'loop',
                          }" @dblclick.stop="openNodeEditor(data.viewKey)">
                            <Handle v-for="dock in inputDockDefinitions" :id="`dock-${dock.id}`" :key="dock.id"
                              type="target" :position="dock.position" :style="dock.style"
                              :title="`输入接点 ${dock.id} · ${data.title}`" />
                            <Handle v-for="dock in outputDockDefinitions" :id="`dock-${dock.id}`" :key="dock.id"
                              type="source" :position="dock.position" :style="dock.style"
                              :title="`输出接点 ${dock.id} · ${data.title}`" />
                            <span class="node-kind">{{ data.nodeType }}</span>
                            <strong>{{ data.title }}</strong>
                            <small>{{ data.scopePath }} / {{ id }}</small>
                            <span v-if="data.isBusinessNode" class="tool-name tool-name--pinned">
                              <span class="class-model-pin" aria-hidden="true"></span>
                              <span>{{ data.modelClassName }}</span>
                            </span>
                            <small v-if="data.modelDocText" class="node-jsdoc">{{ data.modelDocText }}</small>
                            <span v-if="data.validationActionName" class="tool-name tool-name--pinned">
                              <span class="class-model-pin" aria-hidden="true"></span>
                              <span>{{ data.validationActionName }}</span>
                            </span>
                            <small v-if="data.validationActionDocText" class="node-jsdoc">{{ data.validationActionDocText }}</small>
                          </div>
                        </template>

                        <template #edge-workflow-control="edge">
                          <g
                            class="workflow-control-edge"
                            :class="`is-${edge.data.runtimeStatus}`"
                            @dblclick.stop="addLineControlPoint($event, edge.data, panel.graphView)"
                          >
                            <BaseEdge
                              :id="edge.id"
                              :path="workflowControlEdgePath(edge)"
                              :marker-end="edge.markerEnd"
                              :style="edge.style"
                            />
                            <circle
                              v-for="(point, index) in edge.data.controlPoints"
                              :key="index"
                              class="workflow-edge-control-point"
                              :class="{ 'is-selected': isSelectedControlPoint(edge.data.lineKey, index) }"
                              :cx="point.x"
                              :cy="point.y"
                              r="6"
                              @pointerdown.stop.prevent="startControlPointDrag({ event: $event, data: edge.data, index, graphView: panel.graphView })"
                              @click.stop="selectControlPoint(edge.data.lineKey, index)"
                              @dblclick.stop.prevent="deleteLineControlPoint(edge.data.lineKey, index)"
                            />
                            <text
                              v-if="edge.data.runtimeStatus !== 'idle'"
                              class="workflow-edge-status-icon"
                              :x="workflowEdgeStatusPoint(edge).x"
                              :y="workflowEdgeStatusPoint(edge).y"
                            >{{ workflowRuntimeStatusIcon(edge.data.runtimeStatus) }}</text>
                          </g>
                        </template>
                      </VueFlow>
                    </div>
                  </div>
                </template>
              </section>

              <div
                v-if="panel.role === 'main'"
                class="graph-splitter"
                title="Resize graph split"
                role="separator"
                aria-orientation="horizontal"
                @pointerdown.prevent="startGraphSplitResize"
              >
                <span class="graph-splitter-line" />
                <span class="graph-splitter-actions" @pointerdown.stop>
                  <el-button
                    link
                    size="small"
                    :icon="ArrowUp"
                    :disabled="currentChildGraphView === null"
                    @click.stop.prevent="collapseGraphSplit('top')"
                  >
                    上折
                  </el-button>
                  <el-button link size="small" :icon="RefreshLeft" @click.stop.prevent="resetGraphSplit">
                    复位
                  </el-button>
                  <el-button link size="small" :icon="ArrowDown" @click.stop.prevent="collapseGraphSplit('bottom')">
                    下折
                  </el-button>
                </span>
                <span class="graph-splitter-line" />
              </div>
            </template>
          </section>
        </template>
      </main>

      <div
        class="layout-resize-handle"
        title="Resize properties"
        role="separator"
        aria-orientation="vertical"
        @pointerdown.prevent="startLayoutResize($event, 'right')"
      />

      <aside class="workflow-design-editor workflow-tool-sidebar">
        <div class="panel-heading">
          <span>工具栏</span>
          <el-tag v-if="selectedLine" size="small" type="warning">连线</el-tag>
          <el-tag
            v-else-if="selectedNode"
            size="small"
            :type="selectedNode.isBusinessNode ? 'success' : selectedNode.isBoundaryNode ? 'info' : 'warning'"
          >
            {{ selectedNode.nodeType }}
          </el-tag>
        </div>

        <section class="workflow-tool-group workflow-tool-group--actions">
          <h3>流程级</h3>
          <div class="workflow-tool-button-grid">
            <el-button :icon="Refresh" :loading="loadingList" @click="loadDesigns">刷新</el-button>
            <el-button type="primary" :icon="DocumentAdd" @click="openCreateDialog">新建</el-button>
            <el-button :icon="DocumentCopy" :disabled="currentDocument === null" @click="openWorkflowPropertiesDrawer">
              流程属性
            </el-button>
            <el-button :icon="DocumentCopy" :disabled="currentDocument === null" @click="copyJson">复制 JSON</el-button>
            <el-button
              :icon="RefreshLeft"
              :loading="autoLayoutSaving"
              :disabled="!canAutoLayout"
              @click="autoLayoutCurrentDesign"
            >
              自动排版
            </el-button>
            <el-button :icon="DocumentCopy" :loading="openingDefinition" :disabled="!canOpenDefinition" @click="openDefinitionEditor">
              Definition
            </el-button>
            <el-button type="success" :icon="Upload" :loading="saving" :disabled="!canSave" @click="saveCurrentDesign">
              保存
            </el-button>
            <el-button type="primary" :icon="Upload" :loading="publishing" :disabled="!canPublish" @click="publishCurrentDefinition">
              发布
            </el-button>
          </div>
        </section>

        <section class="workflow-tool-group">
          <h3>节点级</h3>
          <div v-if="selectedNode" class="workflow-tool-selection">
            <strong>{{ selectedNode.title }}</strong>
            <span>{{ selectedNode.id }}</span>
            <span>{{ selectedNode.scopePath }}</span>
          </div>
          <div v-else class="workflow-tool-empty">未选择节点</div>
          <el-button
            :icon="DocumentAdd"
            :disabled="currentMainGraphView === null"
            @click="openNodeCreateDialogForCurrentGraph"
          >
            Add business node
          </el-button>
          <el-button :icon="DocumentCopy" :disabled="selectedNode === null" @click="openPropertiesDrawer">
            打开属性
          </el-button>
          <el-button type="danger" :icon="Delete" :disabled="selectedNode === null" @click="deleteSelectedNode">
            删除节点
          </el-button>
        </section>

        <section class="workflow-tool-group">
          <h3>连线级</h3>
          <div v-if="selectedLine" class="workflow-tool-selection">
            <strong>{{ selectedLine.id }}</strong>
            <span>{{ selectedLine.fromNodeId }} -> {{ selectedLine.toNodeId }}</span>
            <span>{{ selectedLine.scopePath }}</span>
          </div>
          <div v-else class="workflow-tool-empty">未选择连线</div>
          <label v-if="selectedLine" class="workflow-line-type-field">
            <span>线型</span>
            <select v-model="lineVisualTypeText" class="native-select line-visual-type-select" @change="applySelectedLineVisualType">
              <option value="orthogonal">正交</option>
              <option value="straight">直线</option>
              <option value="bezier">曲线</option>
            </select>
          </label>
          <el-button :disabled="selectedLine === null || selectedLineControlPointCount === 0" @click="clearSelectedLineControlPoints">
            清空控制点
          </el-button>
          <el-button :icon="DocumentCopy" :disabled="selectedLine === null" @click="openPropertiesDrawer">
            打开属性
          </el-button>
          <el-button type="danger" :icon="Delete" :disabled="selectedLine === null" @click="deleteSelectedLine">
            删除连线
          </el-button>
        </section>

        <template v-if="selectedLine !== null && false">
          <details class="editor-section collapsible-section" open>
            <summary>连线信息</summary>
            <div class="collapsible-body">
              <el-descriptions :column="1" size="small" border>
                <el-descriptions-item label="ID">{{ selectedLine?.id }}</el-descriptions-item>
                <el-descriptions-item label="Scope">{{ selectedLine?.scopePath }}</el-descriptions-item>
                <el-descriptions-item label="From">{{ selectedLine?.fromNodeId }}</el-descriptions-item>
                <el-descriptions-item label="To">{{ selectedLine?.toNodeId }}</el-descriptions-item>
              </el-descriptions>
            </div>
          </details>

          <details class="editor-section collapsible-section" open>
            <summary>连线编辑</summary>
            <div class="collapsible-body">
              <el-form label-position="top">
                <el-form-item label="From Node">
                  <select v-model="lineFromNodeText" class="native-select" @change="markEditorDirty">
                    <option v-for="node in selectedLineGraphNodes" :key="node.key" :value="node.id">
                      {{ node.title }} / {{ node.id }}
                    </option>
                  </select>
                </el-form-item>
                <el-row :gutter="8">
                  <el-col :span="12">
                    <el-form-item label="From Model">
                      <el-input v-model="lineFromModelText" @input="markEditorDirty" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="From Member">
                      <el-input v-model="lineFromMemberText" @input="markEditorDirty" />
                    </el-form-item>
                  </el-col>
                </el-row>
                <el-form-item label="To Node">
                  <select v-model="lineToNodeText" class="native-select" @change="markEditorDirty">
                    <option v-for="node in selectedLineGraphNodes" :key="node.key" :value="node.id">
                      {{ node.title }} / {{ node.id }}
                    </option>
                  </select>
                </el-form-item>
                <el-row :gutter="8">
                  <el-col :span="12">
                    <el-form-item label="To Model">
                      <el-input v-model="lineToModelText" @input="markEditorDirty" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="To Member">
                      <el-input v-model="lineToMemberText" @input="markEditorDirty" />
                    </el-form-item>
                  </el-col>
                </el-row>
                <el-row :gutter="8">
                  <el-col :span="12">
                    <el-form-item label="Type">
                      <el-input v-model="lineTypeText" @input="markEditorDirty" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="Relation">
                      <el-input v-model="lineRelationText" @input="markEditorDirty" />
                    </el-form-item>
                  </el-col>
                </el-row>
                <el-row :gutter="8">
                  <el-col :span="12">
                    <el-form-item label="From Dock">
                      <el-input v-model="lineFromDockText" @input="markEditorDirty" />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="To Dock">
                      <el-input v-model="lineToDockText" @input="markEditorDirty" />
                    </el-form-item>
                  </el-col>
                </el-row>
              </el-form>
              <div class="editor-actions" style="justify-content: space-between">
                <el-button :icon="CircleCheck" @click="applyLineEditorToSelected">应用连线</el-button>
                <el-button type="danger" :icon="Delete" @click="deleteSelectedLine">删除连线</el-button>
              </div>
            </div>
          </details>
        </template>

        <template v-if="selectedNode !== null && false">
          <details class="editor-section collapsible-section" open>
            <summary>节点信息</summary>
            <div class="collapsible-body">
                <el-descriptions :column="1" size="small" border>
                  <el-descriptions-item label="ID">{{ selectedNode?.id }}</el-descriptions-item>
                  <el-descriptions-item label="Scope">{{ selectedNode?.scopePath }}</el-descriptions-item>
              </el-descriptions>
            </div>
          </details>

          <details class="editor-section collapsible-section" open>
            <summary>基础编辑</summary>
            <div class="collapsible-body">
              <el-form label-position="top">
                <el-form-item label="Type">
                  <el-input v-model="nodeTypeText" @input="markEditorDirty" />
                </el-form-item>
                <el-form-item label="标题">
                  <el-input v-model="nodeTitleText" @input="markEditorDirty" />
                </el-form-item>
                <el-form-item label="描述">
                  <el-input v-model="nodeDescText" type="textarea" :rows="2" @input="markEditorDirty" />
                </el-form-item>
              </el-form>
              <div class="editor-actions">
                <el-button :icon="CircleCheck" @click="applySelectedDraft">应用节点</el-button>
              </div>
            </div>
          </details>

          <details v-if="selectedNode?.nodeType === 'loop'" class="editor-section collapsible-section" open>
            <summary>循环分组</summary>
            <div class="collapsible-body loop-editor-form">
              <el-form label-position="top">
                <el-form-item label="Mode">
                  <el-input v-model="loopModeText" @input="markEditorDirty" />
                </el-form-item>
                <el-row :gutter="8">
                  <el-col :span="12">
                    <el-form-item label="Max Loop Count">
                      <el-input-number
                        v-model="loopMaxCountValue"
                        :min="1"
                        :step="1"
                        controls-position="right"
                        @change="markEditorDirty"
                      />
                    </el-form-item>
                  </el-col>
                  <el-col :span="12">
                    <el-form-item label="Exit Node">
                      <el-input v-model="loopExitNodeText" @input="markEditorDirty" />
                    </el-form-item>
                  </el-col>
                </el-row>
              </el-form>
              <div class="editor-actions">
                <el-button :icon="CircleCheck" @click="applyLoopEditorToSelected">应用循环配置</el-button>
              </div>
            </div>
          </details>

          <details
            v-if="selectedNode?.isBusinessNode === true"
            class="editor-section collapsible-section"
            open
          >
            <summary>ClassModel</summary>
            <div class="collapsible-body class-model-editor">
              <el-form label-position="top">
                <el-form-item label="Root Class">
                  <el-input v-model="modelRootClassText" @input="markEditorDirty" />
                </el-form-item>
                <el-form-item label="Model Class">
                  <select v-model="modelClassText" class="native-select" @change="handleModelClassSelectionChange">
                    <option :value="modelClassText">{{ modelClassText || 'unbound' }}</option>
                    <option v-for="item in classModelOptions" :key="item.kind" :value="item.kind">
                      {{ item.kind }}
                    </option>
                  </select>
                </el-form-item>
                <el-form-item label="Completion Class">
                  <el-input v-model="validationActionClassText" @input="markEditorDirty" />
                </el-form-item>
                <el-form-item label="Completion Member">
                  <select v-model="validationActionNameText" class="native-select" @change="markEditorDirty">
                    <option :value="validationActionNameText">{{ validationActionNameText || 'unbound' }}</option>
                    <option v-for="method in selectedClassModelMethods" :key="method.name" :value="method.name">
                      {{ method.name }}
                    </option>
                  </select>
                </el-form-item>
              </el-form>
              <el-alert v-if="classModelError" :title="classModelError" type="error" :closable="false" />
              <div v-if="selectedClassModelOption" class="class-model-catalog">
                <strong>{{ selectedClassModelOption?.kind }}</strong>
                <span>attributes {{ selectedClassModelOption?.attributes.length }}</span>
                <span>actions {{ selectedClassModelOption?.methods.length }}</span>
              </div>
              <pre v-if="classModelGuideText" class="class-model-guide">{{ classModelGuideText }}</pre>
              <div class="editor-actions">
                <el-button :loading="classModelLoading" :icon="Refresh" @click="refreshClassModelOptions">
                  刷新知识
                </el-button>
                <el-button :loading="classModelLoading" :icon="DocumentCopy" @click="loadValidationActionGuide">
                  Action Guide
                </el-button>
                <el-button :icon="CircleCheck" @click="applyBusinessModelEditorToSelected">
                  应用模型绑定
                </el-button>
              </div>
            </div>
          </details>

        </template>
      </aside>
    </div>

    <el-drawer
      v-model="propertiesDrawerVisible"
      class="properties-drawer"
      direction="rtl"
      :size="'33vw'"
      :title="propertiesDrawerTitle"
    >
      <template v-if="propertiesDrawerTarget === 'workflow' && currentDocument">
        <details class="editor-section collapsible-section" open>
          <summary>流程信息</summary>
          <div class="collapsible-body">
            <el-descriptions :column="1" size="small" border>
              <el-descriptions-item label="Design ID">{{ currentDocument.id }}</el-descriptions-item>
              <el-descriptions-item label="Workflow ID">{{ currentDocument.workflow.id }}</el-descriptions-item>
              <el-descriptions-item label="Kind">{{ currentDocument.kind }}</el-descriptions-item>
              <el-descriptions-item label="Design Version">{{ currentDocument.version }}</el-descriptions-item>
              <el-descriptions-item label="Workflow Version">{{ currentDocument.workflow.version }}</el-descriptions-item>
              <el-descriptions-item v-for="row in workflowPrimaryMetadataRows" :key="row.label" :label="row.label">
                {{ row.value }}
              </el-descriptions-item>
            </el-descriptions>
          </div>
        </details>

        <details class="editor-section collapsible-section" open>
          <summary>基础编辑</summary>
          <div class="collapsible-body">
            <el-form label-position="top">
              <el-form-item label="中文标题">
                <el-input v-model="workflowDesignerTitleText" class="workflow-title-input" @input="handleWorkflowEditorChange" />
              </el-form-item>
              <el-form-item label="Workflow Version">
                <el-input-number v-model="workflowVersionValue" :min="1" :step="1" controls-position="right" @change="handleWorkflowEditorChange" />
              </el-form-item>
            </el-form>
          </div>
        </details>

        <details class="editor-section collapsible-section" open>
          <summary>变量</summary>
          <div class="collapsible-body workflow-variable-editor">
            <div class="workflow-variable-header">
              <span>变量名</span>
              <span>短标题</span>
              <span>类型</span>
              <span>必填</span>
              <span>默认值</span>
              <span>操作</span>
            </div>
            <div v-for="row in workflowVariableRows" :key="row.id" class="workflow-variable-row">
              <el-input v-model="row.name" placeholder="name" @input="handleWorkflowEditorChange" />
              <el-input v-model="row.title" placeholder="title" @input="handleWorkflowEditorChange" />
              <select v-model="row.schemaType" class="native-select" @change="handleWorkflowEditorChange">
                <option value="string">string</option>
                <option value="number">number</option>
                <option value="integer">integer</option>
                <option value="boolean">boolean</option>
                <option value="object">object</option>
                <option value="array">array</option>
              </select>
              <label class="workflow-checkbox-label">
                <input v-model="row.required" type="checkbox" @change="handleWorkflowEditorChange">
                必填
              </label>
              <el-input
                v-if="row.defaultValueEditable"
                v-model="row.defaultValueText"
                placeholder="default"
                @input="handleWorkflowEditorChange"
              />
              <span v-else class="workflow-readonly-value">{{ metadataValueText(row.defaultValue) }}</span>
              <el-button link type="danger" :icon="Delete" @click="removeWorkflowVariableRow(row)">删除</el-button>
              <div v-if="workflowVariableDocText(row)" class="workflow-doc-reference">
                <span class="class-model-pin" aria-hidden="true"></span>
                <strong>用途</strong>
                <span>{{ workflowVariableDocText(row) }}</span>
              </div>
            </div>
            <el-button :icon="DocumentAdd" @click="addWorkflowVariableRow">添加变量</el-button>
          </div>
        </details>

        <details class="editor-section collapsible-section" open>
          <summary>运行绑定</summary>
          <div class="collapsible-body workflow-runtime-editor">
            <strong>Registration</strong>
            <el-row :gutter="8">
              <el-col :span="8">
                <el-form-item label="Alias">
                  <el-input v-model="workflowRuntimeAliasText" @input="handleWorkflowEditorChange" />
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item label="Module ID">
                  <el-input v-model="workflowRuntimeModuleIdText" @input="handleWorkflowEditorChange" />
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item label="Business ID">
                  <el-input v-model="workflowRuntimeBusinessIdText" @input="handleWorkflowEditorChange" />
                </el-form-item>
              </el-col>
            </el-row>

            <strong>Input Contract</strong>
            <el-row :gutter="8">
              <el-col :span="12">
                <el-form-item label="Identity Field">
                  <select v-model="workflowIdentityFieldText" class="native-select" @change="handleWorkflowEditorChange">
                    <option v-for="option in workflowVariableEditorNames" :key="option" :value="option">{{ option }}</option>
                  </select>
                </el-form-item>
                <div v-if="workflowVariableDocTextByName(workflowIdentityFieldText)" class="workflow-doc-reference">
                  <span class="class-model-pin" aria-hidden="true"></span>
                  <strong>用途</strong>
                  <span>{{ workflowVariableDocTextByName(workflowIdentityFieldText) }}</span>
                </div>
              </el-col>
              <el-col :span="12">
                <el-form-item label="Message Field">
                  <select v-model="workflowMessageFieldText" class="native-select" @change="handleWorkflowEditorChange">
                    <option v-for="option in workflowVariableEditorNames" :key="option" :value="option">{{ option }}</option>
                  </select>
                </el-form-item>
                <div v-if="workflowVariableDocTextByName(workflowMessageFieldText)" class="workflow-doc-reference">
                  <span class="class-model-pin" aria-hidden="true"></span>
                  <strong>用途</strong>
                  <span>{{ workflowVariableDocTextByName(workflowMessageFieldText) }}</span>
                </div>
              </el-col>
            </el-row>
            <div class="workflow-string-list">
              <span>Readonly Steps</span>
              <div v-for="card in workflowReadonlyStepCards" :key="card.id" class="workflow-string-row">
                <el-input v-model="card.value" @input="handleWorkflowEditorChange" />
                <el-button link type="danger" :icon="Delete" @click="removeWorkflowStringCard(workflowReadonlyStepCards, card)">删除</el-button>
              </div>
              <el-button :icon="DocumentAdd" @click="addWorkflowStringCard(workflowReadonlyStepCards, 'workflow.readonlyStep')">添加只读步骤</el-button>
            </div>

            <strong>Model Projection</strong>
            <el-row :gutter="8">
              <el-col :span="8">
                <el-form-item label="Kind">
                  <select v-model="workflowModelProjectionKindText" class="native-select" @change="handleWorkflowEditorChange">
                    <option value="dts-class-model">dts-class-model</option>
                  </select>
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item label="Root Class">
                  <select v-model="workflowRootClassText" class="native-select" @change="handleWorkflowRootClassChange">
                    <option v-for="option in rootClassOptions" :key="option" :value="option">{{ option }}</option>
                  </select>
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item label="Manifest Ref">
                  <el-input v-model="workflowManifestUrlRefText" @input="handleWorkflowEditorChange" />
                </el-form-item>
              </el-col>
            </el-row>
            <div v-if="workflowRootClassDocText" class="workflow-doc-reference">
              <span class="class-model-pin" aria-hidden="true"></span>
              <strong>用途</strong>
              <span>{{ workflowRootClassDocText }}</span>
            </div>
            <div class="workflow-inline-actions">
              <el-button :loading="classModelLoading" :icon="Refresh" @click="refreshWorkflowClassModelOptions">
                刷新知识
              </el-button>
              <el-button :icon="DocumentCopy" :disabled="workflowRootClassModelOption === null" @click="openClassModelDrawer">
                知识抽屉
              </el-button>
            </div>

            <strong>Executable</strong>
            <el-row :gutter="8">
              <el-col :span="8">
                <el-form-item label="Kind">
                  <select v-model="workflowExecutableKindText" class="native-select" @change="handleWorkflowEditorChange">
                    <option value="js-module">js-module</option>
                  </select>
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item label="Module Specifier">
                  <el-input v-model="workflowExecutableModuleSpecifierText" @input="handleWorkflowEditorChange" />
                </el-form-item>
              </el-col>
              <el-col :span="8">
                <el-form-item label="Export Name">
                  <el-input v-model="workflowExecutableExportNameText" @input="handleWorkflowEditorChange" />
                </el-form-item>
              </el-col>
            </el-row>

            <strong>Resolve Instance</strong>
            <el-row :gutter="8">
              <el-col :span="12">
                <el-form-item label="Editor Source">
                  <el-input v-model="workflowResolveEditorSourceText" @input="handleWorkflowEditorChange" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="Identity Field">
                  <select v-model="workflowResolveIdentityFieldText" class="native-select" @change="handleWorkflowEditorChange">
                    <option v-for="option in workflowVariableEditorNames" :key="option" :value="option">{{ option }}</option>
                  </select>
                </el-form-item>
                <div v-if="workflowVariableDocTextByName(workflowResolveIdentityFieldText)" class="workflow-doc-reference">
                  <span class="class-model-pin" aria-hidden="true"></span>
                  <strong>用途</strong>
                  <span>{{ workflowVariableDocTextByName(workflowResolveIdentityFieldText) }}</span>
                </div>
              </el-col>
            </el-row>

            <strong>Prompt and Tools</strong>
            <el-form label-position="top">
              <el-form-item label="System Prompt Template">
                <el-input v-model="workflowSystemPromptTemplateText" type="textarea" :rows="3" @input="handleWorkflowEditorChange" />
              </el-form-item>
              <el-form-item label="Agent Complete Method">
                <select v-model="workflowAgentCompleteMethodText" class="native-select" @change="handleWorkflowEditorChange">
                  <option v-for="option in workflowMethodOptions" :key="option" :value="option">{{ option }}</option>
                </select>
              </el-form-item>
            </el-form>
            <div v-if="workflowAgentCompleteMethodDocText" class="workflow-doc-reference">
              <span class="class-model-pin" aria-hidden="true"></span>
              <strong>用途</strong>
              <span>{{ workflowAgentCompleteMethodDocText }}</span>
            </div>
            <div class="workflow-string-list">
              <span>Execution Tools</span>
              <div v-for="card in workflowExecutionToolCards" :key="card.id" class="workflow-string-row">
                <el-input v-model="card.value" @input="handleWorkflowEditorChange" />
                <el-button link type="danger" :icon="Delete" @click="removeWorkflowStringCard(workflowExecutionToolCards, card)">删除</el-button>
              </div>
              <el-button :icon="DocumentAdd" @click="addWorkflowStringCard(workflowExecutionToolCards, 'workflow.executionTool')">添加工具</el-button>
            </div>
            <div class="workflow-string-list">
              <span>Plan Without Tool Markers</span>
              <div v-for="card in workflowPlanMarkerCards" :key="card.id" class="workflow-string-row">
                <el-input v-model="card.value" @input="handleWorkflowEditorChange" />
                <el-button link type="danger" :icon="Delete" @click="removeWorkflowStringCard(workflowPlanMarkerCards, card)">删除</el-button>
              </div>
              <el-button :icon="DocumentAdd" @click="addWorkflowStringCard(workflowPlanMarkerCards, 'workflow.planMarker')">添加标记</el-button>
            </div>
          </div>
        </details>

        <details class="editor-section collapsible-section" open>
          <summary>流程能力</summary>
          <div class="collapsible-body workflow-capability-editor">
            <details v-for="card in workflowCapabilityCards" :key="card.id" class="structured-card" open>
              <summary>{{ card.title || card.id }}</summary>
              <el-form label-position="top">
                <el-form-item label="ID">
                  <el-input v-model="card.id" @input="handleWorkflowEditorChange" />
                </el-form-item>
                <el-form-item label="Title">
                  <el-input v-model="card.title" @input="handleWorkflowEditorChange" />
                </el-form-item>
                <el-form-item label="Scope">
                  <select v-model="card.scope" class="native-select" @change="handleWorkflowEditorChange">
                    <option value="workflow">workflow</option>
                    <option value="node">node</option>
                  </select>
                </el-form-item>
                <el-form-item label="Description">
                  <el-input v-model="card.description" type="textarea" :rows="2" @input="handleWorkflowEditorChange" />
                </el-form-item>
              </el-form>
              <strong>Inputs</strong>
              <div v-for="row in card.inputRows" :key="row.id" class="structured-field-row structured-field-row--compact">
                <el-input v-model="row.path" placeholder="path" @input="handleWorkflowEditorChange" />
                <select v-model="row.valueKind" class="native-select" @change="handleWorkflowEditorChange">
                  <option value="reference">引用</option>
                  <option value="text">文本</option>
                  <option value="number">数字</option>
                  <option value="boolean">布尔</option>
                </select>
                <el-input v-model="row.valueText" placeholder="value" @input="handleWorkflowEditorChange" />
                <el-button link type="danger" :icon="Delete" @click="removeWorkflowStructuredFieldRow(card.inputRows, row)">删除</el-button>
                <div v-if="workflowStructuredRowDocText(row)" class="workflow-doc-reference structured-field-doc-reference">
                  <span class="class-model-pin" aria-hidden="true"></span>
                  <strong>用途</strong>
                  <span>{{ workflowStructuredRowDocText(row) }}</span>
                </div>
              </div>
              <el-button :icon="DocumentAdd" @click="addWorkflowStructuredFieldRow(card.inputRows, 'workflow.capability.input')">添加输入</el-button>
              <strong>Outputs</strong>
              <div v-for="row in card.outputRows" :key="row.id" class="structured-field-row structured-field-row--compact">
                <el-input v-model="row.path" placeholder="path" @input="handleWorkflowEditorChange" />
                <select v-model="row.valueKind" class="native-select" @change="handleWorkflowEditorChange">
                  <option value="reference">引用</option>
                  <option value="text">文本</option>
                  <option value="number">数字</option>
                  <option value="boolean">布尔</option>
                </select>
                <el-input v-model="row.valueText" placeholder="value" @input="handleWorkflowEditorChange" />
                <el-button link type="danger" :icon="Delete" @click="removeWorkflowStructuredFieldRow(card.outputRows, row)">删除</el-button>
                <div v-if="workflowStructuredRowDocText(row)" class="workflow-doc-reference structured-field-doc-reference">
                  <span class="class-model-pin" aria-hidden="true"></span>
                  <strong>用途</strong>
                  <span>{{ workflowStructuredRowDocText(row) }}</span>
                </div>
              </div>
              <el-button :icon="DocumentAdd" @click="addWorkflowStructuredFieldRow(card.outputRows, 'workflow.capability.output')">添加输出</el-button>
              <strong>Constraints</strong>
              <div v-for="constraint in card.constraintCards" :key="constraint.id" class="workflow-string-row">
                <el-input v-model="constraint.value" @input="handleWorkflowEditorChange" />
                <el-button link type="danger" :icon="Delete" @click="removeWorkflowStringCard(card.constraintCards, constraint)">删除</el-button>
              </div>
              <el-button :icon="DocumentAdd" @click="addWorkflowStringCard(card.constraintCards, 'workflow.capability.constraint')">添加约束</el-button>
              <el-button link type="danger" :icon="Delete" @click="removeWorkflowCapabilityCard(card)">删除能力</el-button>
            </details>
            <el-button :icon="DocumentAdd" @click="addWorkflowCapabilityCard">添加流程能力</el-button>
          </div>
        </details>

        <details class="editor-section collapsible-section">
          <summary>全量元信息只读</summary>
          <div class="collapsible-body workflow-metadata-table">
            <div v-for="row in workflowFullMetadataRows" :key="row.label" class="workflow-metadata-row">
              <span>{{ row.label }}</span>
              <strong>{{ row.value }}</strong>
            </div>
          </div>
        </details>

        <div class="editor-actions">
          <el-button :icon="CircleCheck" @click="applyWorkflowEditorToCurrent">应用流程</el-button>
        </div>
      </template>

      <template v-else-if="propertiesDrawerTarget === 'line' && selectedLine">
        <details class="editor-section collapsible-section" open>
          <summary>连线信息</summary>
          <div class="collapsible-body">
            <el-descriptions :column="1" size="small" border>
              <el-descriptions-item label="ID">{{ selectedLine.id }}</el-descriptions-item>
              <el-descriptions-item label="Scope">{{ selectedLine.scopePath }}</el-descriptions-item>
              <el-descriptions-item label="From">{{ selectedLine.fromNodeId }}</el-descriptions-item>
              <el-descriptions-item label="To">{{ selectedLine.toNodeId }}</el-descriptions-item>
            </el-descriptions>
          </div>
        </details>

        <details class="editor-section collapsible-section" open>
          <summary>连线编辑</summary>
          <div class="collapsible-body">
            <el-form label-position="top">
              <el-form-item label="From Node">
                <select v-model="lineFromNodeText" class="native-select" @change="handleLineEditorChange">
                  <option v-for="node in selectedLineGraphNodes" :key="node.key" :value="node.id">
                    {{ node.title }} / {{ node.id }}
                  </option>
                </select>
              </el-form-item>
              <el-row :gutter="8">
                <el-col :span="12">
                  <el-form-item label="From Model">
                    <span class="field-with-doc">
                      <select v-model="lineFromModelText" class="native-select" @change="handleLineEditorChange">
                        <option
                          v-for="option in lineModelOptions(lineFromNodeText, lineFromModelText)"
                          :key="option"
                          :value="option"
                        >
                          {{ option }}
                        </option>
                      </select>
                      <button v-if="lineFromModelDocText" type="button" class="doc-hint" :title="lineFromModelDocText" :aria-label="lineFromModelDocText">
                        <el-icon><QuestionFilled /></el-icon>
                        <span class="doc-hint-popover" role="tooltip">{{ lineFromModelDocText }}</span>
                      </button>
                    </span>
                  </el-form-item>
                </el-col>
                <el-col :span="12">
                  <el-form-item label="From Member">
                    <span class="field-with-doc">
                      <select v-model="lineFromMemberText" class="native-select" @change="handleLineEditorChange">
                        <option
                          v-for="option in lineMemberOptions(lineFromNodeText, lineFromMemberText)"
                          :key="option"
                          :value="option"
                        >
                          {{ option }}
                        </option>
                      </select>
                      <button v-if="lineFromMemberDocText" type="button" class="doc-hint" :title="lineFromMemberDocText" :aria-label="lineFromMemberDocText">
                        <el-icon><QuestionFilled /></el-icon>
                        <span class="doc-hint-popover" role="tooltip">{{ lineFromMemberDocText }}</span>
                      </button>
                    </span>
                  </el-form-item>
                </el-col>
              </el-row>
              <el-form-item label="To Node">
                <select v-model="lineToNodeText" class="native-select line-to-node-select" @change="handleLineEditorChange">
                  <option v-for="node in selectedLineGraphNodes" :key="node.key" :value="node.id">
                    {{ node.title }} / {{ node.id }}
                  </option>
                </select>
              </el-form-item>
              <el-row :gutter="8">
                <el-col :span="12">
                  <el-form-item label="To Model">
                    <span class="field-with-doc">
                      <select v-model="lineToModelText" class="native-select" @change="handleLineEditorChange">
                        <option
                          v-for="option in lineModelOptions(lineToNodeText, lineToModelText)"
                          :key="option"
                          :value="option"
                        >
                          {{ option }}
                        </option>
                      </select>
                      <button v-if="lineToModelDocText" type="button" class="doc-hint" :title="lineToModelDocText" :aria-label="lineToModelDocText">
                        <el-icon><QuestionFilled /></el-icon>
                        <span class="doc-hint-popover" role="tooltip">{{ lineToModelDocText }}</span>
                      </button>
                    </span>
                  </el-form-item>
                </el-col>
                <el-col :span="12">
                  <el-form-item label="To Member">
                    <span class="field-with-doc">
                      <select v-model="lineToMemberText" class="native-select" @change="handleLineEditorChange">
                        <option
                          v-for="option in lineMemberOptions(lineToNodeText, lineToMemberText)"
                          :key="option"
                          :value="option"
                        >
                          {{ option }}
                        </option>
                      </select>
                      <button v-if="lineToMemberDocText" type="button" class="doc-hint" :title="lineToMemberDocText" :aria-label="lineToMemberDocText">
                        <el-icon><QuestionFilled /></el-icon>
                        <span class="doc-hint-popover" role="tooltip">{{ lineToMemberDocText }}</span>
                      </button>
                    </span>
                  </el-form-item>
                </el-col>
              </el-row>
              <el-row :gutter="8">
                <el-col :span="12">
                  <el-form-item label="Type">
                    <el-input v-model="lineTypeText" @input="handleLineEditorChange" />
                  </el-form-item>
                </el-col>
                <el-col :span="12">
                  <el-form-item label="Relation">
                    <el-input v-model="lineRelationText" @input="handleLineEditorChange" />
                  </el-form-item>
                </el-col>
              </el-row>
            </el-form>
            <div class="editor-actions" style="justify-content: space-between">
              <el-button type="danger" :icon="Delete" @click="deleteSelectedLine">删除连线</el-button>
            </div>
          </div>
        </details>
      </template>

      <template v-else-if="propertiesDrawerTarget === 'node' && selectedNode">
        <details class="editor-section collapsible-section" open>
          <summary>节点信息</summary>
          <div class="collapsible-body">
            <el-descriptions :column="1" size="small" border>
              <el-descriptions-item label="ID">{{ selectedNode.id }}</el-descriptions-item>
              <el-descriptions-item label="Scope">{{ selectedNode.scopePath }}</el-descriptions-item>
            </el-descriptions>
          </div>
        </details>

        <details class="editor-section collapsible-section" open>
          <summary>基础编辑</summary>
          <div class="collapsible-body">
            <el-form label-position="top">
              <el-form-item label="Type">
                <el-input v-model="nodeTypeText" @input="markEditorDirty" />
              </el-form-item>
              <el-form-item label="标题">
                <el-input v-model="nodeTitleText" @input="markEditorDirty" />
              </el-form-item>
              <el-form-item label="描述">
                <el-input v-model="nodeDescText" type="textarea" :rows="2" @input="markEditorDirty" />
              </el-form-item>
            </el-form>
            <div class="editor-actions">
              <el-button :icon="CircleCheck" @click="applySelectedDraft">应用节点</el-button>
            </div>
            </div>
          </details>

        <details v-if="selectedNode.nodeType === 'loop'" class="editor-section collapsible-section" open>
          <summary>循环分组</summary>
          <div class="collapsible-body loop-editor-form">
            <el-form label-position="top">
              <el-form-item label="Mode">
                <el-input v-model="loopModeText" @input="markEditorDirty" />
              </el-form-item>
              <el-form-item label="Exit Node">
                <select v-model="loopExitNodeText" class="native-select" @change="markEditorDirty">
                  <option v-for="node in selectedLineGraphNodes" :key="node.key" :value="node.id">
                    {{ node.title }} / {{ node.id }}
                  </option>
                </select>
              </el-form-item>
            </el-form>
          </div>
        </details>

        <template v-if="selectedNode.isBusinessNode">
          <details class="editor-section collapsible-section" open>
            <summary>ClassModel</summary>
            <div class="collapsible-body class-model-editor">
              <el-form label-position="top">
                <el-form-item label="Root Class">
                  <span class="field-with-doc">
                    <select v-model="modelRootClassText" class="native-select" @change="handleBusinessNodeStructuredChange">
                      <option v-for="option in rootClassOptions" :key="option" :value="option">{{ option }}</option>
                    </select>
                    <button v-if="modelRootClassDocText" type="button" class="doc-hint" :title="modelRootClassDocText" :aria-label="modelRootClassDocText">
                      <el-icon><QuestionFilled /></el-icon>
                      <span class="doc-hint-popover" role="tooltip">{{ modelRootClassDocText }}</span>
                    </button>
                  </span>
                </el-form-item>
                <el-form-item label="Model Class">
                  <span class="field-with-doc">
                    <select v-model="modelClassText" class="native-select" @change="handleModelClassSelectionChange">
                      <option v-for="option in modelClassOptions" :key="option" :value="option">{{ option }}</option>
                    </select>
                    <button v-if="modelClassDocText" type="button" class="doc-hint" :title="modelClassDocText" :aria-label="modelClassDocText">
                      <el-icon><QuestionFilled /></el-icon>
                      <span class="doc-hint-popover" role="tooltip">{{ modelClassDocText }}</span>
                    </button>
                  </span>
                </el-form-item>
                <el-form-item label="Completion Class">
                  <span class="field-with-doc">
                    <select
                      v-model="validationActionClassText"
                      class="native-select"
                      @change="handleBusinessNodeStructuredChange"
                    >
                      <option v-for="option in modelClassOptions" :key="option" :value="option">{{ option }}</option>
                    </select>
                    <button v-if="validationActionClassDocText" type="button" class="doc-hint" :title="validationActionClassDocText" :aria-label="validationActionClassDocText">
                      <el-icon><QuestionFilled /></el-icon>
                      <span class="doc-hint-popover" role="tooltip">{{ validationActionClassDocText }}</span>
                    </button>
                  </span>
                </el-form-item>
                <el-form-item label="Completion Member">
                  <span class="field-with-doc">
                    <select
                      v-model="validationActionNameText"
                      class="native-select"
                      @change="handleBusinessNodeStructuredChange"
                    >
                      <option v-for="option in completionMemberOptions" :key="option" :value="option">{{ option }}</option>
                    </select>
                    <button v-if="validationActionMemberDocText" type="button" class="doc-hint" :title="validationActionMemberDocText" :aria-label="validationActionMemberDocText">
                      <el-icon><QuestionFilled /></el-icon>
                      <span class="doc-hint-popover" role="tooltip">{{ validationActionMemberDocText }}</span>
                    </button>
                  </span>
                </el-form-item>
              </el-form>
              <el-alert v-if="classModelError" :title="classModelError" type="error" :closable="false" />
              <div v-if="selectedClassModelOption" class="class-model-catalog">
                <strong>{{ selectedClassModelOption?.kind }}</strong>
                <span>attributes {{ selectedClassModelOption?.attributes.length }}</span>
                <span>actions {{ selectedClassModelOption?.methods.length }}</span>
              </div>
              <pre v-if="classModelGuideText" class="class-model-guide">{{ classModelGuideText }}</pre>
              <div class="editor-actions">
                <el-button :loading="classModelLoading" :icon="Refresh" @click="refreshClassModelOptions">
                  刷新知识
                </el-button>
                <el-button :loading="classModelLoading" :icon="DocumentCopy" @click="loadValidationActionGuide">
                  Action Guide
                </el-button>
              </div>
            </div>
          </details>

          <details class="editor-section collapsible-section" open>
            <summary>输入</summary>
            <div class="collapsible-body structured-editor">
              <div
                v-for="row in businessInputRows"
                :key="row.id"
                class="structured-field-row structured-field-row--inputs"
              >
                <span class="field-with-doc structured-field-path">
                  <select v-model="row.path" class="native-select" @change="handleBusinessNodeStructuredChange">
                    <option v-for="option in structuredPathOptions(businessInputRows)" :key="option" :value="option">
                      {{ option }}
                    </option>
                  </select>
                  <button v-if="nodeStructuredRowPathDocText(row)" type="button" class="doc-hint" :title="nodeStructuredRowPathDocText(row)" :aria-label="nodeStructuredRowPathDocText(row)">
                    <el-icon><QuestionFilled /></el-icon>
                    <span class="doc-hint-popover" role="tooltip">{{ nodeStructuredRowPathDocText(row) }}</span>
                  </button>
                </span>
                <select v-model="row.valueKind" class="native-select structured-field-kind" @change="handleBusinessNodeStructuredChange">
                  <option value="reference">引用</option>
                  <option value="text">文本</option>
                  <option value="number">数字</option>
                  <option value="boolean">布尔</option>
                </select>
                <span v-if="row.valueKind === 'reference'" class="field-with-doc structured-field-value">
                  <select
                    v-model="row.valueText"
                    class="native-select"
                    @change="handleBusinessNodeStructuredChange"
                  >
                    <option v-for="option in structuredValueOptions(row)" :key="option" :value="option">{{ option }}</option>
                  </select>
                  <button v-if="nodeStructuredRowValueDocText(row)" type="button" class="doc-hint" :title="nodeStructuredRowValueDocText(row)" :aria-label="nodeStructuredRowValueDocText(row)">
                    <el-icon><QuestionFilled /></el-icon>
                    <span class="doc-hint-popover" role="tooltip">{{ nodeStructuredRowValueDocText(row) }}</span>
                  </button>
                </span>
                <input
                  v-else-if="row.valueKind === 'boolean'"
                  v-model="row.valueBoolean"
                  class="structured-checkbox"
                  type="checkbox"
                  @change="handleBusinessNodeStructuredChange"
                >
                <el-input v-else v-model="row.valueText" class="structured-field-value" @input="handleBusinessNodeStructuredChange" />
                <el-button link type="danger" :icon="Delete" @click="removeStructuredFieldRow(businessInputRows, row)">
                  删除
                </el-button>
              </div>
              <el-button :icon="DocumentAdd" @click="addStructuredFieldRow(businessInputRows, 'input')">添加输入</el-button>
            </div>
          </details>

          <details class="editor-section collapsible-section" open>
            <summary>输出</summary>
            <div class="collapsible-body structured-editor">
              <div
                v-for="row in businessOutputRows"
                :key="row.id"
                class="structured-field-row structured-field-row--outputs"
              >
                <span class="field-with-doc structured-field-path">
                  <select v-model="row.path" class="native-select" @change="handleBusinessNodeStructuredChange">
                    <option v-for="option in structuredPathOptions(businessOutputRows)" :key="option" :value="option">
                      {{ option }}
                    </option>
                  </select>
                  <button v-if="nodeStructuredRowPathDocText(row)" type="button" class="doc-hint" :title="nodeStructuredRowPathDocText(row)" :aria-label="nodeStructuredRowPathDocText(row)">
                    <el-icon><QuestionFilled /></el-icon>
                    <span class="doc-hint-popover" role="tooltip">{{ nodeStructuredRowPathDocText(row) }}</span>
                  </button>
                </span>
                <select v-model="row.valueKind" class="native-select structured-field-kind" @change="handleBusinessNodeStructuredChange">
                  <option value="reference">引用</option>
                  <option value="text">文本</option>
                  <option value="number">数字</option>
                  <option value="boolean">布尔</option>
                </select>
                <span v-if="row.valueKind === 'reference'" class="field-with-doc structured-field-value">
                  <select
                    v-model="row.valueText"
                    class="native-select"
                    @change="handleBusinessNodeStructuredChange"
                  >
                    <option v-for="option in structuredValueOptions(row)" :key="option" :value="option">{{ option }}</option>
                  </select>
                  <button v-if="nodeStructuredRowValueDocText(row)" type="button" class="doc-hint" :title="nodeStructuredRowValueDocText(row)" :aria-label="nodeStructuredRowValueDocText(row)">
                    <el-icon><QuestionFilled /></el-icon>
                    <span class="doc-hint-popover" role="tooltip">{{ nodeStructuredRowValueDocText(row) }}</span>
                  </button>
                </span>
                <input
                  v-else-if="row.valueKind === 'boolean'"
                  v-model="row.valueBoolean"
                  class="structured-checkbox"
                  type="checkbox"
                  @change="handleBusinessNodeStructuredChange"
                >
                <el-input v-else v-model="row.valueText" class="structured-field-value" @input="handleBusinessNodeStructuredChange" />
                <el-button link type="danger" :icon="Delete" @click="removeStructuredFieldRow(businessOutputRows, row)">
                  删除
                </el-button>
              </div>
              <el-button :icon="DocumentAdd" @click="addStructuredFieldRow(businessOutputRows, 'output')">添加输出</el-button>
            </div>
          </details>

          <details class="editor-section collapsible-section" open>
            <summary>LLM 任务</summary>
            <div class="collapsible-body structured-editor">
              <el-form label-position="top">
                <el-form-item label="Goal">
                  <el-input v-model="taskGoalText" type="textarea" :rows="2" @input="handleBusinessNodeStructuredChange" />
                </el-form-item>
              </el-form>
              <strong>Requirements</strong>
              <div v-for="row in taskRequirementRows" :key="row.id" class="structured-field-row">
                <span class="field-with-doc structured-field-path">
                  <select v-model="row.path" class="native-select" @change="handleBusinessNodeStructuredChange">
                    <option v-for="option in structuredPathOptions(taskRequirementRows)" :key="option" :value="option">
                      {{ option }}
                    </option>
                  </select>
                  <button v-if="nodeStructuredRowPathDocText(row)" type="button" class="doc-hint" :title="nodeStructuredRowPathDocText(row)" :aria-label="nodeStructuredRowPathDocText(row)">
                    <el-icon><QuestionFilled /></el-icon>
                    <span class="doc-hint-popover" role="tooltip">{{ nodeStructuredRowPathDocText(row) }}</span>
                  </button>
                </span>
                <select v-model="row.valueKind" class="native-select structured-field-kind" @change="handleBusinessNodeStructuredChange">
                  <option value="reference">引用</option>
                  <option value="text">文本</option>
                  <option value="number">数字</option>
                  <option value="boolean">布尔</option>
                </select>
                <span v-if="row.valueKind === 'reference'" class="field-with-doc structured-field-value">
                  <select
                    v-model="row.valueText"
                    class="native-select"
                    @change="handleBusinessNodeStructuredChange"
                  >
                    <option v-for="option in structuredValueOptions(row)" :key="option" :value="option">{{ option }}</option>
                  </select>
                  <button v-if="nodeStructuredRowValueDocText(row)" type="button" class="doc-hint" :title="nodeStructuredRowValueDocText(row)" :aria-label="nodeStructuredRowValueDocText(row)">
                    <el-icon><QuestionFilled /></el-icon>
                    <span class="doc-hint-popover" role="tooltip">{{ nodeStructuredRowValueDocText(row) }}</span>
                  </button>
                </span>
                <el-input v-else v-model="row.valueText" class="structured-field-value" @input="handleBusinessNodeStructuredChange" />
                <el-button link type="danger" :icon="Delete" @click="removeStructuredFieldRow(taskRequirementRows, row)">删除</el-button>
              </div>
              <el-button :icon="DocumentAdd" @click="addStructuredFieldRow(taskRequirementRows, 'task.requirement')">添加需求</el-button>
              <strong>Context Inputs</strong>
              <div v-for="row in taskContextInputRows" :key="row.id" class="structured-field-row">
                <span class="field-with-doc structured-field-path">
                  <select v-model="row.path" class="native-select" @change="handleBusinessNodeStructuredChange">
                    <option v-for="option in structuredPathOptions(taskContextInputRows)" :key="option" :value="option">
                      {{ option }}
                    </option>
                  </select>
                  <button v-if="nodeStructuredRowPathDocText(row)" type="button" class="doc-hint" :title="nodeStructuredRowPathDocText(row)" :aria-label="nodeStructuredRowPathDocText(row)">
                    <el-icon><QuestionFilled /></el-icon>
                    <span class="doc-hint-popover" role="tooltip">{{ nodeStructuredRowPathDocText(row) }}</span>
                  </button>
                </span>
                <select v-model="row.valueKind" class="native-select structured-field-kind" @change="handleBusinessNodeStructuredChange">
                  <option value="reference">引用</option>
                  <option value="text">文本</option>
                  <option value="number">数字</option>
                  <option value="boolean">布尔</option>
                </select>
                <span v-if="row.valueKind === 'reference'" class="field-with-doc structured-field-value">
                  <select
                    v-model="row.valueText"
                    class="native-select"
                    @change="handleBusinessNodeStructuredChange"
                  >
                    <option v-for="option in structuredValueOptions(row)" :key="option" :value="option">{{ option }}</option>
                  </select>
                  <button v-if="nodeStructuredRowValueDocText(row)" type="button" class="doc-hint" :title="nodeStructuredRowValueDocText(row)" :aria-label="nodeStructuredRowValueDocText(row)">
                    <el-icon><QuestionFilled /></el-icon>
                    <span class="doc-hint-popover" role="tooltip">{{ nodeStructuredRowValueDocText(row) }}</span>
                  </button>
                </span>
                <el-input v-else v-model="row.valueText" class="structured-field-value" @input="handleBusinessNodeStructuredChange" />
                <el-button link type="danger" :icon="Delete" @click="removeStructuredFieldRow(taskContextInputRows, row)">删除</el-button>
              </div>
              <el-button :icon="DocumentAdd" @click="addStructuredFieldRow(taskContextInputRows, 'task.context')">添加上下文</el-button>
            </div>
          </details>

          <details class="editor-section collapsible-section" open>
            <summary>知识和调用</summary>
            <div class="collapsible-body structured-editor">
              <strong>Allowed Actions</strong>
              <div v-for="card in allowedActionCards" :key="card.id" class="structured-card">
                <span class="field-with-doc">
                  <select v-model="card.value" class="native-select" @change="handleBusinessNodeStructuredChange">
                    <option v-for="option in completionMemberOptions" :key="option" :value="option">{{ option }}</option>
                  </select>
                  <button v-if="nodeActionCardDocText(card)" type="button" class="doc-hint" :title="nodeActionCardDocText(card)" :aria-label="nodeActionCardDocText(card)">
                    <el-icon><QuestionFilled /></el-icon>
                    <span class="doc-hint-popover" role="tooltip">{{ nodeActionCardDocText(card) }}</span>
                  </button>
                </span>
                <el-button link type="danger" :icon="Delete" @click="removeSelectCard(allowedActionCards, card)">删除</el-button>
              </div>
              <el-button :icon="DocumentAdd" @click="addSelectCard(allowedActionCards, completionMemberOptions, 'knowledge.action')">
                添加 Action
              </el-button>
              <strong>Readable Attributes</strong>
              <div v-for="card in readableAttributeCards" :key="card.id" class="structured-card">
                <span class="field-with-doc">
                  <select v-model="card.value" class="native-select" @change="handleBusinessNodeStructuredChange">
                    <option v-for="option in modelAttributeOptions" :key="option" :value="option">{{ option }}</option>
                  </select>
                  <button v-if="nodeAttributeCardDocText(card)" type="button" class="doc-hint" :title="nodeAttributeCardDocText(card)" :aria-label="nodeAttributeCardDocText(card)">
                    <el-icon><QuestionFilled /></el-icon>
                    <span class="doc-hint-popover" role="tooltip">{{ nodeAttributeCardDocText(card) }}</span>
                  </button>
                </span>
                <el-button link type="danger" :icon="Delete" @click="removeSelectCard(readableAttributeCards, card)">删除</el-button>
              </div>
              <el-button :icon="DocumentAdd" @click="addSelectCard(readableAttributeCards, modelAttributeOptions, 'knowledge.attribute')">
                添加属性
              </el-button>
              <el-form label-position="top">
                <el-form-item label="Function Calling Mode">
                  <select v-model="functionCallingModeText" class="native-select" @change="handleBusinessNodeStructuredChange">
                    <option value="freeWithinModelContext">freeWithinModelContext</option>
                    <option value="restricted">restricted</option>
                    <option value="disabled">disabled</option>
                  </select>
                </el-form-item>
              </el-form>
            </div>
          </details>

          <details class="editor-section collapsible-section" open>
            <summary>校验</summary>
            <div class="collapsible-body structured-editor">
              <el-descriptions :column="1" size="small" border>
                <el-descriptions-item label="Status">{{ validationStatusText || 'draft' }}</el-descriptions-item>
              </el-descriptions>
              <strong>Input Projection</strong>
              <div v-for="row in validationInputProjectionRows" :key="row.id" class="structured-field-row">
                <span class="field-with-doc structured-field-path">
                  <select v-model="row.path" class="native-select" @change="handleBusinessNodeStructuredChange">
                    <option v-for="option in structuredPathOptions(validationInputProjectionRows)" :key="option" :value="option">
                      {{ option }}
                    </option>
                  </select>
                  <button v-if="nodeStructuredRowPathDocText(row)" type="button" class="doc-hint" :title="nodeStructuredRowPathDocText(row)" :aria-label="nodeStructuredRowPathDocText(row)">
                    <el-icon><QuestionFilled /></el-icon>
                    <span class="doc-hint-popover" role="tooltip">{{ nodeStructuredRowPathDocText(row) }}</span>
                  </button>
                </span>
                <select v-model="row.valueKind" class="native-select structured-field-kind" @change="handleBusinessNodeStructuredChange">
                  <option value="reference">引用</option>
                  <option value="text">文本</option>
                  <option value="number">数字</option>
                  <option value="boolean">布尔</option>
                </select>
                <span v-if="row.valueKind === 'reference'" class="field-with-doc structured-field-value">
                  <select
                    v-model="row.valueText"
                    class="native-select"
                    @change="handleBusinessNodeStructuredChange"
                  >
                    <option v-for="option in structuredValueOptions(row)" :key="option" :value="option">{{ option }}</option>
                  </select>
                  <button v-if="nodeStructuredRowValueDocText(row)" type="button" class="doc-hint" :title="nodeStructuredRowValueDocText(row)" :aria-label="nodeStructuredRowValueDocText(row)">
                    <el-icon><QuestionFilled /></el-icon>
                    <span class="doc-hint-popover" role="tooltip">{{ nodeStructuredRowValueDocText(row) }}</span>
                  </button>
                </span>
                <el-input v-else v-model="row.valueText" class="structured-field-value" @input="handleBusinessNodeStructuredChange" />
                <el-button link type="danger" :icon="Delete" @click="removeStructuredFieldRow(validationInputProjectionRows, row)">删除</el-button>
              </div>
              <el-button :icon="DocumentAdd" @click="addStructuredFieldRow(validationInputProjectionRows, 'validation.input')">添加输入投影</el-button>
              <strong>Expected Result</strong>
              <div v-for="row in validationExpectedResultRows" :key="row.id" class="structured-field-row">
                <span class="field-with-doc structured-field-path">
                  <select v-model="row.path" class="native-select" @change="handleBusinessNodeStructuredChange">
                    <option v-for="option in structuredPathOptions(validationExpectedResultRows)" :key="option" :value="option">
                      {{ option }}
                    </option>
                  </select>
                  <button v-if="nodeStructuredRowPathDocText(row)" type="button" class="doc-hint" :title="nodeStructuredRowPathDocText(row)" :aria-label="nodeStructuredRowPathDocText(row)">
                    <el-icon><QuestionFilled /></el-icon>
                    <span class="doc-hint-popover" role="tooltip">{{ nodeStructuredRowPathDocText(row) }}</span>
                  </button>
                </span>
                <select v-model="row.valueKind" class="native-select structured-field-kind" @change="handleBusinessNodeStructuredChange">
                  <option value="reference">引用</option>
                  <option value="text">文本</option>
                  <option value="number">数字</option>
                  <option value="boolean">布尔</option>
                </select>
                <el-input v-model="row.valueText" class="structured-field-value" @input="handleBusinessNodeStructuredChange" />
                <el-button link type="danger" :icon="Delete" @click="removeStructuredFieldRow(validationExpectedResultRows, row)">删除</el-button>
              </div>
              <el-button :icon="DocumentAdd" @click="addStructuredFieldRow(validationExpectedResultRows, 'validation.expected')">添加期望结果</el-button>
              <strong>Issues</strong>
              <pre class="readonly-json-preview">{{ validationIssuesPreview }}</pre>
            </div>
          </details>

          <details class="editor-section collapsible-section" open>
            <summary>能力</summary>
            <div class="collapsible-body structured-editor">
              <details v-for="card in capabilityCards" :key="card.id" class="structured-card" open>
                <summary>{{ card.title || card.id }}</summary>
                <el-form label-position="top">
                  <el-form-item label="Title">
                    <el-input v-model="card.title" @input="handleBusinessNodeStructuredChange" />
                  </el-form-item>
                  <el-form-item label="Scope">
                    <select v-model="card.scope" class="native-select" @change="handleBusinessNodeStructuredChange">
                      <option value="node">node</option>
                      <option value="workflow">workflow</option>
                    </select>
                  </el-form-item>
                  <el-form-item label="Description">
                    <el-input v-model="card.description" type="textarea" :rows="2" @input="handleBusinessNodeStructuredChange" />
                  </el-form-item>
                </el-form>
                <el-button link type="danger" :icon="Delete" @click="removeCapabilityCard(card)">删除能力</el-button>
              </details>
              <el-button :icon="DocumentAdd" @click="addCapabilityCard">添加能力</el-button>
            </div>
          </details>

          <details class="editor-section collapsible-section">
            <summary>运行时只读</summary>
            <div class="collapsible-body structured-editor">
              <strong>State</strong>
              <pre class="readonly-json-preview">{{ runtimeStatePreview }}</pre>
              <strong>Result</strong>
              <pre class="readonly-json-preview">{{ runtimeResultPreview }}</pre>
            </div>
          </details>

          <details class="editor-section collapsible-section">
            <summary>JSON 只读预览</summary>
            <pre class="readonly-json-preview">{{ modelJsonText }}</pre>
          </details>
        </template>

      </template>
    </el-drawer>

    <el-drawer
      v-model="classModelDrawerVisible"
      class="class-model-drawer"
      direction="rtl"
      :size="'33vw'"
      title="ClassModel 知识"
    >
      <template v-if="activeClassModelDrawerOption">
        <div class="class-model-doc-panel class-model-drawer-doc-panel">
          <section class="class-model-doc-item">
            <div class="class-model-doc-title">
              <span class="class-model-pin" aria-hidden="true"></span>
              <strong>{{ activeClassModelDrawerOption.kind }}</strong>
            </div>
            <pre>{{ classModelDocText(activeClassModelDrawerOption) }}</pre>
          </section>
          <section v-if="activeClassModelDrawerOption.constructorSignature" class="class-model-doc-item">
            <div class="class-model-doc-title">
              <span class="class-model-pin" aria-hidden="true"></span>
              <strong>constructor</strong>
            </div>
            <code>{{ activeClassModelDrawerOption.constructorSignature.signature }}</code>
            <pre>{{ classModelDocText(activeClassModelDrawerOption.constructorSignature) }}</pre>
          </section>
          <section v-if="activeClassModelDrawerActionOption" class="class-model-doc-item">
            <div class="class-model-doc-title">
              <span class="class-model-pin" aria-hidden="true"></span>
              <strong>{{ activeClassModelDrawerActionOption.name }}</strong>
            </div>
            <code>{{ activeClassModelDrawerActionOption.signature }}</code>
            <pre>{{ classModelDocText(activeClassModelDrawerActionOption) }}</pre>
          </section>
          <details class="class-model-doc-group" open>
            <summary>Attributes {{ activeClassModelDrawerOption.attributes.length }}</summary>
            <section
              v-for="attribute in activeClassModelDrawerOption.attributes"
              :key="attribute.name"
              class="class-model-doc-item"
            >
              <div class="class-model-doc-title">
                <span class="class-model-pin" aria-hidden="true"></span>
                <strong>{{ attribute.name }}</strong>
                <code>{{ attribute.typeText }}</code>
              </div>
              <pre>{{ classModelDocText(attribute) }}</pre>
            </section>
          </details>
          <details class="class-model-doc-group" open>
            <summary>Actions {{ activeClassModelDrawerOption.methods.length }}</summary>
            <section
              v-for="method in activeClassModelDrawerOption.methods"
              :key="method.name"
              class="class-model-doc-item"
            >
              <div class="class-model-doc-title">
                <span class="class-model-pin" aria-hidden="true"></span>
                <strong>{{ method.name }}</strong>
              </div>
              <code>{{ method.signature }}</code>
              <pre>{{ classModelDocText(method) }}</pre>
            </section>
          </details>
        </div>
      </template>
      <el-empty v-else description="未加载 ClassModel" />
    </el-drawer>

    <el-dialog v-model="createDialogVisible" title="新建工作流设计稿" width="460px">
      <el-form label-position="top">
        <el-form-item label="Workflow ID">
          <el-input v-model="createForm.workflowId" />
        </el-form-item>
        <el-form-item label="名称">
          <el-input v-model="createForm.title" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="createDesign">创建</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="nodeCreateDialogVisible" title="新增节点" width="520px">
      <el-form label-position="top">
        <el-form-item label="目标分区">
          <el-input v-model="nodeCreateForm.graphKey" disabled />
        </el-form-item>
        <el-form-item label="节点类型">
          <select v-model="nodeCreateForm.nodeKind" class="native-select" @change="syncNodeCreateKindDefaults">
            <option value="node">Business Node</option>
            <option value="start">Start</option>
            <option value="output">Output</option>
          </select>
        </el-form-item>
        <el-form-item label="节点 ID">
          <el-input v-model="nodeCreateForm.id" />
        </el-form-item>
        <el-form-item label="标题">
          <el-input v-model="nodeCreateForm.title" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input v-model="nodeCreateForm.desc" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="nodeCreateDialogVisible = false">取消</el-button>
        <el-button type="primary" :icon="DocumentAdd" @click="createNodeInSelectedGraph">创建节点</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-if="definitionDialogVisible"
      v-model="definitionDialogVisible"
      title="Agent Workflow Definition"
      width="760px"
    >
      <div class="definition-editor">
        <div class="definition-editor-meta">
          <span>{{ currentWorkflowId }}</span>
          <el-tag size="small">{{ definitionTimestamp ? `ts ${definitionTimestamp}` : 'local' }}</el-tag>
          <el-tag size="small" :type="definitionDirty ? 'warning' : 'success'">
            {{ definitionDirty ? 'unsaved' : 'saved' }}
          </el-tag>
        </div>
        <el-input
          v-model="definitionJsonText"
          class="definition-json-input"
          type="textarea"
          :rows="22"
          @input="markDefinitionDirty"
        />
      </div>
      <template #footer>
        <el-button @click="definitionDialogVisible = false">关闭</el-button>
        <el-button
          type="primary"
          :icon="Upload"
          :loading="savingDefinition"
          :disabled="!canSaveDefinition"
          @click="saveCurrentDefinition"
        >
          保存 Definition
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
/**
 * @description 工作流设计稿可视化编辑页。编辑 Dify-like graph 中的业务节点和步骤线，并通过后端文件 API 保存 design.json。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch, type CSSProperties } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Background } from '@vue-flow/background'
import { Controls } from '@vue-flow/controls'
import {
  BaseEdge,
  ConnectionLineType,
  ConnectionMode,
  Handle,
  MarkerType,
  Position,
  VueFlow,
  type Connection,
  type Node,
  type NodeChange,
  type NodeDragEvent,
  type ViewportTransform,
} from '@vue-flow/core'
import { MiniMap } from '@vue-flow/minimap'
import {
  createWorkerDtsClassModelKnowledgeProvider,
  type ClassModelKnowledgeProvider,
} from '@spark-appworks/spark-ai/class-model'
import { standardizeJsonSchema, type JsonSchema } from '@spark-appworks/spark-json-document'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/core/dist/theme-default.css'
import '@vue-flow/controls/dist/style.css'
import '@vue-flow/minimap/dist/style.css'
import {
  ArrowDown,
  ArrowUp,
  CircleCheck,
  Delete,
  DocumentAdd,
  DocumentCopy,
  FolderOpened,
  QuestionFilled,
  Refresh,
  RefreshLeft,
  Upload,
} from '@element-plus/icons-vue'
import {
  addWorkflowDesignLine,
  autoLayoutWorkflowDesignGraphs,
  collectWorkflowDesignNodes,
  collectWorkflowDesignLines,
  collectWorkflowDesignGraphs,
  createWorkflowDesign,
  createAgentWorkflowDefinitionFromDesign,
  createWorkflowDesignNode,
  deleteWorkflowDesign,
  formatJson,
  isWorkflowDefinitionNotFoundError,
  listWorkflowDesigns,
  markWorkflowDesignDirty,
  markWorkflowDesignSaved,
  normalizeWorkflowDesignLineState,
  parseAgentWorkflowDefinitionJson,
  publishWorkflowDefinition,
  readWorkflowDefinition,
  readWorkflowDesign,
  removeWorkflowDesignLine,
  removeWorkflowDesignNode,
  saveWorkflowDefinition,
  saveWorkflowDesign,
  updateWorkflowDesignLine,
  workflowDesignLineControlPoints,
  workflowDesignLineType,
  type WorkflowDesignCapability,
  type WorkflowDesignDocument,
  type WorkflowDesignLineEndpoint,
  type WorkflowDesignLineControlPoint,
  type WorkflowDesignLineType,
  type WorkflowDesignLineView,
  type WorkflowDesignGraphView,
  type WorkflowDesignNodeView,
  type WorkflowDesignNodeCreateKind,
  type WorkflowDesignSummary,
  type WorkflowDesignVariable,
} from '@/services/workflow-designs'
import { getDtsClassModelManifestUrl } from '@/class-model-artifacts/artifact-urls'

type PropertyDrawerTarget = 'workflow' | 'node' | 'line'

type LayoutResizeState = {
  side: 'left' | 'right'
  startClientX: number
  startLeftWidth: number
  startRightWidth: number
}

type GraphSplitCollapse = 'top' | 'bottom' | null

type GraphSplitResizeState = {
  containerTop: number
  containerHeight: number
  moved: boolean
}

type GraphSplitPanel = {
  key: string
  role: 'main' | 'child'
  graphView: WorkflowDesignGraphView | null
  collapsed: boolean
}

type WorkflowFlowNodeData = {
  viewKey: string
  title: string
  nodeType: string
  scopePath: string
  isBusinessNode: boolean
  isBoundaryNode: boolean
  modelClassName: string
  modelDocText: string
  validationActionName: string
  validationActionDocText: string
}

type WorkflowFlowLineData = {
  lineKey: string
  lineType: WorkflowDesignLineType
  controlPoints: readonly WorkflowDesignLineControlPoint[]
  runtimeStatus: WorkflowLineRuntimeStatus
}

type WorkflowLineRuntimeStatus = 'idle' | 'running' | 'completed' | 'failed' | 'skipped'

type WorkflowControlEdgeSlot = Readonly<{
  id: string
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  markerEnd?: string
  style?: CSSProperties
  data: WorkflowFlowLineData
}>

type WorkflowDockDefinition = Readonly<{
  id: number
  position: Position
  style: CSSProperties
}>

type SelectedControlPoint = Readonly<{
  lineKey: string
  index: number
}>

type ControlPointDragState = Readonly<{
  lineKey: string
  index: number
  graph: WorkflowDesignGraphView['graph']
  startClientX: number
  startClientY: number
  startPoint: WorkflowDesignLineControlPoint
}>

type StartControlPointDragCommand = Readonly<{
  event: PointerEvent
  data: WorkflowFlowLineData
  index: string | number
  graphView: WorkflowDesignGraphView
}>

type VueFlowLineChange = Readonly<{
  id?: string
  type: string
  selected?: boolean
}>

type VueFlowLineUpdateEvent = Readonly<{
  edge: {
    data?: unknown
  }
  connection: Connection
}>

type ClassModelMethodOption = {
  name: string
  jsdoc: string
  summary: string
  signature: string
}

type ClassModelAttributeOption = {
  name: string
  jsdoc: string
  summary: string
  typeText: string
}

type ClassModelConstructorOption = {
  jsdoc: string
  summary: string
  signature: string
}

type ClassModelOption = {
  kind: string
  jsdoc: string
  summary: string
  constructorSignature: ClassModelConstructorOption | null
  attributes: ClassModelAttributeOption[]
  methods: ClassModelMethodOption[]
}

type WorkflowFlowNode = Node<WorkflowFlowNodeData, Record<string, never>, 'workflow'>
type WorkflowFlowConnection = {
  id: string
  type: 'workflow-control'
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
  markerEnd: MarkerType
  data: WorkflowFlowLineData
}

type LineEndpointPatchValidationCommand = Readonly<{
  line: WorkflowDesignLineView
  from: WorkflowDesignLineEndpoint
  to: WorkflowDesignLineEndpoint
  options: {
    silent?: boolean
  }
}>

type NodeCreateForm = {
  graphKey: string
  nodeKind: WorkflowDesignNodeCreateKind
  id: string
  title: string
  desc: string
}

type StructuredValueKind = 'text' | 'number' | 'boolean' | 'reference'

type StructuredFieldRow = {
  id: string
  path: string
  valueKind: StructuredValueKind
  valueText: string
  valueBoolean: boolean
}

type StructuredRowsCollectionCommand = Readonly<{
  value: unknown
  path: string
  rows: StructuredFieldRow[]
  prefix: string
}>

type EditorLineEndpointCommand = Readonly<{
  nodeId: string
  modelId: string
  memberName: string
  dockText: string
}>

type StructuredSelectCard = {
  id: string
  value: string
}

type StructuredCapabilityCard = {
  id: string
  title: string
  scope: string
  description: string
  inputRows: StructuredFieldRow[]
  outputRows: StructuredFieldRow[]
  constraintCards: StructuredSelectCard[]
}

type ApplyStructuredEditorOptions = {
  silent?: boolean
}

type WorkflowVariableEditorRow = {
  id: string
  source: Record<string, unknown>
  schema: Record<string, unknown>
  name: string
  title: string
  docText: string
  required: boolean
  schemaType: string
  defaultValue: unknown
  defaultValueText: string
  defaultValueEditable: boolean
}

type WorkflowMetadataRow = {
  label: string
  value: string
}

type WorkflowRuntimeBinding = NonNullable<WorkflowDesignDocument['workflow']['runtimeBinding']>

const MIN_LEFT_PANEL_WIDTH = 220
const MAX_LEFT_PANEL_WIDTH = 480
const COLLAPSED_LEFT_PANEL_WIDTH = 48
const MIN_RIGHT_PANEL_WIDTH = 200
const MAX_RIGHT_PANEL_WIDTH = 320
const GRAPH_SPLIT_MIN_RATIO = 22
const GRAPH_SPLIT_MAX_RATIO = 78
const GRAPH_SPLIT_SNAP_RATIO = 12
const GRAPH_SPLIT_STORAGE_PREFIX = 'spark.workflow-design.graph-split.'
const NODE_KEYBOARD_MOVE_STEP = 20
const NODE_KEYBOARD_FAST_MOVE_STEP = 100
const UNREADABLE_WORKFLOW_DESIGN_STATUS = 'unreadable'
const UNREADABLE_WORKFLOW_DESIGN_FALLBACK_ERROR = '设计稿格式不兼容或文件不可读'
const WORKFLOW_NODE_WIDTH = 216
const WORKFLOW_NODE_HEIGHT = 118
let structuredEditorId = 0

const inputDockDefinitions: readonly WorkflowDockDefinition[] = [
  { id: 1, position: Position.Top, style: { left: '25%' } },
  { id: 2, position: Position.Top, style: { left: '50%' } },
  { id: 3, position: Position.Top, style: { left: '75%' } },
  { id: 10, position: Position.Left, style: { top: '25%' } },
  { id: 11, position: Position.Left, style: { top: '50%' } },
  { id: 12, position: Position.Left, style: { top: '75%' } },
]
const outputDockDefinitions: readonly WorkflowDockDefinition[] = [
  { id: 4, position: Position.Right, style: { top: '25%' } },
  { id: 5, position: Position.Right, style: { top: '50%' } },
  { id: 6, position: Position.Right, style: { top: '75%' } },
  { id: 7, position: Position.Bottom, style: { left: '75%' } },
  { id: 8, position: Position.Bottom, style: { left: '50%' } },
  { id: 9, position: Position.Bottom, style: { left: '25%' } },
]

const designs = ref<WorkflowDesignSummary[]>([])
const currentWorkflowId = ref('')
const currentTimestamp = ref('')
const currentFilename = ref('')
const currentDocument = ref<WorkflowDesignDocument | null>(null)
const selectedNodeKey = ref('')
const selectedLineKey = ref('')
const selectedControlPoint = ref<SelectedControlPoint | null>(null)
const controlPointDragState = ref<ControlPointDragState | null>(null)
const lineRuntimeStatuses = ref<Record<string, WorkflowLineRuntimeStatus>>({})
const propertiesDrawerVisible = ref(false)
const propertiesDrawerTarget = ref<PropertyDrawerTarget>('node')
const classModelDrawerVisible = ref(false)
const leftPanelCollapsed = ref(false)
const layoutResizeState = ref<LayoutResizeState | null>(null)
const graphSplitResizeState = ref<GraphSplitResizeState | null>(null)
const leftPanelWidth = ref(280)
const rightPanelWidth = ref(240)
const currentMainGraphKey = ref('workflow.graph')
const currentChildGraphKey = ref('')
const graphSplitRatio = ref(48)
const graphSplitCollapsed = ref<GraphSplitCollapse>(null)

const loadingList = ref(false)
const opening = ref(false)
const saving = ref(false)
const autoLayoutSaving = ref(false)
const publishing = ref(false)
const openingDefinition = ref(false)
const savingDefinition = ref(false)
const creating = ref(false)
const createDialogVisible = ref(false)
const nodeCreateDialogVisible = ref(false)
const definitionDialogVisible = ref(false)
const editorDirty = ref(false)
const definitionTimestamp = ref('')
const definitionJsonText = ref('{}')
const definitionDirty = ref(false)

const nodeTypeText = ref('')
const nodeTitleText = ref('')
const nodeDescText = ref('')
const modelJsonText = ref('{}')
const modelRootClassText = ref('')
const modelClassText = ref('')
const validationActionClassText = ref('')
const validationActionNameText = ref('')
const classModelLoading = ref(false)
const classModelError = ref('')
const classModelGuideText = ref('')
const classModelOptions = ref<ClassModelOption[]>([])
const classModelLoadedRootText = ref('')
const workflowDesignerTitleText = ref('')
const workflowVersionValue = ref(1)
const workflowVariableRows = ref<WorkflowVariableEditorRow[]>([])
const workflowCapabilityCards = ref<StructuredCapabilityCard[]>([])
const workflowRuntimeAliasText = ref('')
const workflowRuntimeModuleIdText = ref('')
const workflowRuntimeBusinessIdText = ref('')
const workflowIdentityFieldText = ref('')
const workflowMessageFieldText = ref('')
const workflowSystemPromptTemplateText = ref('')
const workflowModelProjectionKindText = ref('dts-class-model')
const workflowRootClassText = ref('')
const workflowManifestUrlRefText = ref('')
const workflowExecutableKindText = ref('js-module')
const workflowExecutableModuleSpecifierText = ref('')
const workflowExecutableExportNameText = ref('')
const workflowResolveEditorSourceText = ref('')
const workflowResolveIdentityFieldText = ref('')
const workflowAgentCompleteMethodText = ref('')
const workflowReadonlyStepCards = ref<StructuredSelectCard[]>([])
const workflowExecutionToolCards = ref<StructuredSelectCard[]>([])
const workflowPlanMarkerCards = ref<StructuredSelectCard[]>([])
const loopModeText = ref('')
const loopMaxCountValue = ref(10)
const loopExitNodeText = ref('')
const lineFromNodeText = ref('')
const lineFromModelText = ref('')
const lineFromMemberText = ref('')
const lineToNodeText = ref('')
const lineToModelText = ref('')
const lineToMemberText = ref('')
const lineTypeText = ref('')
const lineFromDockText = ref('')
const lineToDockText = ref('')
const lineRelationText = ref('')
const lineVisualTypeText = ref<WorkflowDesignLineType>('orthogonal')
const businessInputRows = ref<StructuredFieldRow[]>([])
const businessOutputRows = ref<StructuredFieldRow[]>([])
const taskGoalText = ref('')
const taskRequirementRows = ref<StructuredFieldRow[]>([])
const taskContextInputRows = ref<StructuredFieldRow[]>([])
const allowedActionCards = ref<StructuredSelectCard[]>([])
const readableAttributeCards = ref<StructuredSelectCard[]>([])
const functionCallingModeText = ref('freeWithinModelContext')
const functionCallingConstraintCards = ref<StructuredSelectCard[]>([])
const structuredResultRows = ref<StructuredFieldRow[]>([])
const handoffToValidationValue = ref(true)
const validationInputProjectionRows = ref<StructuredFieldRow[]>([])
const validationExpectedResultRows = ref<StructuredFieldRow[]>([])
const validationStatusText = ref('')
const capabilityCards = ref<StructuredCapabilityCard[]>([])
const runtimeStatePreview = ref('{}')
const runtimeResultPreview = ref('{}')
const validationIssuesPreview = ref('[]')

const createForm = ref({
  workflowId: '',
  title: '',
})

const nodeCreateForm = ref<NodeCreateForm>({
  graphKey: '',
  nodeKind: 'node',
  id: '',
  title: '',
  desc: '',
})

const allNodes = computed(() => currentDocument.value === null ? [] : collectWorkflowDesignNodes(currentDocument.value))
const graphViews = computed(() => currentDocument.value === null ? [] : collectWorkflowDesignGraphs(currentDocument.value))
const lineViews = computed(() => currentDocument.value === null ? [] : collectWorkflowDesignLines(currentDocument.value))
const businessNodes = computed(() => allNodes.value.filter(node => node.isBusinessNode))
const selectedNode = computed(() => allNodes.value.find(node => node.key === selectedNodeKey.value) ?? null)
const selectedLine = computed(() => lineViews.value.find(line => line.key === selectedLineKey.value) ?? null)
const selectedLineControlPointCount = computed(() => {
  const line = selectedLine.value
  return line === null ? 0 : workflowDesignLineControlPoints(line.line).length
})
const selectedClassModelOption = computed(() => {
  return classModelOptions.value.find(item => item.kind === modelClassText.value.trim()) ?? null
})
const selectedClassModelMethods = computed(() => selectedClassModelOption.value?.methods ?? [])
const selectedValidationClassModelOption = computed(() => {
  return classModelOptions.value.find(item => item.kind === validationActionClassText.value.trim())
    ?? selectedClassModelOption.value
})
const selectedValidationActionOption = computed(() => {
  const methodName = validationActionNameText.value.trim()
  if (methodName.length === 0) return null
  return selectedValidationClassModelOption.value?.methods.find(method => method.name === methodName) ?? null
})
const workflowRootClassModelOption = computed(() => {
  return classModelOptions.value.find(item => item.kind === workflowRootClassText.value.trim()) ?? null
})
const workflowMethodOptions = computed(() => {
  return uniqueTexts([
    workflowAgentCompleteMethodText.value,
    ...(workflowRootClassModelOption.value?.methods ?? []).map(method => method.name),
  ])
})
const workflowAgentCompleteMethodOption = computed(() => {
  const methodName = workflowAgentCompleteMethodText.value.trim()
  if (methodName.length === 0) return null
  return workflowRootClassModelOption.value?.methods.find(method => method.name === methodName) ?? null
})
const workflowRootClassDocText = computed(() => {
  const option = workflowRootClassModelOption.value
  return option === null ? '' : classModelDocText(option)
})
const workflowAgentCompleteMethodDocText = computed(() => {
  const option = workflowAgentCompleteMethodOption.value
  return option === null ? '' : classModelDocText(option)
})
const lineFromModelDocText = computed(() => lineEndpointModelDocText(lineFromNodeText.value, lineFromModelText.value))
const lineToModelDocText = computed(() => lineEndpointModelDocText(lineToNodeText.value, lineToModelText.value))
const lineFromMemberDocText = computed(() => lineEndpointMemberDocText(lineFromNodeText.value, lineFromModelText.value, lineFromMemberText.value))
const lineToMemberDocText = computed(() => lineEndpointMemberDocText(lineToNodeText.value, lineToModelText.value, lineToMemberText.value))
const modelRootClassDocText = computed(() => classModelDocTextByKind(modelRootClassText.value))
const modelClassDocText = computed(() => classModelDocTextByKind(modelClassText.value))
const validationActionClassDocText = computed(() => classModelDocTextByKind(validationActionClassText.value))
const validationActionMemberDocText = computed(() => classModelMemberDocText(validationActionClassText.value || modelClassText.value, validationActionNameText.value))
const activeClassModelDrawerOption = computed(() => {
  return propertiesDrawerTarget.value === 'workflow'
    ? workflowRootClassModelOption.value
    : selectedClassModelOption.value
})
const activeClassModelDrawerActionOption = computed(() => {
  return propertiesDrawerTarget.value === 'workflow'
    ? workflowAgentCompleteMethodOption.value
    : selectedValidationActionOption.value
})
const currentDesignSummary = computed(() => findWorkflowDesignSummary(currentWorkflowId.value))
const propertiesDrawerTitle = computed(() => {
  if (propertiesDrawerTarget.value === 'workflow') return `流程属性 / ${currentDocument.value?.workflow.id ?? 'Workflow'}`
  if (selectedLine.value !== null) return `连线属性 / ${selectedLine.value.id}`
  if (selectedNode.value !== null) return `节点属性 / ${selectedNode.value.title}`
  return 'Properties'
})
const workflowPrimaryMetadataRows = computed<WorkflowMetadataRow[]>(() => {
  const document = currentDocument.value
  if (document === null) return []
  return [
    { label: '文件名', value: currentFilename.value || currentDesignSummary.value?.filename || 'design.json' },
    { label: '时间戳', value: currentTimestamp.value || '-' },
    { label: '创建人', value: readWorkflowMetadataText(['createdBy', 'creator', 'author', 'owner', 'createdUser']) || '-' },
    { label: '创建时间', value: readWorkflowMetadataText(['createdAt', 'createdTime', 'createTime']) || '-' },
    { label: '更新人', value: readWorkflowMetadataText(['updatedBy', 'modifier', 'modifiedBy', 'updatedUser']) || '-' },
    { label: '更新时间', value: readWorkflowMetadataText(['updatedAt', 'modifiedAt', 'updatedTime', 'modifyTime']) || '-' },
    { label: '状态', value: readTextField(document.x_spark.draft, 'status') || currentDesignSummary.value?.status || 'draft' },
    { label: 'Schema', value: readTextField(document.x_spark, 'schema') || '-' },
  ]
})
const workflowFullMetadataRows = computed<WorkflowMetadataRow[]>(() => {
  const document = currentDocument.value
  if (document === null) return []
  const rows: WorkflowMetadataRow[] = []
  collectWorkflowMetadataRows({
    filename: currentFilename.value || currentDesignSummary.value?.filename || 'design.json',
    timestamp: currentTimestamp.value,
    summaryStatus: currentDesignSummary.value?.status ?? '',
    document: {
      kind: document.kind,
      version: document.version,
      id: document.id,
    },
    workflow: {
      id: document.workflow.id,
      version: document.workflow.version,
      variables: document.workflow.variables ?? [],
      capabilities: document.workflow.capabilities ?? [],
      runtimeBinding: document.workflow.runtimeBinding ?? {},
    },
    x_spark: document.x_spark,
  }, '', rows)
  return rows
})
const selectedLineGraphNodes = computed(() => {
  const line = selectedLine.value
  if (line === null) return []
  return allNodes.value.filter(node => node.graph === line.graph)
})
const rootClassOptions = computed(() => {
  const runtimeRoot = currentDocument.value?.workflow.runtimeBinding?.modelProjectionRef?.rootClassName
  return uniqueTexts([
    typeof runtimeRoot === 'string' ? runtimeRoot : '',
    workflowRootClassText.value,
    modelRootClassText.value,
  ])
})
const modelClassOptions = computed(() => {
  return uniqueTexts([
    modelClassText.value,
    validationActionClassText.value,
    ...classModelOptions.value.map(item => item.kind),
  ])
})
const completionMemberOptions = computed(() => {
  return uniqueTexts([
    validationActionNameText.value,
    ...(selectedValidationClassModelOption.value?.methods ?? selectedClassModelMethods.value).map(method => method.name),
  ])
})
const modelAttributeOptions = computed(() => {
  return uniqueTexts(selectedClassModelOption.value?.attributes.map(attribute => attribute.name) ?? [])
})
const workflowVariableOptions = computed(() => {
  return uniqueTexts(currentDocument.value?.workflow.variables?.map(variable => variable.name) ?? [])
})
const workflowVariableEditorNames = computed(() => {
  return uniqueTexts([
    workflowIdentityFieldText.value,
    workflowMessageFieldText.value,
    workflowResolveIdentityFieldText.value,
    ...workflowVariableRows.value.map(row => row.name),
  ])
})
const structuredBasePathOptions = computed(() => {
  return uniqueTexts([
    ...workflowVariableOptions.value,
    ...modelAttributeOptions.value,
    ...selectedLineGraphNodes.value.flatMap(node => recordKeys(node.node.data?.outputs)),
  ])
})
const structuredReferenceOptions = computed(() => {
  const selected = selectedNode.value
  const incomingReferenceOptions = selected === null
    ? []
    : lineViews.value
      .filter(line => line.graph === selected.graph && line.toNodeId === selected.id)
      .flatMap(line => referenceOptionsForNodeId(line.fromNodeId, line.graph))
  return uniqueTexts([
    ...workflowVariableOptions.value.map(name => `{{ start.${name} }}`),
    ...modelAttributeOptions.value.map(name => `$model.${name}`),
    ...incomingReferenceOptions,
    ...allStructuredRows().map(row => row.valueText),
  ])
})
const workflowShellStyle = computed<CSSProperties>(() => {
  const leftWidth = leftPanelCollapsed.value ? COLLAPSED_LEFT_PANEL_WIDTH : leftPanelWidth.value
  const leftHandleWidth = leftPanelCollapsed.value ? 0 : 12
  return {
    gridTemplateColumns: `${leftWidth}px ${leftHandleWidth}px minmax(520px, 1fr) 8px ${rightPanelWidth.value}px`,
  }
})
const rootGraphView = computed(() => graphViews.value[0] ?? null)
const currentMainGraphView = computed(() => {
  return graphViews.value.find(view => view.key === currentMainGraphKey.value)
    ?? rootGraphView.value
})
const currentMainParentGraphView = computed(() => {
  const main = currentMainGraphView.value
  if (main === null || main.depth === 0) return null
  return graphViews.value.find((view) => {
    return view.depth === main.depth - 1 && main.scopePath.startsWith(`${view.scopePath}.`)
  }) ?? null
})
const mainChildGraphOptions = computed(() => {
  const main = currentMainGraphView.value
  if (main === null) return []
  return graphViews.value.filter((view) => {
    return view.depth === main.depth + 1 && view.scopePath.startsWith(`${main.scopePath}.`)
  })
})
const currentChildGraphView = computed(() => {
  return mainChildGraphOptions.value.find(view => view.key === currentChildGraphKey.value)
    ?? mainChildGraphOptions.value[0]
    ?? null
})
const graphSplitPanels = computed<GraphSplitPanel[]>(() => {
  const main = currentMainGraphView.value
  if (main === null) return []
  const child = currentChildGraphView.value
  return [
    {
      key: 'main',
      role: 'main',
      graphView: main,
      collapsed: graphSplitCollapsed.value === 'top',
    },
    {
      key: 'child',
      role: 'child',
      graphView: child,
      collapsed: graphSplitCollapsed.value === 'bottom' || child === null,
    },
  ]
})
const graphSplitStyle = computed<CSSProperties>(() => {
  if (graphSplitCollapsed.value === 'top') {
    return { gridTemplateRows: '8px 18px minmax(260px, 1fr)' }
  }
  if (graphSplitCollapsed.value === 'bottom' || currentChildGraphView.value === null) {
    return { gridTemplateRows: 'minmax(300px, 1fr) 18px 8px' }
  }
  return {
    gridTemplateRows: `minmax(220px, ${graphSplitRatio.value}fr) 18px minmax(220px, ${100 - graphSplitRatio.value}fr)`,
  }
})
const flowDefaultLineOptions = {
  type: 'smoothstep',
  markerEnd: MarkerType.ArrowClosed,
  interactionWidth: 18,
}
const canSave = computed(() => currentDocument.value !== null && currentWorkflowId.value.length > 0 && !opening.value)
const canAutoLayout = computed(() => canSave.value && !saving.value && !autoLayoutSaving.value)
const canPublish = computed(() => canSave.value && !saving.value && !publishing.value)
const canOpenDefinition = computed(() => canSave.value && !openingDefinition.value)
const canSaveDefinition = computed(() => (
  currentWorkflowId.value.length > 0
  && definitionJsonText.value.trim().length > 0
  && !savingDefinition.value
))
const hasUnsavedChanges = computed(() => {
  const status = currentDocument.value?.x_spark.draft?.['status']
  return (typeof status === 'string' ? status : 'draft') === 'dirty' || editorDirty.value
})

watch(
  () => selectedNode.value?.key ?? '',
  () => {
    if (propertiesDrawerTarget.value !== 'workflow') syncEditorFromSelected()
    syncChildGraphFromSelectedMainNode()
    ensureSelectedNodeClassModelKnowledge()
  },
  { immediate: true },
)

watch(
  () => selectedLine.value?.key ?? '',
  () => {
    if (propertiesDrawerTarget.value !== 'workflow') syncLineEditorFromSelected()
  },
  { immediate: true },
)

watch(
  () => graphViews.value.map(view => view.key).join('|'),
  () => normalizeGraphNavigation(),
  { immediate: true },
)

watch(
  () => currentMainGraphView.value?.key ?? '',
  () => normalizeChildGraphSelection(),
)

onMounted(async () => {
  window.document.addEventListener('keydown', handleNodeKeyboardMove)
  window.document.addEventListener('keydown', handleControlPointDeleteKey)
  await loadDesigns()
  await openInitialDesign()
})

onBeforeUnmount(() => {
  window.document.removeEventListener('keydown', handleNodeKeyboardMove)
  window.document.removeEventListener('keydown', handleControlPointDeleteKey)
  stopControlPointDrag()
  stopLayoutResize()
  stopGraphSplitResize()
})

async function loadDesigns(): Promise<void> {
  loadingList.value = true
  try {
    designs.value = await listWorkflowDesigns()
  } catch (error: unknown) {
    ElMessage.error(`加载工作流设计稿失败: ${errorMessage(error)}`)
  } finally {
    loadingList.value = false
  }
}

async function openInitialDesign(): Promise<void> {
  if (designs.value.length === 0 || currentWorkflowId.value.length > 0) return
  const firstReadableDesign = designs.value.find(item => !isUnreadableDesign(item))
  if (firstReadableDesign !== undefined) {
    await openDesign(firstReadableDesign.workflowId)
    return
  }
  ElMessage.warning('当前设计稿均不可打开，请新建工作流或删除旧设计稿')
}

async function openDesign(workflowId: string): Promise<void> {
  const normalizedWorkflowId = workflowId.trim()
  if (normalizedWorkflowId.length === 0) return
  const summary = findWorkflowDesignSummary(normalizedWorkflowId)
  if (isUnreadableDesign(summary)) {
    ElMessage.error(`设计稿不可打开: ${workflowDesignErrorMessage(summary)}`)
    return
  }
  if (normalizedWorkflowId !== currentWorkflowId.value) {
    if (!await confirmDiscardEditorDraft()) return
    if (!await confirmDiscardDefinitionDraft()) return
  }

  opening.value = true
  try {
    const result = await readWorkflowDesign(normalizedWorkflowId)
    if (result.document === undefined) {
      ElMessage.info('设计稿未变化')
      return
    }
    normalizeWorkflowDesignLineState(result.document)
    currentWorkflowId.value = normalizedWorkflowId
    currentFilename.value = result.filename
    currentTimestamp.value = result.timestamp
    currentDocument.value = result.document
    syncWorkflowEditorFromDocument()
    resetDefinitionEditor()
    selectedLineKey.value = ''
    currentMainGraphKey.value = 'workflow.graph'
    currentChildGraphKey.value = ''
    loadGraphSplitState(normalizedWorkflowId)
    const nodes = collectWorkflowDesignNodes(result.document)
    selectedNodeKey.value = nodes.find(node => node.isBusinessNode)?.key
      ?? nodes[0]?.key
      ?? ''
  } catch (error: unknown) {
    ElMessage.error(`打开失败: ${errorMessage(error)}`)
  } finally {
    opening.value = false
  }
}

function findWorkflowDesignSummary(workflowId: string): WorkflowDesignSummary | undefined {
  return designs.value.find(item => item.workflowId === workflowId)
}

function isUnreadableDesign(item: WorkflowDesignSummary | undefined): boolean {
  return item?.status === UNREADABLE_WORKFLOW_DESIGN_STATUS
}

function workflowDesignErrorMessage(item: WorkflowDesignSummary | undefined): string {
  const message = item?.error?.trim()
  return message && message.length > 0 ? message : UNREADABLE_WORKFLOW_DESIGN_FALLBACK_ERROR
}

function workflowDesignListItemTitle(item: WorkflowDesignSummary): string {
  return isUnreadableDesign(item) ? workflowDesignErrorMessage(item) : item.title || item.workflowId
}

function openCreateDialog(): void {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
  createForm.value = {
    workflowId: `agent.workflow.${stamp}`,
    title: 'Agent Workflow',
  }
  createDialogVisible.value = true
}

async function createDesign(): Promise<void> {
  const workflowId = createForm.value.workflowId.trim()
  const title = createForm.value.title.trim()
  if (workflowId.length === 0) {
    ElMessage.warning('请输入 Workflow ID')
    return
  }
  creating.value = true
  try {
    await createWorkflowDesign({ workflowId, title: title || workflowId })
    createDialogVisible.value = false
    await loadDesigns()
    await openDesign(workflowId)
    ElMessage.success('设计稿已创建')
  } catch (error: unknown) {
    ElMessage.error(`创建失败: ${errorMessage(error)}`)
  } finally {
    creating.value = false
  }
}

async function deleteDesign(workflowId: string): Promise<void> {
  const normalizedWorkflowId = workflowId.trim()
  if (normalizedWorkflowId.length === 0) return
  try {
    await ElMessageBox.confirm(`确定删除工作流设计稿 ${normalizedWorkflowId}？`, '删除设计稿', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
    await deleteWorkflowDesign(normalizedWorkflowId)
    if (currentWorkflowId.value === normalizedWorkflowId) {
      currentWorkflowId.value = ''
      currentFilename.value = ''
      currentTimestamp.value = ''
      currentDocument.value = null
      selectedNodeKey.value = ''
      selectedLineKey.value = ''
      resetDefinitionEditor()
    }
    await loadDesigns()
    ElMessage.success('设计稿已删除')
  } catch (error: unknown) {
    if (error !== 'cancel') ElMessage.error(`删除失败: ${errorMessage(error)}`)
  }
}

function openNodeCreateDialog(graphView: WorkflowDesignGraphView, nodeKind: WorkflowDesignNodeCreateKind): void {
  if (editorDirty.value && !applySelectedDraft({ silent: false })) return
  nodeCreateForm.value = {
    graphKey: graphView.key,
    nodeKind,
    id: defaultCreateNodeId(nodeKind),
    title: defaultCreateNodeTitle(nodeKind),
    desc: '',
  }
  nodeCreateDialogVisible.value = true
}

function openNodeCreateDialogForCurrentGraph(): void {
  const graphView = currentMainGraphView.value
  if (graphView === null) return
  openNodeCreateDialog(graphView, 'node')
}

function syncNodeCreateKindDefaults(): void {
  const form = nodeCreateForm.value
  form.id = defaultCreateNodeId(form.nodeKind)
  form.title = defaultCreateNodeTitle(form.nodeKind)
}

function defaultCreateNodeId(nodeKind: WorkflowDesignNodeCreateKind): string {
  if (nodeKind === 'node') return 'node.model'
  if (nodeKind === 'start') return 'start'
  if (nodeKind === 'output') return 'output'
  return 'node.model'
}

function defaultCreateNodeTitle(nodeKind: WorkflowDesignNodeCreateKind): string {
  if (nodeKind === 'node') return 'Business Node'
  if (nodeKind === 'start') return 'Start'
  if (nodeKind === 'output') return 'Output'
  return 'Business Node'
}

function createNodeInSelectedGraph(): void {
  const document = currentDocument.value
  if (document === null) return
  const form = nodeCreateForm.value
  const graphView = graphViews.value.find(view => view.key === form.graphKey)
  if (graphView === undefined) {
    ElMessage.warning('请选择有效的 graph/subGraph')
    return
  }

  const node = createWorkflowDesignNode(graphView.graph, {
    nodeKind: form.nodeKind,
    id: form.id.trim(),
    title: form.title.trim(),
    desc: form.desc.trim(),
  })
  markWorkflowDesignDirty(document, `${graphView.scopePath}.nodes`)
  nodeCreateDialogVisible.value = false
  selectedLineKey.value = ''
  selectedNodeKey.value = `${graphView.scopePath}:${node.id}`
  ElMessage.success('节点已创建')
}

async function deleteSelectedNode(): Promise<void> {
  const view = selectedNode.value
  const document = currentDocument.value
  if (view === null || document === null) return
  if ((view.nodeType === 'start' || view.nodeType === 'output') && allNodes.value.filter(node => node.nodeType === view.nodeType).length <= 1) {
    ElMessage.warning('至少保留一个 start 和 output 节点')
    return
  }

  try {
    await ElMessageBox.confirm(`确定删除节点 ${view.title}？相关连线也会被删除。`, '删除节点', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }

  const result = removeWorkflowDesignNode(view.graph, view.id)
  if (!result.removed) return
  markWorkflowDesignDirty(document, `${view.scopePath}.nodes`)
  if (result.removedLines.length > 0) markWorkflowDesignDirty(document, `${view.scopePath}.lines`)
  selectedNodeKey.value = ''
  selectedLineKey.value = ''
  editorDirty.value = false
  ElMessage.success('节点已删除')
}

function startLayoutResize(event: PointerEvent, side: 'left' | 'right'): void {
  if (side === 'left' && leftPanelCollapsed.value) return
  layoutResizeState.value = {
    side,
    startClientX: event.clientX,
    startLeftWidth: leftPanelWidth.value,
    startRightWidth: rightPanelWidth.value,
  }
  window.document.addEventListener('pointermove', handleLayoutResizeMove)
  window.document.addEventListener('pointerup', stopLayoutResize, { once: true })
}

function handleLayoutResizeMove(event: PointerEvent): void {
  const state = layoutResizeState.value
  if (state === null) return
  const deltaX = event.clientX - state.startClientX
  if (state.side === 'left') {
    leftPanelWidth.value = Math.min(MAX_LEFT_PANEL_WIDTH, Math.max(MIN_LEFT_PANEL_WIDTH, Math.round(state.startLeftWidth + deltaX)))
  } else {
    rightPanelWidth.value = Math.min(MAX_RIGHT_PANEL_WIDTH, Math.max(MIN_RIGHT_PANEL_WIDTH, Math.round(state.startRightWidth - deltaX)))
  }
  event.preventDefault()
}

function stopLayoutResize(): void {
  window.document.removeEventListener('pointermove', handleLayoutResizeMove)
  window.document.removeEventListener('pointerup', stopLayoutResize)
  layoutResizeState.value = null
}

function normalizeGraphNavigation(): void {
  const root = rootGraphView.value
  if (root === null) {
    currentMainGraphKey.value = 'workflow.graph'
    currentChildGraphKey.value = ''
    return
  }
  if (!graphViews.value.some(view => view.key === currentMainGraphKey.value)) {
    currentMainGraphKey.value = root.key
  }
  normalizeChildGraphSelection()
}

function normalizeChildGraphSelection(): void {
  const children = mainChildGraphOptions.value
  if (children.length === 0) {
    currentChildGraphKey.value = ''
    graphSplitCollapsed.value = 'bottom'
    return
  }
  if (!children.some(view => view.key === currentChildGraphKey.value)) {
    currentChildGraphKey.value = children[0]?.key ?? ''
  }
  if (graphSplitCollapsed.value === 'bottom') graphSplitCollapsed.value = null
}

function syncChildGraphFromSelectedMainNode(): void {
  const selected = selectedNode.value
  const main = currentMainGraphView.value
  if (selected === null || main === null || selected.graph !== main.graph) return
  const child = mainChildGraphOptions.value.find(view => view.ownerNode === selected.node)
  currentChildGraphKey.value = child?.key ?? mainChildGraphOptions.value[0]?.key ?? ''
  if (currentChildGraphKey.value.length > 0 && graphSplitCollapsed.value === 'bottom') {
    graphSplitCollapsed.value = null
  }
}

function promoteChildGraphToMain(): void {
  const child = currentChildGraphView.value
  if (child === null) return
  currentMainGraphKey.value = child.key
  currentChildGraphKey.value = ''
  selectedLineKey.value = ''
  selectedNodeKey.value = child.graph.nodes[0] !== undefined ? `${child.scopePath}:${child.graph.nodes[0].id}` : ''
  normalizeChildGraphSelection()
}

function returnMainGraphToParent(): void {
  const main = currentMainGraphView.value
  const parent = currentMainParentGraphView.value
  if (main === null || parent === null) return
  currentMainGraphKey.value = parent.key
  currentChildGraphKey.value = main.key
  selectedLineKey.value = ''
  selectedNodeKey.value = main.ownerNodeId !== undefined ? `${parent.scopePath}:${main.ownerNodeId}` : ''
  if (graphSplitCollapsed.value === 'bottom') graphSplitCollapsed.value = null
}

function graphPanelTitle(panel: GraphSplitPanel): string {
  const graphView = panel.graphView
  if (graphView === null) return panel.role === 'main' ? 'Main Graph' : 'Child Graph'
  return panel.role === 'main' ? `Main / ${graphView.title}` : `Child / ${graphView.title}`
}

function startGraphSplitResize(event: PointerEvent): void {
  if (editorDirty.value && !applySelectedDraft({ silent: false })) return
  const currentTarget = event.currentTarget
  const shell = currentTarget instanceof HTMLElement ? currentTarget.closest('.graph-split') : null
  const rect = shell instanceof HTMLElement ? shell.getBoundingClientRect() : null
  graphSplitResizeState.value = {
    containerTop: rect?.top ?? 0,
    containerHeight: rect !== null && rect.height > 0 ? rect.height : 720,
    moved: false,
  }
  window.document.addEventListener('pointermove', handleGraphSplitResizeMove)
  window.document.addEventListener('pointerup', handleGraphSplitResizeEnd, { once: true })
}

function handleGraphSplitResizeMove(event: PointerEvent): void {
  const state = graphSplitResizeState.value
  if (state === null) return
  const rawRatio = ((event.clientY - state.containerTop) / state.containerHeight) * 100
  state.moved = true
  if (rawRatio <= GRAPH_SPLIT_SNAP_RATIO && currentChildGraphView.value !== null) {
    graphSplitCollapsed.value = 'top'
  } else if (rawRatio >= 100 - GRAPH_SPLIT_SNAP_RATIO) {
    graphSplitCollapsed.value = 'bottom'
  } else {
    graphSplitCollapsed.value = null
    graphSplitRatio.value = Math.min(
      GRAPH_SPLIT_MAX_RATIO,
      Math.max(GRAPH_SPLIT_MIN_RATIO, Math.round(rawRatio)),
    )
  }
  event.preventDefault()
}

function handleGraphSplitResizeEnd(): void {
  if (graphSplitResizeState.value?.moved === true) saveGraphSplitState()
  stopGraphSplitResize()
}

function stopGraphSplitResize(): void {
  window.document.removeEventListener('pointermove', handleGraphSplitResizeMove)
  window.document.removeEventListener('pointerup', handleGraphSplitResizeEnd)
  graphSplitResizeState.value = null
}

function collapseGraphSplit(side: Exclude<GraphSplitCollapse, null>): void {
  if (side === 'top' && currentChildGraphView.value === null) return
  graphSplitCollapsed.value = side
  saveGraphSplitState()
}

function resetGraphSplit(): void {
  graphSplitRatio.value = 48
  graphSplitCollapsed.value = currentChildGraphView.value === null ? 'bottom' : null
  saveGraphSplitState()
}

function loadGraphSplitState(workflowId: string): void {
  const raw = window.localStorage.getItem(graphSplitStorageKey(workflowId))
  if (raw === null) {
    graphSplitRatio.value = 48
    graphSplitCollapsed.value = null
    return
  }
  try {
    const value: unknown = JSON.parse(raw)
    if (!isJsonRecord(value)) throw new Error('Graph split state must be an object.')
    const ratio = value['ratio']
    graphSplitRatio.value = typeof ratio === 'number' && Number.isFinite(ratio)
      ? Math.min(GRAPH_SPLIT_MAX_RATIO, Math.max(GRAPH_SPLIT_MIN_RATIO, Math.round(ratio)))
      : 48
    const collapsed = value['collapsed']
    graphSplitCollapsed.value = collapsed === 'top' || collapsed === 'bottom' ? collapsed : null
  } catch {
    graphSplitRatio.value = 48
    graphSplitCollapsed.value = null
  }
}

function saveGraphSplitState(): void {
  if (currentWorkflowId.value.length === 0) return
  window.localStorage.setItem(graphSplitStorageKey(currentWorkflowId.value), JSON.stringify({
    ratio: graphSplitRatio.value,
    collapsed: graphSplitCollapsed.value,
  }))
}

function graphSplitStorageKey(workflowId: string): string {
  return `${GRAPH_SPLIT_STORAGE_PREFIX}${workflowId}`
}

function isWorkflowFlowNodeData(value: unknown): value is WorkflowFlowNodeData {
  return isJsonRecord(value)
    && typeof value['viewKey'] === 'string'
    && typeof value['title'] === 'string'
    && typeof value['nodeType'] === 'string'
    && typeof value['scopePath'] === 'string'
    && typeof value['isBusinessNode'] === 'boolean'
    && typeof value['isBoundaryNode'] === 'boolean'
    && typeof value['modelClassName'] === 'string'
    && typeof value['modelDocText'] === 'string'
    && typeof value['validationActionName'] === 'string'
    && typeof value['validationActionDocText'] === 'string'
}

function isWorkflowFlowLineData(value: unknown): value is WorkflowFlowLineData {
  return isJsonRecord(value) && typeof value['lineKey'] === 'string'
}

function readFlowConnectionLineFromEvent(value: unknown): Readonly<{ data: WorkflowFlowLineData }> | null {
  if (!isJsonRecord(value)) return null
  const linePayload = value['edge']
  if (
    !isJsonRecord(linePayload)
    || typeof linePayload['id'] !== 'string'
    || typeof linePayload['source'] !== 'string'
    || typeof linePayload['target'] !== 'string'
  ) {
    return null
  }
  const data = linePayload['data']
  if (!isWorkflowFlowLineData(data)) return null
  return {
    data,
  }
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function recordOrEmpty(value: unknown): Record<string, unknown> {
  return isJsonRecord(value) ? value : {}
}

function uniqueTexts(values: readonly unknown[]): string[] {
  const result: string[] = []
  for (const value of values) {
    if (typeof value !== 'string') continue
    const normalized = value.trim()
    if (normalized.length > 0 && !result.includes(normalized)) result.push(normalized)
  }
  return result
}

function nextStructuredEditorId(prefix: string): string {
  structuredEditorId += 1
  return `${prefix}.${structuredEditorId}`
}

function recordKeys(value: unknown): string[] {
  return isJsonRecord(value) ? Object.keys(value).filter(key => key.trim().length > 0) : []
}

function allStructuredRows(): StructuredFieldRow[] {
  return [
    ...businessInputRows.value,
    ...businessOutputRows.value,
    ...taskRequirementRows.value,
    ...taskContextInputRows.value,
    ...structuredResultRows.value,
    ...validationInputProjectionRows.value,
    ...validationExpectedResultRows.value,
    ...capabilityCards.value.flatMap(card => [...card.inputRows, ...card.outputRows]),
  ]
}

function structuredPathOptions(rows: readonly StructuredFieldRow[]): string[] {
  return uniqueTexts([...structuredBasePathOptions.value, ...rows.map(row => row.path)])
}

function structuredValueOptions(row: StructuredFieldRow): string[] {
  return uniqueTexts([row.valueText, ...structuredReferenceOptions.value])
}

function metadataValueText(value: unknown): string {
  if (value === undefined || value === null) return '-'
  if (typeof value === 'string') return value.length > 0 ? value : '-'
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.length === 0 ? '[]' : value.map(metadataValueText).join(', ')
  if (isJsonRecord(value)) return Object.entries(value).map(([key, child]) => `${key}: ${metadataValueText(child)}`).join('; ')
  return String(value)
}

function collectWorkflowMetadataRows(value: unknown, path: string, rows: WorkflowMetadataRow[]): void {
  if (isJsonRecord(value)) {
    const entries = Object.entries(value)
    if (entries.length === 0 && path.length > 0) rows.push({ label: path, value: '{}' })
    for (const [key, child] of entries) {
      collectWorkflowMetadataRows(child, path.length === 0 ? key : `${path}.${key}`, rows)
    }
    return
  }
  if (Array.isArray(value)) {
    if (value.length === 0 && path.length > 0) rows.push({ label: path, value: '[]' })
    for (const [index, child] of value.entries()) {
      collectWorkflowMetadataRows(child, `${path}.${index}`, rows)
    }
    return
  }
  if (path.length > 0) rows.push({ label: path, value: metadataValueText(value) })
}

function readWorkflowMetadataText(keys: readonly string[]): string {
  const document = currentDocument.value
  if (document === null) return ''
  const candidates: unknown[] = [
    document,
    document.x_spark,
    document.x_spark.designer,
    document.x_spark.draft,
    document.x_spark.history,
    document.x_spark.validation,
    currentDesignSummary.value,
  ]
  for (const candidate of candidates) {
    if (!isJsonRecord(candidate)) continue
    for (const key of keys) {
      const value = candidate[key]
      if (typeof value === 'string' && value.trim().length > 0) return value.trim()
      if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    }
  }
  return ''
}

function workflowVariableRowsFromData(value: unknown): WorkflowVariableEditorRow[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(isJsonRecord)
    .map((variable): WorkflowVariableEditorRow => {
      const schema = isJsonRecord(variable['schema']) ? { ...variable['schema'] } : {}
      const defaultValue = variable['defaultValue']
      const name = readTextField(variable, 'name')
      const title = readTextField(variable, 'title')
      return {
        id: name || nextStructuredEditorId('workflow.variable'),
        source: { ...variable },
        schema,
        name,
        title,
        docText: readWorkflowVariableSourceDocText(variable, schema),
        required: variable['required'] === true,
        schemaType: readTextField(schema, 'type') || 'string',
        defaultValue,
        defaultValueText: primitiveValueText(defaultValue),
        defaultValueEditable: isPrimitiveEditableValue(defaultValue),
      }
    })
}

function workflowVariableRowsToData(rows: readonly WorkflowVariableEditorRow[]): WorkflowDesignVariable[] {
  return rows
    .map((row): WorkflowDesignVariable | null => {
      const name = row.name.trim()
      if (name.length === 0) return null
      const variable: WorkflowDesignVariable = {
        ...row.source,
        name,
        title: row.title.trim(),
        required: row.required,
        schema: {
          ...row.schema,
          type: row.schemaType.trim() || 'string',
        },
      }
      if (row.defaultValueEditable) {
        const defaultText = row.defaultValueText.trim()
        if (defaultText.length > 0) variable.defaultValue = parseWorkflowVariableDefaultValue(defaultText, row.schemaType)
        else delete variable.defaultValue
      } else if (Object.prototype.hasOwnProperty.call(row.source, 'defaultValue')) {
        variable.defaultValue = row.defaultValue
      }
      return variable
    })
    .filter((variable): variable is WorkflowDesignVariable => variable !== null)
}

function primitiveValueText(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

function isPrimitiveEditableValue(value: unknown): boolean {
  return value === undefined || value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

function parseWorkflowVariableDefaultValue(value: string, schemaType: string): unknown {
  if (schemaType === 'boolean') return value === 'true'
  if (schemaType === 'number' || schemaType === 'integer') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : 0
  }
  return value
}

function workflowVariableDocText(row: WorkflowVariableEditorRow): string {
  return firstMeaningfulText([
    row.docText,
    workflowAttributeDocText(row.name),
  ], [row.name, row.title])
}

function workflowVariableDocTextByName(name: string): string {
  const variable = workflowVariableRows.value.find(row => row.name.trim() === name.trim())
  return variable === undefined ? '' : workflowVariableDocText(variable)
}

function workflowAttributeDocText(name: string): string {
  const attribute = workflowRootClassModelOption.value?.attributes.find(item => item.name === name.trim())
  return attribute === undefined ? '' : classModelDocText(attribute)
}

function workflowStructuredRowDocText(row: StructuredFieldRow): string {
  return firstMeaningfulText([
    workflowVariableDocTextByName(row.path),
    workflowAttributeDocText(row.path),
    workflowReferenceDocText(row.valueText),
  ], [row.path, row.valueText])
}

function workflowReferenceDocText(value: string): string {
  const trimmed = value.trim()
  const startMatch = /^\{\{\s*start\.([^.\s}]+)\s*\}\}$/u.exec(trimmed)
  if (startMatch !== null) return workflowVariableDocTextByName(startMatch[1] ?? '')
  const modelMatch = /^\$model\.([^.\s}]+)$/u.exec(trimmed)
  if (modelMatch !== null) return workflowAttributeDocText(modelMatch[1] ?? '')
  return ''
}

function readWorkflowVariableSourceDocText(variable: Record<string, unknown>, schema: Record<string, unknown>): string {
  return firstMeaningfulText([
    readTextField(variable, 'jsdoc'),
    readTextField(variable, 'description'),
    readTextField(variable, 'desc'),
    readTextField(schema, 'jsdoc'),
    readTextField(schema, 'description'),
    readTextField(schema, 'summary'),
  ], [
    readTextField(variable, 'name'),
    readTextField(variable, 'title'),
  ])
}

function firstMeaningfulText(values: readonly string[], duplicates: readonly string[]): string {
  const duplicateSet = new Set(duplicates.map(normalizeMeaningfulText).filter(value => value.length > 0))
  return values
    .map(value => value.trim())
    .find((value) => {
      if (value.length === 0) return false
      return !duplicateSet.has(normalizeMeaningfulText(value))
    }) ?? ''
}

function normalizeMeaningfulText(value: string): string {
  return value.trim().replace(/\s+/gu, ' ').toLocaleLowerCase()
}

function lineEndpointModelDocText(nodeId: string, modelId: string): string {
  const model = findLineEndpointClassModelOption(nodeId, modelId)
  if (model !== null) return classModelDocText(model)
  if (modelId.trim() === '$workflow') return workflowRootClassDocText.value
  return ''
}

function lineEndpointMemberDocText(nodeId: string, modelId: string, memberName: string): string {
  const trimmedMember = memberName.trim()
  if (trimmedMember.length === 0) return ''
  const node = selectedLineGraphNodes.value.find(item => item.id === nodeId)
  if (node?.isBoundaryNode === true || modelId.trim() === '$workflow') {
    return workflowVariableDocTextByName(trimmedMember)
  }
  const model = findLineEndpointClassModelOption(nodeId, modelId)
  if (model !== null) {
    const attribute = model.attributes.find(item => item.name === trimmedMember)
    if (attribute !== undefined) return classModelDocText(attribute)
    const method = model.methods.find(item => item.name === trimmedMember)
    if (method !== undefined) return classModelDocText(method)
  }
  return workflowReferenceDocText(`$model.${trimmedMember}`)
}

function findLineEndpointClassModelOption(nodeId: string, modelId: string): ClassModelOption | null {
  const node = selectedLineGraphNodes.value.find(item => item.id === nodeId)
  if (node === undefined) return null
  const models = Array.isArray(node.node.data?.models) ? node.node.data.models.filter(isJsonRecord) : []
  const selectedModel = models.find(model => readTextField(model, 'id') === modelId.trim())
  const className = selectedModel === undefined ? '' : readTextField(selectedModel, 'className') || readTextField(selectedModel, 'rootClassName')
  if (className.length === 0) return null
  return classModelOptions.value.find(item => item.kind === className) ?? null
}

function classModelDocTextByKind(className: string): string {
  const option = classModelOptions.value.find(item => item.kind === className.trim())
  return option === undefined ? '' : classModelDocText(option)
}

function classModelMemberDocText(className: string, memberName: string): string {
  const option = classModelOptions.value.find(item => item.kind === className.trim())
  if (option === undefined) return ''
  return classModelOptionMemberDocText(option, memberName)
}

function classModelOptionMemberDocText(option: ClassModelOption, memberName: string): string {
  const trimmedMember = memberName.trim()
  const attribute = option.attributes.find(item => item.name === trimmedMember)
  if (attribute !== undefined) return classModelDocText(attribute)
  const method = option.methods.find(item => item.name === trimmedMember)
  if (method !== undefined) return classModelDocText(method)
  return ''
}

function selectedModelAttributeDocText(name: string): string {
  const attribute = selectedClassModelOption.value?.attributes.find(item => item.name === name.trim())
  return attribute === undefined ? '' : classModelDocText(attribute)
}

function nodeStructuredRowPathDocText(row: StructuredFieldRow): string {
  return firstMeaningfulText([
    workflowVariableDocTextByName(row.path),
    selectedModelAttributeDocText(row.path),
  ], [row.path])
}

function nodeStructuredRowValueDocText(row: StructuredFieldRow): string {
  return firstMeaningfulText([
    nodeReferenceDocText(row.valueText),
  ], [row.valueText])
}

function nodeActionCardDocText(card: StructuredSelectCard): string {
  return firstMeaningfulText([
    classModelMemberDocText(validationActionClassText.value || modelClassText.value, card.value),
  ], [card.value])
}

function nodeAttributeCardDocText(card: StructuredSelectCard): string {
  return firstMeaningfulText([
    selectedModelAttributeDocText(card.value),
  ], [card.value])
}

function nodeReferenceDocText(value: string): string {
  const trimmed = value.trim()
  const modelMatch = /^\$model\.([^.\s}]+)$/u.exec(trimmed)
  if (modelMatch !== null) return selectedModelAttributeDocText(modelMatch[1] ?? '')
  const referenceMatch = /^\{\{\s*([^}]+?)\s*\}\}$/u.exec(trimmed)
  if (referenceMatch === null) return ''
  const body = (referenceMatch[1] ?? '').trim()
  const separatorIndex = body.lastIndexOf('.')
  if (separatorIndex <= 0 || separatorIndex >= body.length - 1) return ''
  const nodeId = body.slice(0, separatorIndex)
  const memberName = body.slice(separatorIndex + 1)
  const graph = selectedNode.value?.graph ?? selectedLine.value?.graph
  const node = graph?.nodes.find(item => item.id === nodeId)
  if (node === undefined) return ''
  return nodeMemberDocText(node, memberName)
}

function nodeMemberDocText(node: WorkflowDesignNodeView['node'], memberName: string): string {
  const nodeType = typeof node.data?.type === 'string' ? node.data.type : node.type
  if (nodeType === 'start') return workflowVariableDocTextByName(memberName)
  const option = classModelOptionForGraphNode(node)
  return option === null ? '' : classModelOptionMemberDocText(option, memberName)
}

function classModelOptionForGraphNode(node: WorkflowDesignNodeView['node']): ClassModelOption | null {
  const models = Array.isArray(node.data?.models) ? node.data.models.filter(isJsonRecord) : []
  const primaryModel = models[0]
  const className = primaryModel === undefined ? '' : readTextField(primaryModel, 'className') || readTextField(primaryModel, 'rootClassName')
  if (className.length === 0) return null
  return classModelOptions.value.find(item => item.kind === className) ?? null
}

function lineModelOptions(nodeId: string, currentValue: string): string[] {
  const node = selectedLineGraphNodes.value.find(item => item.id === nodeId)
  if (node === undefined || node.isBoundaryNode) return uniqueTexts([currentValue, '$workflow'])
  const data = node.node.data
  const models = Array.isArray(data?.models) ? data.models.filter(isJsonRecord) : []
  return uniqueTexts([
    currentValue,
    ...models.map(model => readTextField(model, 'id')),
  ])
}

function lineMemberOptions(nodeId: string, currentValue: string): string[] {
  const line = selectedLine.value
  const graph = line?.graph
  const node = graph?.nodes.find(item => item.id === nodeId)
  if (node === undefined) return uniqueTexts([currentValue])
  return uniqueTexts([currentValue, ...referenceMemberOptionsForNode(node)])
}

function referenceOptionsForNodeId(nodeId: string, graph: WorkflowDesignGraphView['graph']): string[] {
  const node = graph.nodes.find(item => item.id === nodeId)
  if (node === undefined) return []
  return referenceMemberOptionsForNode(node).map(member => `{{ ${node.id}.${member} }}`)
}

function referenceMemberOptionsForNode(node: WorkflowDesignNodeView['node']): string[] {
  const nodeType = typeof node.data?.type === 'string' ? node.data.type : node.type
  if (nodeType === 'start') {
    return workflowVariableOptions.value
  }
  if (nodeType === 'output') {
    return recordKeys(node.data?.outputs)
  }
  return uniqueTexts([
    ...recordKeys(node.data?.outputs),
    ...modelAttributeOptions.value,
  ])
}

function structuredRowsFromRecord(value: unknown, prefix: string): StructuredFieldRow[] {
  if (!isJsonRecord(value)) return []
  const rows: StructuredFieldRow[] = []
  collectStructuredRows({ value, path: '', rows, prefix })
  return rows
}

function collectStructuredRows(command: StructuredRowsCollectionCommand): void {
  const { value, path, rows, prefix } = command
  if (isJsonRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      collectStructuredRows({
        value: child,
        path: path.length === 0 ? key : `${path}.${key}`,
        rows,
        prefix,
      })
    }
    return
  }
  if (Array.isArray(value)) {
    for (const [index, child] of value.entries()) {
      collectStructuredRows({
        value: child,
        path: path.length === 0 ? String(index) : `${path}.${index}`,
        rows,
        prefix,
      })
    }
    return
  }
  rows.push(structuredRowFromValue(path, value, prefix))
}

function structuredRowFromValue(path: string, value: unknown, prefix: string): StructuredFieldRow {
  if (typeof value === 'boolean') {
    return {
      id: nextStructuredEditorId(prefix),
      path,
      valueKind: 'boolean',
      valueText: '',
      valueBoolean: value,
    }
  }
  if (typeof value === 'number') {
    return {
      id: nextStructuredEditorId(prefix),
      path,
      valueKind: 'number',
      valueText: Number.isFinite(value) ? String(value) : '0',
      valueBoolean: false,
    }
  }
  const text = typeof value === 'string' ? value : String(value ?? '')
  return {
    id: nextStructuredEditorId(prefix),
    path,
    valueKind: text.includes('{{') || text.startsWith('$') ? 'reference' : 'text',
    valueText: text,
    valueBoolean: false,
  }
}

function structuredRowsToRecord(rows: readonly StructuredFieldRow[]): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const row of rows) {
    const path = row.path.trim()
    if (path.length === 0) continue
    assignStructuredPath(result, path.split('.'), structuredRowValue(row))
  }
  return result
}

function structuredRowValue(row: StructuredFieldRow): unknown {
  if (row.valueKind === 'boolean') return row.valueBoolean
  if (row.valueKind === 'number') {
    const value = Number(row.valueText)
    return Number.isFinite(value) ? value : 0
  }
  return row.valueText
}

function assignStructuredPath(target: Record<string, unknown>, parts: string[], value: unknown): void {
  let cursor = target
  for (const [index, part] of parts.entries()) {
    if (part.length === 0) return
    if (index === parts.length - 1) {
      cursor[part] = value
      return
    }
    const existing = cursor[part]
    if (isJsonRecord(existing)) {
      cursor = existing
    } else {
      const created: Record<string, unknown> = {}
      cursor[part] = created
      cursor = created
    }
  }
}

function structuredCardsFromStrings(value: unknown, prefix: string): StructuredSelectCard[] {
  return Array.isArray(value)
    ? value
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .map(item => ({ id: nextStructuredEditorId(prefix), value: item.trim() }))
    : []
}

function structuredCardsToStrings(cards: readonly StructuredSelectCard[]): string[] {
  return uniqueTexts(cards.map(card => card.value))
}

function capabilityCardsFromData(value: unknown): StructuredCapabilityCard[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(isJsonRecord)
    .map((capability): StructuredCapabilityCard => ({
      id: readTextField(capability, 'id') || nextStructuredEditorId('capability'),
      title: readTextField(capability, 'title'),
      scope: readTextField(capability, 'scope') || 'node',
      description: readTextField(capability, 'description'),
      inputRows: structuredRowsFromRecord(capability['inputs'], 'capability.input'),
      outputRows: structuredRowsFromRecord(capability['outputs'], 'capability.output'),
      constraintCards: structuredCardsFromStrings(capability['constraints'], 'capability.constraint'),
    }))
}

function capabilityCardsToData(cards: readonly StructuredCapabilityCard[]): WorkflowDesignCapability[] {
  return cards.map(card => ({
    id: card.id,
    title: card.title,
    scope: card.scope,
    description: card.description,
    inputs: structuredRowsToRecord(card.inputRows),
    outputs: structuredRowsToRecord(card.outputRows),
    constraints: structuredCardsToStrings(card.constraintCards),
  }))
}

function dockHandle(dock: number): string {
  return `dock-${dock}`
}

function dockFromHandle(handle: string | null | undefined): number | undefined {
  if (typeof handle !== 'string' || handle.trim().length === 0) return undefined
  const match = /^dock-(\d+)$/u.exec(handle.trim())
  if (match !== null) return Number(match[1])
  const parsed = Number(handle)
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 12 ? parsed : undefined
}

function readDockText(dock: unknown): string {
  return typeof dock === 'number' && Number.isInteger(dock) && dock >= 0 && dock <= 12 ? String(dock) : '0'
}

function parseDockText(value: string): number | undefined {
  const text = value.trim()
  if (text.length === 0) return 0
  const parsed = Number(text)
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 12 ? parsed : undefined
}

function withConnectionEndpoint(
  endpoint: WorkflowDesignLineEndpoint,
  nodeId: string,
  handle: string | null | undefined,
): WorkflowDesignLineEndpoint {
  const { dock: _dock, ...rest } = endpoint
  const dock = dockFromHandle(handle)
  return {
    ...rest,
    nodeId,
    modelId: rest.modelId.trim().length > 0 ? rest.modelId : '$workflow',
    memberName: rest.memberName.trim().length > 0 ? rest.memberName : 'value',
    dock: dock ?? 0,
  }
}

function lineViewKey(graphView: WorkflowDesignGraphView, line: WorkflowDesignLineView['line']): string {
  const view = lineViews.value.find(item => item.graph === graphView.graph && item.line === line)
  if (view !== undefined) return view.key
  const index = graphView.graph.lines.indexOf(line)
  return `${graphView.scopePath}:line:${line.id ?? index}`
}

function createEditorLineEndpoint(command: EditorLineEndpointCommand): WorkflowDesignLineEndpoint {
  const { nodeId, modelId, memberName, dockText } = command
  const dock = parseDockText(dockText)
  return {
    nodeId,
    modelId,
    memberName,
    dock: dock ?? 0,
  }
}

function isSameLineEndpoint(left: WorkflowDesignLineEndpoint, right: WorkflowDesignLineEndpoint): boolean {
  return left.nodeId === right.nodeId
    && left.modelId === right.modelId
    && left.memberName === right.memberName
    && (left.dock ?? 0) === (right.dock ?? 0)
}

function selectNode(key: string): void {
  if (key === selectedNodeKey.value) return
  if (editorDirty.value && !applySelectedDraft({ silent: false })) return
  selectedLineKey.value = ''
  selectedNodeKey.value = key
}

function selectLine(key: string): void {
  if (editorDirty.value && !applySelectedDraft({ silent: false })) return
  selectedNodeKey.value = ''
  selectedControlPoint.value = null
  selectedLineKey.value = key
}

function openNodeEditor(key: string): void {
  selectNode(key)
  if (selectedNodeKey.value === key) openPropertiesDrawer()
}

function openLineEditor(key: string): void {
  selectLine(key)
  if (selectedLineKey.value === key) openPropertiesDrawer()
}

function selectedNodeInGraph(graphView: WorkflowDesignGraphView | null): boolean {
  const node = selectedNode.value
  return graphView !== null && node !== null && node.graph === graphView.graph
}

function openWorkflowPropertiesDrawer(): void {
  if (currentDocument.value === null) return
  propertiesDrawerTarget.value = 'workflow'
  syncWorkflowEditorFromDocument()
  propertiesDrawerVisible.value = true
  ensureWorkflowClassModelKnowledge()
}

function openPropertiesDrawer(): void {
  if (selectedNode.value === null && selectedLine.value === null) return
  propertiesDrawerTarget.value = selectedLine.value !== null ? 'line' : 'node'
  if (propertiesDrawerTarget.value === 'line') syncLineEditorFromSelected()
  else syncEditorFromSelected()
  propertiesDrawerVisible.value = true
  if (selectedNode.value?.isBusinessNode === true && classModelOptions.value.length === 0) {
    void refreshClassModelOptions()
  }
}

function openClassModelDrawer(): void {
  if (activeClassModelDrawerOption.value === null) return
  classModelDrawerVisible.value = true
}

function handleLineEditorChange(): void {
  void applyLineEditorToSelected({ silent: true })
}

function nodesForGraph(graphView: WorkflowDesignGraphView): WorkflowDesignNodeView[] {
  return allNodes.value.filter(node => node.graph === graphView.graph)
}

function linesForGraph(graphView: WorkflowDesignGraphView): WorkflowDesignLineView[] {
  return lineViews.value.filter(line => line.graph === graphView.graph)
}

function flowId(graphView: WorkflowDesignGraphView): string {
  return `workflow-flow-${graphView.key.replace(/[^\w-]/gu, '-')}`
}

function flowNodesForGraph(graphView: WorkflowDesignGraphView): WorkflowFlowNode[] {
  return nodesForGraph(graphView).map((view) => {
    return {
      id: view.id,
      type: 'workflow',
      position: { x: view.node.position?.x ?? 0, y: view.node.position?.y ?? 0 },
      targetPosition: Position.Top,
      sourcePosition: Position.Bottom,
      data: {
        viewKey: view.key,
        title: view.title,
        nodeType: view.nodeType,
        scopePath: view.scopePath,
        isBusinessNode: view.isBusinessNode,
        isBoundaryNode: view.isBoundaryNode,
        modelClassName: readBusinessNodeModelClassName(view),
        modelDocText: readBusinessNodeModelDocText(view),
        validationActionName: readBusinessNodeValidationActionName(view),
        validationActionDocText: readBusinessNodeValidationActionDocText(view),
      },
    }
  })
}

function flowConnectionsForGraph(graphView: WorkflowDesignGraphView): WorkflowFlowConnection[] {
  return linesForGraph(graphView).map((line) => {
    const docks = resolvedLineDocks(line)
    return {
      id: workflowFlowConnectionId(line),
      type: 'workflow-control',
      source: line.from.nodeId,
      target: line.to.nodeId,
      sourceHandle: dockHandle(docks.source),
      targetHandle: dockHandle(docks.target),
      markerEnd: MarkerType.ArrowClosed,
      data: {
        lineKey: line.key,
        lineType: workflowDesignLineType(line.line),
        controlPoints: workflowDesignLineControlPoints(line.line),
        runtimeStatus: lineRuntimeStatuses.value[line.key] ?? 'idle',
      },
    }
  })
}

function resolvedLineDocks(line: WorkflowDesignLineView): Readonly<{ source: number; target: number }> {
  const sourceCandidates = outputDockDefinitions.map(dock => dock.id)
  const targetCandidates = inputDockDefinitions.map(dock => dock.id)
  const fixedSource = sourceCandidates.includes(line.from.dock ?? 0) ? line.from.dock : undefined
  const fixedTarget = targetCandidates.includes(line.to.dock ?? 0) ? line.to.dock : undefined
  const sources = fixedSource === undefined ? sourceCandidates : [fixedSource]
  const targets = fixedTarget === undefined ? targetCandidates : [fixedTarget]
  let best = { source: sources[0] ?? 5, target: targets[0] ?? 2, distance: Number.POSITIVE_INFINITY }
  for (const source of sources) {
    for (const target of targets) {
      const sourcePoint = workflowDockPoint(line.fromNode, source)
      const targetPoint = workflowDockPoint(line.toNode, target)
      const distance = Math.hypot(sourcePoint.x - targetPoint.x, sourcePoint.y - targetPoint.y)
      if (distance < best.distance) best = { source, target, distance }
    }
  }
  return { source: best.source, target: best.target }
}

function workflowDockPoint(node: WorkflowDesignLineView['fromNode'], dock: number): WorkflowDesignLineControlPoint {
  const x = node?.position?.x ?? 0
  const y = node?.position?.y ?? 0
  const quarterX = WORKFLOW_NODE_WIDTH / 4
  const quarterY = WORKFLOW_NODE_HEIGHT / 4
  if (dock >= 1 && dock <= 3) return { x: x + quarterX * dock, y }
  if (dock >= 4 && dock <= 6) return { x: x + WORKFLOW_NODE_WIDTH, y: y + quarterY * (dock - 3) }
  if (dock >= 7 && dock <= 9) return { x: x + quarterX * (10 - dock), y: y + WORKFLOW_NODE_HEIGHT }
  return { x, y: y + quarterY * (dock - 9) }
}

function workflowControlEdgePath(edge: WorkflowControlEdgeSlot): string {
  const points = [
    { x: edge.sourceX, y: edge.sourceY },
    ...edge.data.controlPoints,
    { x: edge.targetX, y: edge.targetY },
  ]
  if (edge.data.lineType === 'straight') return polylinePath(points)
  if (edge.data.lineType === 'bezier') return smoothControlPointPath(points)
  return orthogonalControlPointPath(points)
}

function polylinePath(points: readonly WorkflowDesignLineControlPoint[]): string {
  const first = points[0]
  if (first === undefined) return ''
  return `M ${first.x} ${first.y}${points.slice(1).map(point => ` L ${point.x} ${point.y}`).join('')}`
}

function orthogonalControlPointPath(points: readonly WorkflowDesignLineControlPoint[]): string {
  const first = points[0]
  if (first === undefined) return ''
  let path = `M ${first.x} ${first.y}`
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]
    const point = points[index]
    if (previous === undefined || point === undefined) continue
    const middleY = (previous.y + point.y) / 2
    path += ` L ${previous.x} ${middleY} L ${point.x} ${middleY} L ${point.x} ${point.y}`
  }
  return path
}

function smoothControlPointPath(points: readonly WorkflowDesignLineControlPoint[]): string {
  const first = points[0]
  if (first === undefined) return ''
  if (points.length < 3) {
    const last = points[points.length - 1]
    if (last === undefined) return ''
    const middleY = (first.y + last.y) / 2
    return `M ${first.x} ${first.y} C ${first.x} ${middleY}, ${last.x} ${middleY}, ${last.x} ${last.y}`
  }
  let path = `M ${first.x} ${first.y}`
  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index]
    const next = points[index + 1]
    if (point === undefined || next === undefined) continue
    path += ` Q ${point.x} ${point.y} ${(point.x + next.x) / 2} ${(point.y + next.y) / 2}`
  }
  const previous = points[points.length - 2]
  const last = points[points.length - 1]
  return previous === undefined || last === undefined ? path : `${path} Q ${previous.x} ${previous.y} ${last.x} ${last.y}`
}

function workflowEdgeStatusPoint(edge: WorkflowControlEdgeSlot): WorkflowDesignLineControlPoint {
  const middle = edge.data.controlPoints[Math.floor(edge.data.controlPoints.length / 2)]
  return middle ?? { x: (edge.sourceX + edge.targetX) / 2, y: (edge.sourceY + edge.targetY) / 2 }
}

function workflowRuntimeStatusIcon(status: WorkflowLineRuntimeStatus): string {
  if (status === 'running') return '▶'
  if (status === 'completed') return '✓'
  if (status === 'failed') return '!'
  if (status === 'skipped') return '–'
  return ''
}

function setWorkflowLineRuntimeStatus(lineIdOrKey: string, status: WorkflowLineRuntimeStatus): boolean {
  const line = lineViews.value.find(item => item.key === lineIdOrKey || item.id === lineIdOrKey)
  if (line === undefined) return false
  lineRuntimeStatuses.value = {
    ...lineRuntimeStatuses.value,
    [line.key]: status,
  }
  return true
}

defineExpose({ setWorkflowLineRuntimeStatus })

function applySelectedLineVisualType(): void {
  const line = selectedLine.value
  const document = currentDocument.value
  if (line === null || document === null) return
  updateWorkflowDesignLine(line.line, { lineType: lineVisualTypeText.value })
  markWorkflowDesignDirty(document, `${line.scopePath}.lines`)
}

function clearSelectedLineControlPoints(): void {
  const line = selectedLine.value
  const document = currentDocument.value
  if (line === null || document === null) return
  updateWorkflowDesignLine(line.line, { controlPoints: [] })
  selectedControlPoint.value = null
  markWorkflowDesignDirty(document, `${line.scopePath}.lines`)
}

function isSelectedControlPoint(lineKey: string, index: string | number): boolean {
  const selected = selectedControlPoint.value
  return selected !== null && selected.lineKey === lineKey && selected.index === Number(index)
}

function selectControlPoint(lineKey: string, index: string | number): void {
  selectLine(lineKey)
  selectedControlPoint.value = { lineKey, index: Number(index) }
}

function addLineControlPoint(event: MouseEvent, data: WorkflowFlowLineData, graphView: WorkflowDesignGraphView): void {
  const line = lineViews.value.find(item => item.key === data.lineKey && item.graph === graphView.graph)
  const svg = event.currentTarget instanceof SVGElement ? event.currentTarget.ownerSVGElement : null
  const document = currentDocument.value
  if (line === undefined || svg === null || document === null) return
  const rect = svg.getBoundingClientRect()
  const viewport = graphView.graph.viewport
  const zoom = viewport?.zoom ?? 1
  const point = {
    x: Math.round((event.clientX - rect.left - (viewport?.x ?? 0)) / zoom),
    y: Math.round((event.clientY - rect.top - (viewport?.y ?? 0)) / zoom),
  }
  const points = [...workflowDesignLineControlPoints(line.line)]
  const docks = resolvedLineDocks(line)
  const anchors = [workflowDockPoint(line.fromNode, docks.source), ...points, workflowDockPoint(line.toNode, docks.target)]
  const insertIndex = nearestLineSegmentIndex(anchors, point)
  points.splice(insertIndex, 0, point)
  updateWorkflowDesignLine(line.line, { controlPoints: points })
  selectControlPoint(line.key, insertIndex)
  markWorkflowDesignDirty(document, `${line.scopePath}.lines`)
}

function nearestLineSegmentIndex(
  points: readonly WorkflowDesignLineControlPoint[],
  point: WorkflowDesignLineControlPoint,
): number {
  let bestIndex = 0
  let bestDistance = Number.POSITIVE_INFINITY
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index]
    const end = points[index + 1]
    if (start === undefined || end === undefined) continue
    const distance = pointToLineSegmentDistance(point, start, end)
    if (distance < bestDistance) {
      bestDistance = distance
      bestIndex = index
    }
  }
  return bestIndex
}

function pointToLineSegmentDistance(
  point: WorkflowDesignLineControlPoint,
  start: WorkflowDesignLineControlPoint,
  end: WorkflowDesignLineControlPoint,
): number {
  const dx = end.x - start.x
  const dy = end.y - start.y
  if (dx === 0 && dy === 0) return Math.hypot(point.x - start.x, point.y - start.y)
  const ratio = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)))
  return Math.hypot(point.x - (start.x + ratio * dx), point.y - (start.y + ratio * dy))
}

function startControlPointDrag(command: StartControlPointDragCommand): void {
  const { event, data, index, graphView } = command
  const pointIndex = Number(index)
  const point = data.controlPoints[pointIndex]
  if (point === undefined) return
  selectControlPoint(data.lineKey, pointIndex)
  controlPointDragState.value = {
    lineKey: data.lineKey,
    index: pointIndex,
    graph: graphView.graph,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startPoint: point,
  }
  window.addEventListener('pointermove', moveControlPoint)
  window.addEventListener('pointerup', stopControlPointDrag, { once: true })
}

function moveControlPoint(event: PointerEvent): void {
  const drag = controlPointDragState.value
  const document = currentDocument.value
  const line = drag === null ? undefined : lineViews.value.find(item => item.key === drag.lineKey && item.graph === drag.graph)
  if (drag === null || line === undefined || document === null) return
  const zoom = line.graph.viewport?.zoom ?? 1
  const points = [...workflowDesignLineControlPoints(line.line)]
  points[drag.index] = {
    x: Math.round(drag.startPoint.x + (event.clientX - drag.startClientX) / zoom),
    y: Math.round(drag.startPoint.y + (event.clientY - drag.startClientY) / zoom),
  }
  updateWorkflowDesignLine(line.line, { controlPoints: points })
  markWorkflowDesignDirty(document, `${line.scopePath}.lines`)
}

function stopControlPointDrag(): void {
  controlPointDragState.value = null
  window.removeEventListener('pointermove', moveControlPoint)
}

function deleteLineControlPoint(lineKey: string, index: string | number): void {
  const line = lineViews.value.find(item => item.key === lineKey)
  const document = currentDocument.value
  if (line === undefined || document === null) return
  const points = [...workflowDesignLineControlPoints(line.line)]
  const pointIndex = Number(index)
  if (pointIndex < 0 || pointIndex >= points.length) return
  points.splice(pointIndex, 1)
  updateWorkflowDesignLine(line.line, { controlPoints: points })
  selectedControlPoint.value = null
  markWorkflowDesignDirty(document, `${line.scopePath}.lines`)
}

function handleControlPointDeleteKey(event: KeyboardEvent): void {
  const selected = selectedControlPoint.value
  if (selected === null || isEditableKeyboardTarget(event.target)) return
  if (event.key !== 'Delete' && event.key !== 'Backspace') return
  event.preventDefault()
  deleteLineControlPoint(selected.lineKey, selected.index)
}

function flowDefaultViewport(graphView: WorkflowDesignGraphView): ViewportTransform {
  const vp = graphView.graph.viewport
  return {
    x: vp?.x ?? 0,
    y: vp?.y ?? 0,
    zoom: vp?.zoom ?? 1,
  }
}

function handlePanelFlowNodesChange(changes: NodeChange[], graphView: WorkflowDesignGraphView | null): void {
  if (graphView === null) return
  handleFlowNodesChange(changes, graphView)
}

function handlePanelFlowLineChanges(changes: VueFlowLineChange[], graphView: WorkflowDesignGraphView | null): void {
  if (graphView === null) return
  handleFlowLineChanges(changes, graphView)
}

function handlePanelFlowLineDoubleClick(event: unknown, graphView: WorkflowDesignGraphView | null): void {
  if (graphView === null) return
  const connection = readFlowConnectionLineFromEvent(event)
  const lineData = connection?.data
  if (!isWorkflowFlowLineData(lineData)) return
  const line = lineViews.value.find(item => item.key === lineData.lineKey)
  if (line !== undefined && line.graph === graphView.graph) openLineEditor(line.key)
}

function handlePanelFlowLineUpdate(event: VueFlowLineUpdateEvent, graphView: WorkflowDesignGraphView | null): void {
  if (graphView === null) return
  handleFlowLineUpdate(event, graphView)
}

function handlePanelFlowConnect(connection: Connection, graphView: WorkflowDesignGraphView | null): void {
  if (graphView === null) return
  handleFlowConnect(connection, graphView)
}

function handlePanelFlowViewportChangeEnd(
  viewport: ViewportTransform,
  graphView: WorkflowDesignGraphView | null,
): void {
  if (graphView === null) return
  handleFlowViewportChangeEnd(viewport, graphView)
}

function handleFlowNodesChange(changes: NodeChange[], graphView: WorkflowDesignGraphView): void {
  for (const change of changes) {
    if (change.type === 'select') {
      if (change.selected) {
        selectNode(`${graphView.scopePath}:${change.id}`)
      } else if (selectedNodeKey.value === `${graphView.scopePath}:${change.id}`) {
        selectedNodeKey.value = ''
      }
    }
  }
}

function handleFlowLineChanges(changes: VueFlowLineChange[], graphView: WorkflowDesignGraphView): void {
  for (const change of changes) {
    if (change.type === 'select' && typeof change.id === 'string') {
      if (change.selected) {
        const lineView = workflowLineViewForFlowConnectionId(graphView, change.id)
        if (lineView) selectLine(lineView.key)
      } else {
        const lineView = selectedLine.value
        const selectedFlowConnectionId = lineView === null ? '' : workflowFlowConnectionId(lineView)
        if (selectedFlowConnectionId === change.id && lineView?.graph === graphView.graph) selectedLineKey.value = ''
      }
    }
  }
}

function workflowLineViewForFlowConnectionId(
  graphView: WorkflowDesignGraphView,
  connectionId: string,
): WorkflowDesignLineView | undefined {
  return lineViews.value.find(line => line.graph === graphView.graph && workflowFlowConnectionId(line) === connectionId)
}

function workflowFlowConnectionId(line: WorkflowDesignLineView): string {
  return line.key
}

function handleFlowViewportChangeEnd(viewport: ViewportTransform, graphView: WorkflowDesignGraphView): void {
  const document = currentDocument.value
  if (document === null) return
  graphView.graph.viewport ??= {}
  graphView.graph.viewport.x = Math.round(viewport.x)
  graphView.graph.viewport.y = Math.round(viewport.y)
  graphView.graph.viewport.zoom = Math.round(viewport.zoom * 100) / 100
  markWorkflowDesignDirty(document, `${graphView.scopePath}.viewport`)
}

function handleFlowNodeDragStop(event: NodeDragEvent): void {
  const data = event.node.data
  if (!isWorkflowFlowNodeData(data)) return
  const view = allNodes.value.find(node => node.key === data.viewKey)
  const document = currentDocument.value
  if (view === undefined || document === null) return

  view.node.position ??= {}
  view.node.position.x = Math.max(0, Math.round(event.node.position.x / 10) * 10)
  view.node.position.y = Math.max(0, Math.round(event.node.position.y / 10) * 10)
  markWorkflowDesignDirty(document, `${view.scopePath}.${view.id}.position`)
}

function handleNodeKeyboardMove(event: KeyboardEvent): void {
  const delta = nodeKeyboardMoveDelta(event)
  if (delta === null || isEditableKeyboardTarget(event.target)) return
  const view = selectedNode.value
  if (view === null || currentDocument.value === null) return
  if (editorDirty.value && !applySelectedDraft({ silent: true })) return
  event.preventDefault()
  const currentX = view.node.position?.x ?? 0
  const currentY = view.node.position?.y ?? 0
  applyNodePosition(
    Math.max(0, currentX + delta.x),
    Math.max(0, currentY + delta.y),
  )
}

function nodeKeyboardMoveDelta(event: KeyboardEvent): { x: number; y: number } | null {
  const step = event.shiftKey ? NODE_KEYBOARD_FAST_MOVE_STEP : NODE_KEYBOARD_MOVE_STEP
  if (event.key === 'ArrowLeft') return { x: -step, y: 0 }
  if (event.key === 'ArrowRight') return { x: step, y: 0 }
  if (event.key === 'ArrowUp') return { x: 0, y: -step }
  if (event.key === 'ArrowDown') return { x: 0, y: step }
  return null
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.closest('input, textarea, select, button, [contenteditable="true"]') !== null
}

function handleFlowConnect(connection: Connection, graphView: WorkflowDesignGraphView): void {
  const document = currentDocument.value
  if (document === null) return
  const fromNodeId = connection.source.trim()
  const toNodeId = connection.target.trim()
  if (fromNodeId.length === 0 || toNodeId.length === 0) {
    ElMessage.warning('连线必须包含 From 和 To')
    return
  }
  if (fromNodeId === toNodeId) {
    ElMessage.warning('不能连接节点自身')
    return
  }

  const line = addWorkflowDesignLine(graphView.graph, fromNodeId, toNodeId)
  updateWorkflowDesignLine(line, {
    from: withConnectionEndpoint(line.from, fromNodeId, connection.sourceHandle),
    to: withConnectionEndpoint(line.to, toNodeId, connection.targetHandle),
  })
  markWorkflowDesignDirty(document, `${graphView.scopePath}.lines`)
  selectLine(lineViewKey(graphView, line))
  ElMessage.success('连线已创建')
}

function handleFlowLineUpdate(event: VueFlowLineUpdateEvent, graphView: WorkflowDesignGraphView): void {
  const document = currentDocument.value
  if (document === null) return
  const linePayload = event.edge
  const data = linePayload.data
  if (!isWorkflowFlowLineData(data)) return
  const line = lineViews.value.find(item => item.key === data.lineKey)
  if (line === undefined || line.graph !== graphView.graph) return

  const fromNodeId = event.connection.source.trim()
  const toNodeId = event.connection.target.trim()
  const from = withConnectionEndpoint(line.from, fromNodeId, event.connection.sourceHandle)
  const to = withConnectionEndpoint(line.to, toNodeId, event.connection.targetHandle)
  if (!validateLineEndpointPatch({ line, from, to, options: { silent: false } })) return

  updateWorkflowDesignLine(line.line, {
    from,
    to,
  })
  markWorkflowDesignDirty(document, `${line.scopePath}.lines`)
  editorDirty.value = false
  ElMessage.success('连线端点已更新')
  syncLineEditorFromSelected()
}

function deleteSelectedLine(): void {
  const line = selectedLine.value
  const document = currentDocument.value
  if (line === null || document === null) return
  if (!removeWorkflowDesignLine(line.graph, line.line)) return
  markWorkflowDesignDirty(document, `${line.scopePath}.lines`)
  selectedLineKey.value = ''
  ElMessage.success('连线已删除')
}

function validateLineEndpointPatch(command: LineEndpointPatchValidationCommand): boolean {
  const { line, from, to, options } = command
  const nodeIds = new Set(allNodes.value.filter(node => node.graph === line.graph).map(node => node.id))
  if (
    from.nodeId.length === 0
    || from.modelId.length === 0
    || from.memberName.length === 0
    || to.nodeId.length === 0
    || to.modelId.length === 0
    || to.memberName.length === 0
  ) {
    if (options.silent !== true) ElMessage.warning('连线必须填写 From/To 的 Node、Model 和 Member')
    return false
  }
  if (!nodeIds.has(from.nodeId) || !nodeIds.has(to.nodeId)) {
    if (options.silent !== true) ElMessage.warning('From/To Node 必须是当前 graph/subGraph 内的节点')
    return false
  }
  if (from.nodeId === to.nodeId) {
    if (options.silent !== true) ElMessage.warning('连线不能指向节点自身')
    return false
  }
  const duplicated = line.graph.lines.some(item => item !== line.line && isSameLineEndpoint(item.from, from) && isSameLineEndpoint(item.to, to))
  if (duplicated) {
    if (options.silent !== true) ElMessage.warning('同一 graph/subGraph 内已存在相同 From -> To 成员连线')
    return false
  }
  return true
}

function applyLineEditorToSelected(options: { silent?: boolean } = {}): boolean {
  const line = selectedLine.value
  const document = currentDocument.value
  if (line === null || document === null) return true

  const from = createEditorLineEndpoint({
    nodeId: String(lineFromNodeText.value ?? '').trim(),
    modelId: String(lineFromModelText.value ?? '').trim(),
    memberName: String(lineFromMemberText.value ?? '').trim(),
    dockText: lineFromDockText.value,
  })
  const to = createEditorLineEndpoint({
    nodeId: String(lineToNodeText.value ?? '').trim(),
    modelId: String(lineToModelText.value ?? '').trim(),
    memberName: String(lineToMemberText.value ?? '').trim(),
    dockText: lineToDockText.value,
  })
  if (!validateLineEndpointPatch({ line, from, to, options })) return false

  updateWorkflowDesignLine(line.line, {
    from,
    to,
    type: String(lineTypeText.value ?? '').trim() || 'custom',
    relation: String(lineRelationText.value ?? '').trim() || 'sequence',
  })
  markWorkflowDesignDirty(document, `${line.scopePath}.lines`)
  editorDirty.value = false
  if (options.silent !== true) ElMessage.success('连线已更新')
  return true
}

function markEditorDirty(): void {
  editorDirty.value = true
}

function clearBusinessNodeStructuredEditor(): void {
  businessInputRows.value = []
  businessOutputRows.value = []
  taskGoalText.value = ''
  taskRequirementRows.value = []
  taskContextInputRows.value = []
  allowedActionCards.value = []
  readableAttributeCards.value = []
  functionCallingModeText.value = 'freeWithinModelContext'
  functionCallingConstraintCards.value = []
  structuredResultRows.value = []
  handoffToValidationValue.value = true
  validationInputProjectionRows.value = []
  validationExpectedResultRows.value = []
  validationStatusText.value = ''
  capabilityCards.value = []
  runtimeStatePreview.value = '{}'
  runtimeResultPreview.value = '{}'
  validationIssuesPreview.value = '[]'
}

function syncEditorFromSelected(): void {
  const view = selectedNode.value
  editorDirty.value = false
  if (view === null) {
    nodeTypeText.value = ''
    nodeTitleText.value = ''
    nodeDescText.value = ''
    modelJsonText.value = '{}'
    modelRootClassText.value = ''
    modelClassText.value = ''
    validationActionClassText.value = ''
    validationActionNameText.value = ''
    classModelError.value = ''
    classModelGuideText.value = ''
    loopModeText.value = ''
    loopMaxCountValue.value = 10
    loopExitNodeText.value = ''
    clearBusinessNodeStructuredEditor()
    return
  }
  nodeTypeText.value = view.nodeType
  nodeTitleText.value = view.title
  nodeDescText.value = typeof view.node.data?.desc === 'string' ? view.node.data.desc : ''
  modelJsonText.value = shouldEditNodeConfig(view) ? formatJson(view.node.data ?? {}) : '{}'
  syncBusinessModelEditorFromSelected(view)
  syncBusinessNodeStructuredEditorFromSelected(view)
  const loop = view.node.data?.loop
  loopModeText.value = typeof loop?.mode === 'string' && loop.mode.length > 0 ? loop.mode : 'progressive'
  loopMaxCountValue.value = typeof loop?.maxLoopCount === 'number' && Number.isFinite(loop.maxLoopCount) ? loop.maxLoopCount : 1
  const exitNodeId = typeof loop?.exitNodeId === 'string' && loop.exitNodeId.length > 0 ? loop.exitNodeId : '-'
  loopExitNodeText.value = exitNodeId === '-' ? '' : exitNodeId
}

function syncLineEditorFromSelected(): void {
  const line = selectedLine.value
  editorDirty.value = false
  if (line === null) {
    lineFromNodeText.value = ''
    lineFromModelText.value = ''
    lineFromMemberText.value = ''
    lineToNodeText.value = ''
    lineToModelText.value = ''
    lineToMemberText.value = ''
    lineTypeText.value = ''
    lineFromDockText.value = ''
    lineToDockText.value = ''
    lineRelationText.value = ''
    lineVisualTypeText.value = 'orthogonal'
    return
  }
  lineFromNodeText.value = line.from.nodeId
  lineFromModelText.value = line.from.modelId
  lineFromMemberText.value = line.from.memberName
  lineToNodeText.value = line.to.nodeId
  lineToModelText.value = line.to.modelId
  lineToMemberText.value = line.to.memberName
  lineTypeText.value = typeof line.line.type === 'string' ? line.line.type : 'custom'
  lineFromDockText.value = readDockText(line.from.dock)
  lineToDockText.value = readDockText(line.to.dock)
  const relation = line.line.data?.['relation']
  lineRelationText.value = typeof relation === 'string' ? relation : 'sequence'
  lineVisualTypeText.value = workflowDesignLineType(line.line)
}

function syncWorkflowEditorFromDocument(): void {
  const document = currentDocument.value
  editorDirty.value = false
  if (document === null) {
    workflowDesignerTitleText.value = ''
    workflowVersionValue.value = 1
    workflowVariableRows.value = []
    workflowCapabilityCards.value = []
    workflowRuntimeAliasText.value = ''
    workflowRuntimeModuleIdText.value = ''
    workflowRuntimeBusinessIdText.value = ''
    workflowIdentityFieldText.value = ''
    workflowMessageFieldText.value = ''
    workflowSystemPromptTemplateText.value = ''
    workflowModelProjectionKindText.value = 'dts-class-model'
    workflowRootClassText.value = ''
    workflowManifestUrlRefText.value = ''
    workflowExecutableKindText.value = 'js-module'
    workflowExecutableModuleSpecifierText.value = ''
    workflowExecutableExportNameText.value = ''
    workflowResolveEditorSourceText.value = ''
    workflowResolveIdentityFieldText.value = ''
    workflowAgentCompleteMethodText.value = ''
    workflowReadonlyStepCards.value = []
    workflowExecutionToolCards.value = []
    workflowPlanMarkerCards.value = []
    return
  }

  const workflow = document.workflow
  const binding = recordOrEmpty(workflow.runtimeBinding)
  const registration = recordOrEmpty(binding['registration'])
  const inputContract = recordOrEmpty(binding['inputContract'])
  const systemPrompt = recordOrEmpty(binding['systemPrompt'])
  const modelProjectionRef = recordOrEmpty(binding['modelProjectionRef'])
  const executableRef = recordOrEmpty(binding['executableRef'])
  const resolveInstance = recordOrEmpty(binding['resolveInstance'])

  workflowDesignerTitleText.value = readTextField(document.x_spark.designer, 'title')
    || currentDesignSummary.value?.title
    || workflow.id
  workflowVersionValue.value = typeof workflow.version === 'number' && Number.isFinite(workflow.version) ? workflow.version : 1
  workflowVariableRows.value = workflowVariableRowsFromData(workflow.variables)
  workflowCapabilityCards.value = capabilityCardsFromData(workflow.capabilities).map(card => ({
    ...card,
    scope: card.scope || 'workflow',
  }))
  workflowRuntimeAliasText.value = readTextField(registration, 'alias')
  workflowRuntimeModuleIdText.value = readTextField(registration, 'moduleId')
  workflowRuntimeBusinessIdText.value = readTextField(registration, 'businessId')
  workflowIdentityFieldText.value = readTextField(inputContract, 'identityField')
  workflowMessageFieldText.value = readTextField(inputContract, 'messageField')
  workflowReadonlyStepCards.value = structuredCardsFromStrings(inputContract['readonlySteps'], 'workflow.readonlyStep')
  workflowSystemPromptTemplateText.value = readTextField(systemPrompt, 'template')
  workflowModelProjectionKindText.value = readTextField(modelProjectionRef, 'kind') || 'dts-class-model'
  workflowRootClassText.value = readTextField(modelProjectionRef, 'rootClassName')
  workflowManifestUrlRefText.value = readTextField(modelProjectionRef, 'manifestUrlRef')
  workflowExecutableKindText.value = readTextField(executableRef, 'kind') || 'js-module'
  workflowExecutableModuleSpecifierText.value = readTextField(executableRef, 'moduleSpecifier')
  workflowExecutableExportNameText.value = readTextField(executableRef, 'exportName')
  workflowResolveEditorSourceText.value = readTextField(resolveInstance, 'editorSource')
  workflowResolveIdentityFieldText.value = readTextField(resolveInstance, 'identityField')
  workflowAgentCompleteMethodText.value = readTextField(binding, 'agentCompleteMethodName')
  workflowExecutionToolCards.value = structuredCardsFromStrings(binding['executionToolNames'], 'workflow.executionTool')
  workflowPlanMarkerCards.value = structuredCardsFromStrings(binding['planWithoutToolMarkers'], 'workflow.planMarker')
}

function syncBusinessModelEditorFromSelected(view: WorkflowDesignNodeView): void {
  if (!view.isBusinessNode) {
    modelRootClassText.value = ''
    modelClassText.value = ''
    validationActionClassText.value = ''
    validationActionNameText.value = ''
    classModelError.value = ''
    classModelGuideText.value = ''
    return
  }
  const model = readPrimaryBusinessNodeModel(view.node.data)
  const completion = isJsonRecord(model?.['completion']) ? model['completion'] : undefined
  modelRootClassText.value = readTextField(model, 'rootClassName')
  modelClassText.value = readTextField(model, 'className')
  validationActionClassText.value = modelClassText.value
  validationActionNameText.value = readTextField(completion, 'memberName')
  classModelError.value = ''
  classModelGuideText.value = ''
}

function syncBusinessNodeStructuredEditorFromSelected(view: WorkflowDesignNodeView): void {
  if (!view.isBusinessNode) {
    clearBusinessNodeStructuredEditor()
    return
  }
  const data = isJsonRecord(view.node.data) ? view.node.data : {}
  businessInputRows.value = structuredRowsFromRecord(data['inputs'], 'input')
  businessOutputRows.value = structuredRowsFromRecord(data['outputs'], 'output')
  const llm = isJsonRecord(data['llm']) ? data['llm'] : {}
  const task = isJsonRecord(llm['task']) ? llm['task'] : {}
  taskGoalText.value = readTextField(task, 'goal')
  taskRequirementRows.value = structuredRowsFromRecord(task['requirements'], 'task.requirement')
  taskContextInputRows.value = structuredRowsFromRecord(task['contextInputs'], 'task.context')
  const knowledge = isJsonRecord(llm['knowledge']) ? llm['knowledge'] : {}
  allowedActionCards.value = structuredCardsFromStrings(knowledge['allowedActions'], 'knowledge.action')
  readableAttributeCards.value = structuredCardsFromStrings(knowledge['readableAttributes'], 'knowledge.attribute')
  const functionCalling = isJsonRecord(llm['functionCalling']) ? llm['functionCalling'] : {}
  functionCallingModeText.value = readTextField(functionCalling, 'mode') || 'freeWithinModelContext'
  functionCallingConstraintCards.value = structuredCardsFromStrings(functionCalling['constraints'], 'function.constraint')
  const output = isJsonRecord(llm['output']) ? llm['output'] : {}
  structuredResultRows.value = structuredRowsFromRecord(output['structuredResult'], 'output.structured')
  handoffToValidationValue.value = typeof output['handoffToValidation'] === 'boolean'
    ? output['handoffToValidation']
    : true
  const validation = isJsonRecord(data['validation']) ? data['validation'] : {}
  const action = isJsonRecord(validation['action']) ? validation['action'] : {}
  validationActionClassText.value = readTextField(action, 'className') || validationActionClassText.value
  validationActionNameText.value = readTextField(action, 'actionName') || validationActionNameText.value
  validationInputProjectionRows.value = structuredRowsFromRecord(action['inputProjection'], 'validation.input')
  validationExpectedResultRows.value = structuredRowsFromRecord(action['expectedResult'], 'validation.expected')
  validationStatusText.value = readTextField(validation, 'status')
  validationIssuesPreview.value = formatJson(Array.isArray(validation['issues']) ? validation['issues'] : [])
  capabilityCards.value = capabilityCardsFromData(data['capabilities'])
  runtimeStatePreview.value = formatJson(isJsonRecord(data['state']) ? data['state'] : {})
  runtimeResultPreview.value = formatJson(isJsonRecord(data['result']) ? data['result'] : {})
}

function applyNodePosition(x: number, y: number): void {
  const view = selectedNode.value
  const document = currentDocument.value
  if (view === null || document === null) return
  view.node.position ??= {}
  view.node.position.x = Number.isFinite(x) ? x : 0
  view.node.position.y = Number.isFinite(y) ? y : 0
  markWorkflowDesignDirty(document, `${view.scopePath}.${view.id}.position`)
}

function applyNodeBasicEditorToSelected(): boolean {
  const view = selectedNode.value
  const document = currentDocument.value
  if (view === null || document === null) return true
  view.node.data ??= {}
  view.node.data.type = nodeTypeText.value.trim() || view.nodeType || view.node.type || 'custom'
  view.node.data.title = nodeTitleText.value.trim() || view.id
  view.node.data.desc = nodeDescText.value.trim()
  markWorkflowDesignDirty(document, `${view.scopePath}.${view.id}.data`)
  return true
}

function shouldEditNodeConfig(view: WorkflowDesignNodeView): boolean {
  return view.isBusinessNode
}

function readBusinessNodeModelClassName(view: WorkflowDesignNodeView): string {
  if (!view.isBusinessNode) return ''
  const model = readPrimaryBusinessNodeModel(view.node.data)
  if (!isJsonRecord(model)) return 'unbound model'
  const className = model['className']
  return typeof className === 'string' && className.trim().length > 0 ? className.trim() : 'unbound model'
}

function readBusinessNodeValidationActionName(view: WorkflowDesignNodeView): string {
  if (!view.isBusinessNode) return ''
  const model = readPrimaryBusinessNodeModel(view.node.data)
  const completion = isJsonRecord(model?.['completion']) ? model['completion'] : undefined
  const memberName = isJsonRecord(completion) ? completion['memberName'] : undefined
  return typeof memberName === 'string' && memberName.trim().length > 0 ? memberName.trim() : ''
}

function readBusinessNodeModelDocText(view: WorkflowDesignNodeView): string {
  const className = readBusinessNodeModelClassName(view)
  const option = classModelOptions.value.find(item => item.kind === className)
  return option === undefined ? '' : shortClassModelDocText(option)
}

function readBusinessNodeValidationActionDocText(view: WorkflowDesignNodeView): string {
  const className = readBusinessNodeModelClassName(view)
  const actionName = readBusinessNodeValidationActionName(view)
  const option = classModelOptions.value.find(item => item.kind === className)
  const method = option?.methods.find(item => item.name === actionName)
  return method === undefined ? '' : shortClassModelDocText(method)
}

function createClassModelKnowledgeProvider(rootClassName: string): ClassModelKnowledgeProvider {
  return createWorkerDtsClassModelKnowledgeProvider({
    workerUrl: new URL('../../services/class-model-knowledge.worker.ts', import.meta.url),
    dtsClassModelManifestUrl: getDtsClassModelManifestUrl(),
    rootClassName,
  })
}

function readClassModelOptions(value: unknown): ClassModelOption[] {
  if (!isJsonRecord(value) || !Array.isArray(value['models'])) return []
  return value['models']
    .filter(isJsonRecord)
    .map((model): ClassModelOption | null => {
      const kind = readTextField(model, 'kind') || readTextField(model, 'name')
      if (kind.length === 0) return null
      return {
        kind,
        jsdoc: readTextField(model, 'jsdoc'),
        summary: readTextField(model, 'summary'),
        constructorSignature: readConstructorOption(model['constructorSignature']),
        attributes: readAttributeOptions(model['attributes']),
        methods: readMethodOptions(model['methods']),
      }
    })
    .filter((item): item is ClassModelOption => item !== null)
}

function readConstructorOption(value: unknown): ClassModelConstructorOption | null {
  if (!isJsonRecord(value)) return null
  const signature = readTextField(value, 'signature')
  if (signature.length === 0) return null
  return {
    jsdoc: readTextField(value, 'jsdoc'),
    summary: readTextField(value, 'summary'),
    signature,
  }
}

function readAttributeOptions(value: unknown): ClassModelAttributeOption[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(isJsonRecord)
    .map((attribute): ClassModelAttributeOption | null => {
      const name = readTextField(attribute, 'name')
      if (name.length === 0) return null
      return {
        name,
        jsdoc: readTextField(attribute, 'jsdoc'),
        summary: readTextField(attribute, 'summary'),
        typeText: readTextField(attribute, 'typeText'),
      }
    })
    .filter((item): item is ClassModelAttributeOption => item !== null)
}

function readMethodOptions(value: unknown): ClassModelMethodOption[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(isJsonRecord)
    .map((method): ClassModelMethodOption | null => {
      const name = readTextField(method, 'name')
      if (name.length === 0) return null
      return {
        name,
        jsdoc: readTextField(method, 'jsdoc'),
        summary: readTextField(method, 'summary'),
        signature: readTextField(method, 'signature'),
      }
    })
    .filter((item): item is ClassModelMethodOption => item !== null)
}

function readTextField(value: unknown, field: string): string {
  if (!isJsonRecord(value)) return ''
  const text = value[field]
  return typeof text === 'string' ? text.trim() : ''
}

function classModelDocText(item: Readonly<{ jsdoc?: string; summary?: string }>): string {
  const jsdoc = typeof item.jsdoc === 'string' ? item.jsdoc.trim() : ''
  if (jsdoc.length > 0) return jsdoc
  const summary = typeof item.summary === 'string' ? item.summary.trim() : ''
  return summary.length > 0 ? summary : 'No JSDoc.'
}

function shortClassModelDocText(item: Readonly<{ jsdoc?: string; summary?: string }>): string {
  const line = classModelDocText(item).split('\n').map(part => part.trim()).find(part => part.length > 0) ?? ''
  return line.length > 96 ? `${line.slice(0, 95)}...` : line
}

function readPrimaryBusinessNodeModel(data: unknown): Record<string, unknown> | null {
  if (!isJsonRecord(data)) return null
  const models = data['models']
  if (Array.isArray(models) && isJsonRecord(models[0])) return models[0]
  return null
}

function ensurePrimaryBusinessNodeModel(data: Record<string, unknown>, nodeId: string): Record<string, unknown> {
  const models = Array.isArray(data['models']) ? [...data['models']] : []
  const primary = isJsonRecord(models[0]) ? models[0] : {}
  if (readTextField(primary, 'id').length === 0) primary['id'] = `${nodeId}.model`
  if (readTextField(primary, 'sourceRef').length === 0) primary['sourceRef'] = '$'
  models[0] = primary
  data['models'] = models
  return primary
}

function handleBusinessNodeStructuredChange(): void {
  applyBusinessNodeStructuredEditorToSelected({ silent: true })
}

function addStructuredFieldRow(rows: StructuredFieldRow[], prefix: string): void {
  const path = structuredPathOptions(rows)[0] ?? ''
  rows.push({
    id: nextStructuredEditorId(prefix),
    path,
    valueKind: 'reference',
    valueText: structuredReferenceOptions.value[0] ?? '',
    valueBoolean: false,
  })
  handleBusinessNodeStructuredChange()
}

function removeStructuredFieldRow(rows: StructuredFieldRow[], row: StructuredFieldRow): void {
  const index = rows.indexOf(row)
  if (index >= 0) rows.splice(index, 1)
  handleBusinessNodeStructuredChange()
}

function addSelectCard(cards: StructuredSelectCard[], options: readonly string[], prefix: string): void {
  cards.push({
    id: nextStructuredEditorId(prefix),
    value: options[0] ?? '',
  })
  handleBusinessNodeStructuredChange()
}

function removeSelectCard(cards: StructuredSelectCard[], card: StructuredSelectCard): void {
  const index = cards.indexOf(card)
  if (index >= 0) cards.splice(index, 1)
  handleBusinessNodeStructuredChange()
}

function addCapabilityCard(): void {
  capabilityCards.value.push({
    id: nextStructuredEditorId('capability'),
    title: 'Capability',
    scope: 'node',
    description: '',
    inputRows: [],
    outputRows: [],
    constraintCards: [],
  })
  handleBusinessNodeStructuredChange()
}

function removeCapabilityCard(card: StructuredCapabilityCard): void {
  const index = capabilityCards.value.indexOf(card)
  if (index >= 0) capabilityCards.value.splice(index, 1)
  handleBusinessNodeStructuredChange()
}

function handleWorkflowEditorChange(): void {
  editorDirty.value = true
}

function addWorkflowVariableRow(): void {
  workflowVariableRows.value.push({
    id: nextStructuredEditorId('workflow.variable'),
    source: {},
    schema: { type: 'string' },
    name: '',
    title: '',
    docText: '',
    required: false,
    schemaType: 'string',
    defaultValue: undefined,
    defaultValueText: '',
    defaultValueEditable: true,
  })
  handleWorkflowEditorChange()
}

function removeWorkflowVariableRow(row: WorkflowVariableEditorRow): void {
  const index = workflowVariableRows.value.indexOf(row)
  if (index >= 0) workflowVariableRows.value.splice(index, 1)
  handleWorkflowEditorChange()
}

function addWorkflowCapabilityCard(): void {
  workflowCapabilityCards.value.push({
    id: nextStructuredEditorId('workflow.capability'),
    title: 'Workflow Capability',
    scope: 'workflow',
    description: '',
    inputRows: [],
    outputRows: [],
    constraintCards: [],
  })
  handleWorkflowEditorChange()
}

function removeWorkflowCapabilityCard(card: StructuredCapabilityCard): void {
  const index = workflowCapabilityCards.value.indexOf(card)
  if (index >= 0) workflowCapabilityCards.value.splice(index, 1)
  handleWorkflowEditorChange()
}

function addWorkflowStringCard(cards: StructuredSelectCard[], prefix: string): void {
  cards.push({
    id: nextStructuredEditorId(prefix),
    value: '',
  })
  handleWorkflowEditorChange()
}

function removeWorkflowStringCard(cards: StructuredSelectCard[], card: StructuredSelectCard): void {
  const index = cards.indexOf(card)
  if (index >= 0) cards.splice(index, 1)
  handleWorkflowEditorChange()
}

function addWorkflowStructuredFieldRow(rows: StructuredFieldRow[], prefix: string): void {
  rows.push({
    id: nextStructuredEditorId(prefix),
    path: '',
    valueKind: 'text',
    valueText: '',
    valueBoolean: false,
  })
  handleWorkflowEditorChange()
}

function removeWorkflowStructuredFieldRow(rows: StructuredFieldRow[], row: StructuredFieldRow): void {
  const index = rows.indexOf(row)
  if (index >= 0) rows.splice(index, 1)
  handleWorkflowEditorChange()
}

function validateWorkflowEditor(): boolean {
  if (!Number.isFinite(workflowVersionValue.value) || workflowVersionValue.value < 1) {
    ElMessage.warning('Workflow Version 必须大于 0')
    return false
  }
  const variableNames = workflowVariableRows.value.map(row => row.name.trim()).filter(name => name.length > 0)
  if (variableNames.length !== workflowVariableRows.value.length) {
    ElMessage.warning('流程变量 name 不能为空')
    return false
  }
  if (new Set(variableNames).size !== variableNames.length) {
    ElMessage.warning('流程变量 name 不能重复')
    return false
  }
  const requiredTexts = [
    ['Registration Alias', workflowRuntimeAliasText.value],
    ['Registration Module ID', workflowRuntimeModuleIdText.value],
    ['Registration Business ID', workflowRuntimeBusinessIdText.value],
    ['Identity Field', workflowIdentityFieldText.value],
    ['Message Field', workflowMessageFieldText.value],
    ['System Prompt Template', workflowSystemPromptTemplateText.value],
    ['Root Class', workflowRootClassText.value],
    ['Manifest Ref', workflowManifestUrlRefText.value],
    ['Executable Module Specifier', workflowExecutableModuleSpecifierText.value],
    ['Executable Export Name', workflowExecutableExportNameText.value],
    ['Resolve Editor Source', workflowResolveEditorSourceText.value],
    ['Resolve Identity Field', workflowResolveIdentityFieldText.value],
  ] as const
  for (const [label, value] of requiredTexts) {
    if (value.trim().length === 0) {
      ElMessage.warning(`${label} 不能为空`)
      return false
    }
  }
  for (const field of [workflowIdentityFieldText.value, workflowMessageFieldText.value, workflowResolveIdentityFieldText.value]) {
    if (!variableNames.includes(field.trim())) {
      ElMessage.warning(`字段 ${field.trim()} 必须来自流程变量`)
      return false
    }
  }
  return true
}

function applyWorkflowEditorToCurrent(options: ApplyStructuredEditorOptions = {}): boolean {
  const document = currentDocument.value
  if (document === null) return true
  if (!validateWorkflowEditor()) return false

  document.workflow.version = Math.max(1, Math.trunc(workflowVersionValue.value))
  document.workflow.variables = workflowVariableRowsToData(workflowVariableRows.value)
  document.workflow.capabilities = capabilityCardsToData(workflowCapabilityCards.value)
  document.workflow.runtimeBinding = createWorkflowRuntimeBindingFromEditor(document.workflow.runtimeBinding, document.workflow.variables)
  document.x_spark.designer = {
    ...(isJsonRecord(document.x_spark.designer) ? document.x_spark.designer : {}),
    title: workflowDesignerTitleText.value.trim() || document.workflow.id,
  }
  markWorkflowDesignDirty(document, 'workflow')
  editorDirty.value = false
  if (options.silent !== true) ElMessage.success('流程属性已更新')
  return true
}

function createWorkflowRuntimeBindingFromEditor(
  existing: WorkflowDesignDocument['workflow']['runtimeBinding'],
  variables: readonly WorkflowDesignVariable[],
): WorkflowRuntimeBinding {
  const agentCompleteMethodName = workflowAgentCompleteMethodText.value.trim()
  const executionToolNames = structuredCardsToStrings(workflowExecutionToolCards.value)
  const planWithoutToolMarkers = structuredCardsToStrings(workflowPlanMarkerCards.value)
  return {
    registration: {
      ...existing?.registration,
      alias: workflowRuntimeAliasText.value.trim(),
      moduleId: workflowRuntimeModuleIdText.value.trim(),
      businessId: workflowRuntimeBusinessIdText.value.trim(),
    },
    inputContract: {
      ...existing?.inputContract,
      identityField: workflowIdentityFieldText.value.trim(),
      messageField: workflowMessageFieldText.value.trim(),
      paramsSchema: createWorkflowParamsSchema(existing?.inputContract.paramsSchema, variables),
      readonlySteps: structuredCardsToStrings(workflowReadonlyStepCards.value),
    },
    systemPrompt: {
      ...existing?.systemPrompt,
      template: workflowSystemPromptTemplateText.value.trim(),
    },
    modelProjectionRef: {
      ...existing?.modelProjectionRef,
      kind: 'dts-class-model',
      rootClassName: workflowRootClassText.value.trim(),
      manifestUrlRef: workflowManifestUrlRefText.value.trim(),
    },
    executableRef: {
      ...existing?.executableRef,
      kind: 'js-module',
      moduleSpecifier: workflowExecutableModuleSpecifierText.value.trim(),
      exportName: workflowExecutableExportNameText.value.trim(),
    },
    resolveInstance: {
      ...existing?.resolveInstance,
      editorSource: workflowResolveEditorSourceText.value.trim(),
      identityField: workflowResolveIdentityFieldText.value.trim(),
    },
    ...(existing?.toolLoopNudge === undefined ? {} : { toolLoopNudge: existing.toolLoopNudge }),
    ...(existing?.beforeFunctionCall === undefined ? {} : { beforeFunctionCall: existing.beforeFunctionCall }),
    ...(agentCompleteMethodName.length === 0 ? {} : { agentCompleteMethodName }),
    ...(executionToolNames.length === 0 ? {} : { executionToolNames }),
    ...(planWithoutToolMarkers.length === 0 ? {} : { planWithoutToolMarkers }),
  }
}

function createWorkflowParamsSchema(
  existing: unknown,
  variables: readonly WorkflowDesignVariable[],
): WorkflowRuntimeBinding['inputContract']['paramsSchema'] {
  const standardized = standardizeJsonSchema(existing)
  const current = typeof standardized === 'boolean' ? {} : standardized
  const properties: Record<string, JsonSchema> = {}
  const required: string[] = []
  for (const variable of variables) {
    properties[variable.name] = standardizeJsonSchema(variable.schema ?? { type: 'string' })
    if (variable.required === true) required.push(variable.name)
  }
  return {
    ...current,
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  }
}

function applyBusinessNodeStructuredEditorToSelected(options: ApplyStructuredEditorOptions = {}): boolean {
  const view = selectedNode.value
  const document = currentDocument.value
  if (view === null || document === null || !view.isBusinessNode) return true
  view.node.data ??= {}
  const data = view.node.data
  const primaryModel = ensurePrimaryBusinessNodeModel(data, view.id)
  primaryModel['rootClassName'] = modelRootClassText.value.trim()
  primaryModel['className'] = modelClassText.value.trim()
  const completionMemberName = validationActionNameText.value.trim()
  if (completionMemberName.length > 0) {
    const completion = isJsonRecord(primaryModel['completion']) ? primaryModel['completion'] : {}
    primaryModel['completion'] = {
      ...completion,
      memberName: completionMemberName,
      returnContract: 'boolean-or-reason',
    }
  } else {
    delete primaryModel['completion']
  }
  data.inputs = structuredRowsToRecord(businessInputRows.value)
  data.outputs = structuredRowsToRecord(businessOutputRows.value)
  data.llm = {
    task: {
      goal: taskGoalText.value.trim(),
      requirements: structuredRowsToRecord(taskRequirementRows.value),
      contextInputs: structuredRowsToRecord(taskContextInputRows.value),
    },
    knowledge: {
      rootClassName: modelRootClassText.value.trim(),
      className: modelClassText.value.trim(),
      allowedActions: structuredCardsToStrings(allowedActionCards.value),
      readableAttributes: structuredCardsToStrings(readableAttributeCards.value),
    },
    functionCalling: {
      mode: functionCallingModeText.value.trim() || 'freeWithinModelContext',
      constraints: structuredCardsToStrings(functionCallingConstraintCards.value),
    },
    output: {
      structuredResult: structuredRowsToRecord(structuredResultRows.value),
      handoffToValidation: handoffToValidationValue.value,
    },
  }
  const existingValidation = isJsonRecord(data.validation) ? data.validation : {}
  data.validation = {
    ...existingValidation,
    action: {
      className: validationActionClassText.value.trim() || modelClassText.value.trim(),
      actionName: validationActionNameText.value.trim(),
      inputProjection: structuredRowsToRecord(validationInputProjectionRows.value),
      expectedResult: structuredRowsToRecord(validationExpectedResultRows.value),
    },
  }
  data.capabilities = capabilityCardsToData(capabilityCards.value)
  modelJsonText.value = formatJson(data)
  markWorkflowDesignDirty(document, `${view.scopePath}.${view.id}.data`)
  editorDirty.value = false
  if (options.silent !== true) ElMessage.success('节点配置已更新')
  return true
}

function applyBusinessModelEditorToSelected(options: { silent?: boolean } = {}): boolean {
  return applyBusinessNodeStructuredEditorToSelected(options)
}

function handleModelClassSelectionChange(): void {
  if (validationActionClassText.value.trim().length === 0) {
    validationActionClassText.value = modelClassText.value.trim()
  }
  handleBusinessNodeStructuredChange()
}

async function refreshClassModelOptions(): Promise<void> {
  const rootClassName = modelRootClassText.value.trim()
  await refreshClassModelOptionsForRoot(rootClassName, 'node')
}

async function refreshWorkflowClassModelOptions(): Promise<void> {
  const rootClassName = workflowRootClassText.value.trim()
  await refreshClassModelOptionsForRoot(rootClassName, 'workflow')
}

async function refreshClassModelOptionsForRoot(rootClassName: string, source: 'node' | 'workflow'): Promise<void> {
  if (rootClassName.length === 0) {
    classModelError.value = 'Root Class 不能为空'
    return
  }
  classModelLoading.value = true
  classModelError.value = ''
  classModelGuideText.value = ''
  try {
    const provider = createClassModelKnowledgeProvider(rootClassName)
    const result = await provider.query({ includeMembers: true })
    classModelOptions.value = readClassModelOptions(result)
    classModelLoadedRootText.value = rootClassName
    if (source === 'node' && modelClassText.value.trim().length === 0 && classModelOptions.value[0] !== undefined) {
      modelClassText.value = classModelOptions.value[0].kind
      validationActionClassText.value = modelClassText.value
    }
    if (source === 'workflow' && workflowRootClassText.value.trim().length === 0 && classModelOptions.value[0] !== undefined) {
      workflowRootClassText.value = classModelOptions.value[0].kind
    }
  } catch (error: unknown) {
    classModelError.value = `ClassModel 读取失败: ${errorMessage(error)}`
  } finally {
    classModelLoading.value = false
  }
}

function ensureSelectedNodeClassModelKnowledge(): void {
  if (selectedNode.value?.isBusinessNode !== true || classModelLoading.value) return
  const rootClassName = modelRootClassText.value.trim()
  if (rootClassName.length === 0 || rootClassName === classModelLoadedRootText.value) return
  void refreshClassModelOptions()
}

function ensureWorkflowClassModelKnowledge(): void {
  if (classModelLoading.value) return
  const rootClassName = workflowRootClassText.value.trim()
  if (rootClassName.length === 0 || rootClassName === classModelLoadedRootText.value) return
  void refreshWorkflowClassModelOptions()
}

function handleWorkflowRootClassChange(): void {
  handleWorkflowEditorChange()
  ensureWorkflowClassModelKnowledge()
}

async function loadValidationActionGuide(): Promise<void> {
  const rootClassName = modelRootClassText.value.trim()
  const className = validationActionClassText.value.trim() || modelClassText.value.trim()
  const methodName = validationActionNameText.value.trim()
  if (rootClassName.length === 0 || className.length === 0 || methodName.length === 0) {
    classModelError.value = 'Root Class, completion class and completion member are required.'
    return
  }
  classModelLoading.value = true
  classModelError.value = ''
  try {
    const provider = createClassModelKnowledgeProvider(rootClassName)
    classModelGuideText.value = await provider.methodGuide({
      kind: className,
      methodName,
    })
  } catch (error: unknown) {
    classModelError.value = `Action Guide 读取失败: ${errorMessage(error)}`
  } finally {
    classModelLoading.value = false
  }
}

function applyLoopEditorToSelected(options: { silent?: boolean } = {}): boolean {
  const view = selectedNode.value
  const document = currentDocument.value
  if (view === null || document === null || view.nodeType !== 'loop') return true
  applyNodeBasicEditorToSelected()
  view.node.data ??= {}
  view.node.data.loop ??= {}
  view.node.data.loop.mode = loopModeText.value.trim() || 'progressive'
  view.node.data.loop.maxLoopCount = Number.isFinite(loopMaxCountValue.value)
    ? Math.max(1, Math.trunc(loopMaxCountValue.value))
    : 1
  view.node.data.loop.exitNodeId = loopExitNodeText.value.trim() || 'loop.exit'
  markWorkflowDesignDirty(document, `${view.scopePath}.${view.id}.data.loop`)
  editorDirty.value = false
  if (options.silent !== true) ElMessage.success('循环配置已应用')
  return true
}

function applySelectedDraft(options: { silent?: boolean } = {}): boolean {
  if (propertiesDrawerTarget.value === 'workflow') {
    return editorDirty.value ? applyWorkflowEditorToCurrent(options) : true
  }
  if (selectedLine.value !== null) return applyLineEditorToSelected(options)
  const view = selectedNode.value
  if (view === null) {
    editorDirty.value = false
    return true
  }
  if (shouldEditNodeConfig(view)) {
    applyNodeBasicEditorToSelected()
    return applyBusinessNodeStructuredEditorToSelected({ silent: true })
  }
  if (view.nodeType === 'loop') return applyLoopEditorToSelected(options)
  applyNodeBasicEditorToSelected()
  editorDirty.value = false
  if (options.silent !== true) ElMessage.success('节点已更新')
  return true
}

async function saveCurrentDesign(): Promise<boolean> {
  const document = currentDocument.value
  if (document === null || currentWorkflowId.value.length === 0) return false
  if (!applySelectedDraft({ silent: true })) return false
  normalizeWorkflowDesignLineState(document)

  saving.value = true
  try {
    markWorkflowDesignSaved(document)
    const result = await saveWorkflowDesign(currentWorkflowId.value, document)
    currentFilename.value = result.filename
    currentTimestamp.value = result.timestamp
    editorDirty.value = false
    await loadDesigns()
    ElMessage.success('设计稿已保存')
    return true
  } catch (error: unknown) {
    ElMessage.error(`保存失败: ${errorMessage(error)}`)
    return false
  } finally {
    saving.value = false
  }
}

async function autoLayoutCurrentDesign(): Promise<void> {
  const document = currentDocument.value
  if (document === null || currentWorkflowId.value.length === 0) return
  if (!applySelectedDraft({ silent: true })) return

  const result = autoLayoutWorkflowDesignGraphs(document)
  for (const graph of result.graphs) {
    if (graph.changedNodePositions) markWorkflowDesignDirty(document, `${graph.scopePath}.nodes`)
    if (graph.changedViewport) markWorkflowDesignDirty(document, `${graph.scopePath}.viewport`)
  }
  if (!result.changed && !hasUnsavedChanges.value) {
    ElMessage.info('当前工作流图已无需自动排版')
    return
  }

  autoLayoutSaving.value = true
  try {
    await saveCurrentDesign()
  } finally {
    autoLayoutSaving.value = false
  }
}

async function openDefinitionEditor(): Promise<void> {
  const workflowId = currentWorkflowId.value
  if (workflowId.length === 0) return
  if (!applySelectedDraft({ silent: true })) return

  openingDefinition.value = true
  try {
    const result = await readWorkflowDefinition(workflowId, definitionTimestamp.value)
    if (result.definition !== undefined) {
      definitionTimestamp.value = result.timestamp
      definitionJsonText.value = formatJson(result.definition)
      definitionDirty.value = false
    } else {
      ElMessage.info('definition.json 未变化')
    }
    definitionDialogVisible.value = true
  } catch (error: unknown) {
    if (!isWorkflowDefinitionNotFoundError(error) || currentDocument.value === null) {
      ElMessage.error(`打开 Definition 失败: ${errorMessage(error)}`)
      return
    }
    const sourceDocument = await readFreshDesignForDefinitionDraft(workflowId)
    const definition = createAgentWorkflowDefinitionFromDesign(sourceDocument)
    definitionTimestamp.value = ''
    definitionJsonText.value = formatJson(definition)
    definitionDirty.value = true
    definitionDialogVisible.value = true
    ElMessage.info('definition.json 不存在，已根据当前设计生成本地草稿')
  } finally {
    openingDefinition.value = false
  }
}

function markDefinitionDirty(): void {
  definitionDirty.value = true
}

async function readFreshDesignForDefinitionDraft(workflowId: string): Promise<WorkflowDesignDocument> {
  const openedDocument = currentDocument.value
  if (openedDocument === null) {
    throw new Error('当前设计稿未打开')
  }
  if (hasUnsavedChanges.value) {
    return openedDocument
  }
  try {
    const result = await readWorkflowDesign(workflowId)
    if (result.document !== undefined) {
      currentTimestamp.value = result.timestamp
      currentDocument.value = result.document
      return result.document
    }
  } catch {
    // Best-effort refresh only; keep the already-open design if the API is unavailable.
  }
  return currentDocument.value ?? openedDocument
}

async function saveCurrentDefinition(): Promise<void> {
  const workflowId = currentWorkflowId.value
  if (workflowId.length === 0) return

  let definition
  try {
    definition = parseAgentWorkflowDefinitionJson(definitionJsonText.value)
  } catch (error: unknown) {
    ElMessage.error(`Definition JSON 无效: ${errorMessage(error)}`)
    return
  }

  savingDefinition.value = true
  try {
    const result = await saveWorkflowDefinition(workflowId, definition)
    definitionTimestamp.value = result.timestamp
    definitionJsonText.value = formatJson(definition)
    definitionDirty.value = false
    ElMessage.success('definition.json 已保存')
  } catch (error: unknown) {
    ElMessage.error(`保存 Definition 失败: ${errorMessage(error)}`)
  } finally {
    savingDefinition.value = false
  }
}

async function publishCurrentDefinition(): Promise<void> {
  const document = currentDocument.value
  const workflowId = currentWorkflowId.value
  if (document === null || workflowId.length === 0) return
  if (!applySelectedDraft({ silent: true })) return
  if (hasUnsavedChanges.value && !await saveCurrentDesign()) return

  const definition = createAgentWorkflowDefinitionFromDesign(document)
  if (definition.x_spark.validation.status === 'invalid') {
    const firstIssue = definition.x_spark.validation.issues.find(issue => issue.severity === 'error')
    ElMessage.error(`发布失败: ${firstIssue?.message ?? 'definition 校验未通过'}`)
    return
  }

  publishing.value = true
  try {
    const result = await publishWorkflowDefinition(workflowId, definition)
    definitionTimestamp.value = result.timestamp
    definitionJsonText.value = formatJson(definition)
    definitionDirty.value = false
    definitionDialogVisible.value = true
    ElMessage.success('definition.json 已发布')
  } catch (error: unknown) {
    ElMessage.error(`发布失败: ${errorMessage(error)}`)
  } finally {
    publishing.value = false
  }
}

function resetDefinitionEditor(): void {
  definitionDialogVisible.value = false
  definitionTimestamp.value = ''
  definitionJsonText.value = '{}'
  definitionDirty.value = false
}

async function copyJson(): Promise<void> {
  if (currentDocument.value === null) return
  try {
    await navigator.clipboard.writeText(formatJson(currentDocument.value))
    ElMessage.success('JSON 已复制')
  } catch (error: unknown) {
    ElMessage.error(`复制失败: ${errorMessage(error)}`)
  }
}

async function confirmDiscardEditorDraft(): Promise<boolean> {
  if (!hasUnsavedChanges.value) return true
  try {
    await ElMessageBox.confirm('当前工作流设计有未保存更改，是否继续并丢弃这些更改？', '切换工作流设计', {
      type: 'warning',
      confirmButtonText: '继续',
      cancelButtonText: '取消',
    })
    editorDirty.value = false
    return true
  } catch {
    return false
  }
}

async function confirmDiscardDefinitionDraft(): Promise<boolean> {
  if (!definitionDialogVisible.value || !definitionDirty.value) return true
  try {
    await ElMessageBox.confirm('当前 definition.json 有未保存更改，是否继续并丢弃这些更改？', '切换工作流设计', {
      type: 'warning',
      confirmButtonText: '继续',
      cancelButtonText: '取消',
    })
    definitionDirty.value = false
    return true
  } catch {
    return false
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) return error.message
  return String(error)
}
</script>

<style scoped>
.workflow-design-page {
  min-height: 100%;
  padding: 12px;
  background: #f6f8fb;
}

.workflow-design-shell {
  display: grid;
  min-height: calc(100vh - 88px);
}

.workflow-design-sidebar,
.workflow-design-canvas,
.workflow-design-editor {
  min-width: 0;
  border: 1px solid #d8dee8;
  border-radius: 8px;
  background: #ffffff;
}

.workflow-design-sidebar,
.workflow-design-editor {
  padding: 12px;
  overflow: auto;
}

.workflow-design-sidebar.is-collapsed {
  display: grid;
  place-items: start center;
  padding: 8px 4px;
  overflow: hidden;
}

.workflow-sidebar-collapsed-button {
  display: grid;
  width: 36px;
  min-height: 92px;
  place-items: center;
  gap: 8px;
  padding: 8px 4px;
  border: 1px solid #dbe3ee;
  border-radius: 8px;
  color: #334155;
  cursor: pointer;
  background: #f8fafc;
}

.workflow-sidebar-collapsed-button span {
  writing-mode: vertical-rl;
  letter-spacing: 0;
}

.workflow-sidebar-collapsed-button strong {
  color: #0f766e;
  font-size: 12px;
}

.workflow-tool-sidebar {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
}

.workflow-tool-sidebar .panel-heading {
  margin-bottom: 2px;
}

.workflow-tool-group {
  display: grid;
  gap: 6px;
  padding: 8px;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #f8fafc;
}

.workflow-tool-group h3 {
  margin: 0 0 2px;
  color: #334155;
  font-size: 12px;
  font-weight: 700;
}

.workflow-tool-group :deep(.el-button) {
  width: 100%;
  justify-content: center;
  margin-left: 0;
  min-height: 28px;
  padding: 5px 6px;
  font-size: 12px;
}

.workflow-tool-button-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}

.workflow-tool-empty {
  padding: 7px 8px;
  border: 1px dashed #cbd5e1;
  border-radius: 6px;
  color: #94a3b8;
  font-size: 12px;
  text-align: center;
  background: #ffffff;
}

.workflow-tool-selection {
  display: grid;
  gap: 3px;
  padding: 6px;
  border: 1px solid #dbe3ee;
  border-radius: 6px;
  background: #ffffff;
}

.workflow-tool-selection strong,
.workflow-tool-selection span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workflow-line-type-field {
  display: grid;
  gap: 4px;
  color: #475569;
  font-size: 12px;
}

.workflow-control-edge :deep(.vue-flow__edge-path) {
  stroke: #64748b;
  stroke-width: 2;
  stroke-linejoin: round;
}

.workflow-control-edge.is-running :deep(.vue-flow__edge-path) {
  stroke: #2563eb;
  stroke-dasharray: 8 5;
  animation: workflow-edge-flow 0.8s linear infinite;
}

.workflow-control-edge.is-completed :deep(.vue-flow__edge-path) {
  stroke: #16a34a;
}

.workflow-control-edge.is-failed :deep(.vue-flow__edge-path) {
  stroke: #dc2626;
}

.workflow-control-edge.is-skipped :deep(.vue-flow__edge-path) {
  stroke: #94a3b8;
  stroke-dasharray: 5 5;
}

.workflow-edge-control-point {
  fill: #ffffff;
  stroke: #2563eb;
  stroke-width: 2;
  cursor: move;
}

.workflow-edge-control-point.is-selected {
  fill: #dbeafe;
  stroke: #1d4ed8;
  stroke-width: 3;
}

.workflow-edge-status-icon {
  fill: #334155;
  font-size: 14px;
  font-weight: 800;
  pointer-events: none;
  text-anchor: middle;
}

@keyframes workflow-edge-flow {
  to { stroke-dashoffset: -13; }
}

.workflow-tool-selection strong {
  color: #111827;
  font-size: 13px;
}

.workflow-tool-selection span {
  color: #64748b;
  font-size: 12px;
}

.layout-resize-handle {
  align-self: stretch;
  cursor: col-resize;
  transition: background 0.16s ease;
}

.layout-resize-handle:hover {
  background: linear-gradient(90deg, transparent 4px, #cbd5e1 4px, #cbd5e1 8px, transparent 8px);
}

.layout-resize-handle.is-disabled {
  cursor: default;
  pointer-events: none;
}

.workflow-design-canvas {
  padding: 14px;
  overflow: auto;
}

.panel-heading,
.canvas-toolbar,
.section-label,
.workflow-list-meta,
.workflow-list-actions,
.document-title,
.document-stats {
  display: flex;
  align-items: center;
}

.panel-heading {
  justify-content: space-between;
  margin-bottom: 12px;
  color: #1f2937;
  font-weight: 650;
}

.workflow-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.workflow-list-heading-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.workflow-list-item {
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid #dbe3ee;
  border-radius: 8px;
  cursor: pointer;
  background: #ffffff;
  transition: border-color 0.16s ease, background 0.16s ease;
}

.workflow-list-item:hover,
.workflow-list-item.is-active {
  border-color: #0f766e;
  background: #eefaf7;
}

.workflow-list-item.is-unreadable {
  border-color: #fecaca;
  background: #fff7f7;
}

.workflow-list-item.is-unreadable:hover {
  border-color: #dc2626;
  background: #fff1f2;
}

.workflow-list-main {
  display: grid;
  gap: 2px;
}

.workflow-list-main strong {
  overflow: hidden;
  color: #111827;
  font-size: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workflow-list-main span,
.workflow-list-meta span,
.document-stats span {
  color: #64748b;
  font-size: 12px;
}

.workflow-list-meta,
.workflow-list-actions {
  justify-content: space-between;
  gap: 8px;
}

.canvas-toolbar {
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
  padding-bottom: 12px;
  border-bottom: 1px solid #e5e7eb;
}

.document-title {
  min-width: 0;
  gap: 8px;
  color: #111827;
  font-weight: 700;
}

.document-title-label {
  flex: 0 0 auto;
}

.document-title-id {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.document-stats {
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}

.graph-section {
  margin-bottom: 16px;
}

.graph-split {
  display: grid;
  height: calc(100vh - 216px);
  min-height: 640px;
}

.graph-split-pane {
  display: flex;
  min-height: 0;
  margin-bottom: 0;
  overflow: hidden;
  flex-direction: column;
}

.graph-split-pane.is-collapsed {
  min-height: 8px;
}

.graph-collapse-rail {
  width: 100%;
  height: 8px;
  padding: 0;
  border: 0;
  border-radius: 4px;
  cursor: pointer;
  background: #cbd5e1;
}

.graph-splitter {
  display: grid;
  grid-template-columns: minmax(24px, 1fr) auto minmax(24px, 1fr);
  align-items: center;
  gap: 8px;
  min-height: 18px;
  cursor: row-resize;
}

.graph-splitter-line {
  height: 1px;
  background: #dbe3ee;
}

.graph-splitter-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 6px;
  border: 1px solid #dbe3ee;
  border-radius: 999px;
  background: #ffffff;
  box-shadow: 0 1px 2px rgb(15 23 42 / 6%);
}

.graph-panel-label {
  flex: 0 0 auto;
}

.graph-panel-body {
  display: flex;
  min-height: 0;
  flex: 1 1 auto;
  flex-direction: column;
}

.graph-panel-flow {
  flex: 1 1 auto;
  min-height: 220px;
}

.graph-child-select {
  width: 180px;
  min-height: 26px;
  font-size: 12px;
}

.collapsible-section > summary {
  list-style: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 7px;
}

.collapsible-section > summary::-webkit-details-marker {
  display: none;
}

.collapsible-section > summary::before {
  content: ">";
  flex: 0 0 auto;
  color: #64748b;
  transition: transform 0.16s ease;
}

.collapsible-section[open] > summary::before {
  transform: rotate(90deg);
}

.collapsible-body {
  min-width: 0;
}

.section-label {
  justify-content: flex-start;
  gap: 8px;
  margin-bottom: 10px;
  color: #334155;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
}

.section-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.section-label-actions {
  display: inline-flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
  margin-left: auto;
}

.graph-node-actions {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.loop-group-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: -2px 0 10px;
  color: #92400e;
  font-size: 12px;
}

.loop-group-meta span {
  padding: 3px 8px;
  border: 1px solid #fed7aa;
  border-radius: 999px;
  background: #fff7ed;
}

.graph-class-model-strip {
  display: flex;
  min-height: 32px;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin: -2px 0 10px;
  padding: 6px 8px;
  border: 1px solid #dbe3ee;
  border-radius: 8px;
  background: #f8fafc;
  color: #334155;
  font-size: 12px;
}

.graph-class-model-strip strong {
  color: #111827;
}

.graph-class-model-strip-badge {
  padding: 3px 8px;
  border: 1px solid #dbe3ee;
  border-radius: 999px;
  background: #ffffff;
}

.graph-class-model-strip-spacer {
  flex: 1 1 auto;
}

.workflow-flow-shell {
  position: relative;
  overflow: hidden;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  background: #fbfdff;
}

.workflow-flow {
  width: 100%;
  height: 100%;
  min-height: 260px;
}

.graph-split .workflow-flow {
  min-height: 0;
}

.workflow-flow--subgraph {
  min-height: 520px;
}

.graph-split .workflow-flow--subgraph {
  min-height: 0;
}

.workflow-node {
  display: grid;
  align-content: start;
  min-width: 0;
  border: 1px solid #dbe3ee;
  border-radius: 8px;
  text-align: left;
  background: #ffffff;
  transition: border-color 0.16s ease, box-shadow 0.16s ease, transform 0.16s ease;
  width: 190px;
  min-height: 92px;
  padding: 12px;
  gap: 6px;
  cursor: grab;
  user-select: none;
}

.workflow-node:hover {
  border-color: #2563eb;
  box-shadow: 0 8px 20px rgb(15 23 42 / 8%);
  transform: translateY(-1px);
}

.workflow-node.is-selected {
  border-color: #0f766e;
  box-shadow: 0 0 0 2px rgb(15 118 110 / 18%);
}

.workflow-node.is-business {
  background: #f4fbf9;
}

.workflow-node.is-boundary {
  background: #f5f9ff;
}

.workflow-node.is-loop {
  background: #fff7ed;
}

.node-kind,
.tool-name {
  width: fit-content;
  max-width: 100%;
  overflow: hidden;
  border-radius: 999px;
  color: #334155;
  font-size: 11px;
  font-weight: 700;
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-kind {
  padding: 0 8px;
  background: #e8eef6;
}

.tool-name {
  padding: 0 7px;
  background: #dcfce7;
  color: #166534;
}

.tool-name--pinned {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}

.tool-name--pinned .class-model-pin {
  width: 7px;
  height: 7px;
  border-width: 1px;
  box-shadow: none;
}

.node-jsdoc {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.workflow-node strong {
  overflow-wrap: anywhere;
  color: #111827;
  font-size: 14px;
  line-height: 18px;
}

.workflow-node small {
  overflow-wrap: anywhere;
  color: #64748b;
  font-size: 12px;
  line-height: 16px;
}

.editor-section {
  padding: 10px 0;
  border-top: 1px solid #e5e7eb;
}

.editor-section:first-of-type {
  border-top: 0;
  padding-top: 0;
}

.editor-section > summary {
  margin-bottom: 10px;
  color: #334155;
  font-size: 12px;
  font-weight: 700;
}

.node-editor-form,
.loop-editor-form,
.class-model-editor,
.structured-editor,
.properties-summary {
  display: grid;
  gap: 10px;
}

.properties-drawer :deep(.el-drawer__body),
.class-model-drawer :deep(.el-drawer__body) {
  overflow: auto;
  padding-top: 8px;
}

.structured-field-row,
.structured-card {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.structured-field-row {
  grid-template-columns: minmax(160px, 1fr) 130px minmax(220px, 2fr) auto;
  align-items: center;
}

.structured-field-row--compact {
  grid-template-columns: minmax(110px, 1fr) 96px minmax(120px, 1.5fr) auto;
}

.structured-card {
  padding: 10px;
  border: 1px solid #dbe3ee;
  border-radius: 8px;
  background: #f8fafc;
}

.structured-checkbox {
  width: 18px;
  height: 18px;
}

.class-model-catalog {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  color: #334155;
  font-size: 12px;
}

.workflow-variable-editor,
.workflow-runtime-editor,
.workflow-capability-editor,
.workflow-string-list {
  display: grid;
  gap: 8px;
}

.workflow-inline-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.workflow-doc-reference {
  display: flex;
  grid-column: 1 / -1;
  gap: 6px;
  align-items: flex-start;
  min-width: 0;
  padding: 6px 8px;
  border: 1px solid #dbe3ee;
  border-radius: 6px;
  color: #475569;
  font-size: 12px;
  line-height: 17px;
  background: #f8fafc;
}

.workflow-doc-reference > strong {
  flex: 0 0 auto;
  color: #0f766e;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.workflow-doc-reference span:last-child {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.structured-field-doc-reference {
  margin-top: -2px;
}

.field-with-doc {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 28px;
  gap: 4px;
  align-items: center;
  min-width: 0;
}

.field-with-doc .native-select {
  min-width: 0;
}

.doc-hint {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid #cbd5e1;
  border-radius: 999px;
  color: #0f766e;
  cursor: help;
  background: #f8fafc;
  touch-action: manipulation;
}

.doc-hint:hover,
.doc-hint:focus-visible,
.doc-hint:focus {
  border-color: #14b8a6;
  color: #0f766e;
  background: #ecfeff;
}

.doc-hint-popover {
  position: absolute;
  right: 0;
  bottom: calc(100% + 6px);
  z-index: 30;
  display: none;
  width: min(320px, 70vw);
  padding: 8px 10px;
  border: 1px solid #99f6e4;
  border-radius: 6px;
  box-shadow: 0 12px 24px rgb(15 23 42 / 14%);
  color: #334155;
  font-size: 12px;
  line-height: 18px;
  text-align: left;
  white-space: normal;
  background: #ffffff;
}

.doc-hint:hover .doc-hint-popover,
.doc-hint:focus-visible .doc-hint-popover,
.doc-hint:focus .doc-hint-popover {
  display: block;
}

.workflow-runtime-editor strong,
.workflow-capability-editor strong,
.workflow-string-list > span {
  color: #334155;
  font-size: 12px;
  font-weight: 700;
}

.workflow-variable-row {
  display: grid;
  grid-template-columns: minmax(92px, 1fr) minmax(92px, 1fr) 82px 58px minmax(92px, 1fr) auto;
  gap: 6px;
  align-items: center;
}

.workflow-variable-header {
  display: grid;
  grid-template-columns: minmax(92px, 1fr) minmax(92px, 1fr) 82px 58px minmax(92px, 1fr) auto;
  gap: 6px;
  color: #64748b;
  font-size: 12px;
  font-weight: 700;
}

.workflow-checkbox-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: #334155;
  font-size: 12px;
  white-space: nowrap;
}

.workflow-readonly-value {
  overflow: hidden;
  padding: 6px 8px;
  border: 1px solid #dbe3ee;
  border-radius: 6px;
  color: #64748b;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
  background: #f8fafc;
}

.workflow-string-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px;
  align-items: center;
}

.workflow-metadata-table {
  display: grid;
  gap: 1px;
  overflow: hidden;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #e2e8f0;
}

.workflow-metadata-row {
  display: grid;
  grid-template-columns: minmax(120px, 0.8fr) minmax(0, 1.4fr);
  background: #ffffff;
}

.workflow-metadata-row span,
.workflow-metadata-row strong {
  min-width: 0;
  padding: 6px 8px;
  overflow-wrap: anywhere;
  font-size: 12px;
}

.workflow-metadata-row span {
  color: #64748b;
  background: #f8fafc;
}

.workflow-metadata-row strong {
  color: #334155;
  font-weight: 500;
}

.class-model-pin {
  width: 9px;
  height: 9px;
  border: 2px solid #0f766e;
  border-radius: 50%;
  background: #ccfbf1;
  box-shadow: 0 0 0 2px #f0fdfa;
}

.class-model-doc-panel {
  display: grid;
  max-height: 420px;
  overflow: auto;
  gap: 8px;
  padding: 8px;
  border: 1px solid #dbe3ee;
  border-radius: 6px;
  background: #f8fafc;
}

.class-model-drawer-doc-panel {
  grid-template-columns: 1fr;
  max-height: none;
  padding: 0;
  border: 0;
  background: transparent;
}

.class-model-doc-group {
  display: grid;
  gap: 8px;
}

.class-model-doc-group > summary,
.class-model-doc-title {
  color: #334155;
  font-size: 12px;
  font-weight: 700;
}

.class-model-doc-item {
  display: grid;
  gap: 5px;
  padding: 8px;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  background: #ffffff;
}

.class-model-doc-title {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.class-model-doc-item code {
  color: #0f766e;
  font-size: 12px;
  white-space: normal;
  overflow-wrap: anywhere;
}

.class-model-doc-item pre {
  margin: 0;
  color: #475569;
  font-size: 12px;
  line-height: 1.45;
  white-space: pre-wrap;
}

.class-model-guide {
  max-height: 220px;
  overflow: auto;
  padding: 10px;
  border: 1px solid #dbe3ee;
  border-radius: 6px;
  background: #f8fafc;
  color: #0f172a;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
}

.native-select {
  width: 100%;
  min-height: 32px;
  padding: 0 10px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  color: #1f2937;
  background: #ffffff;
}

.readonly-json-preview {
  max-height: 260px;
  overflow: auto;
  padding: 10px;
  border: 1px solid #dbe3ee;
  border-radius: 6px;
  background: #f8fafc;
  color: #0f172a;
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
}

.definition-editor {
  display: grid;
  gap: 12px;
}

.definition-editor-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  color: #334155;
  font-size: 13px;
}

.definition-json-input :deep(textarea) {
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
  font-size: 12px;
  line-height: 1.55;
}

.editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

@media (max-width: 1180px) {
  .workflow-design-shell {
    grid-template-columns: 240px minmax(420px, 1fr);
  }

  .workflow-design-editor {
    grid-column: 1 / -1;
  }
}

@media (max-width: 820px) {
  .workflow-design-page {
    padding: 10px;
  }

  .workflow-design-shell {
    grid-template-columns: 1fr;
  }

  .workflow-flow-shell {
    max-width: calc(100vw - 20px);
  }

  .graph-split {
    height: auto;
    min-height: 720px;
  }
}
</style>
