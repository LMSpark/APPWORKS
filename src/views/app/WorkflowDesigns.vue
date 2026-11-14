<!--
@module app:views/app/WorkflowDesigns
职责：Agent 工作流设计页；目录、主图/子图、流程/节点/连线/变量/能力配置全部绑定 design.json 的投影 DataView。
边界：编辑只写 DataView 编辑行，一次 saveChanges 合成一次 design.json 写入；发布只更新已有 definition.json 行，不创建文件。
AI用途：排查工作流设计页的画布、属性表单、保存或发布时，从本页面定位视图绑定与命令编排。
-->
<template>
  <div class="workflow-designs" :class="{'workflow-designs--collapsed': leftCollapsed}">
    <aside class="workflow-designs__directory">
      <header class="workflow-designs__directory-header">
        <strong v-if="!leftCollapsed">工作流设计稿</strong>
        <RendererButton size="small" :title="leftCollapsed ? '展开目录' : '收起目录'" :label="leftCollapsed ? '›' : '‹'" @click="toggleLeft" />
      </header>
      <RendererTable v-if="owner && !leftCollapsed" :data-view-key="directoryKey" :children="directoryFields" :show-pagination="false"
        :show-data-view-meta="false" :highlight-current-row="true" :on-row-click="chooseWorkflow" />
    </aside>

    <main class="workflow-designs__canvas">
      <p v-if="loadError" role="alert">{{ loadError }}</p>
      <p v-if="publicationUnconfirmed" role="status">首次发布结果尚未确认，请再次点击“核验首次发布”；不会重复上传。</p>
      <p v-else-if="unconfirmed" role="status">保存结果尚未确认，请再次点击保存核验；不会重复写入。</p>
      <DisplayEmpty v-if="!workflowId" :description="owner ? '选择左侧工作流设计稿' : '正在装配工作流文件空间…'" />
      <template v-else-if="design">
        <section class="workflow-graph-panel" :style="childPath ? {flexBasis: `${splitRatio}%`} : undefined">
          <header class="workflow-graph-panel__title">Main Graph · {{ workflowId }}</header>
          <RendererGraph ref="mainGraph" class="workflow-graph" v-bind="graphProps('main')" />
        </section>
        <template v-if="childPath">
          <div class="workflow-graph-splitter" role="separator" aria-orientation="horizontal" @pointerdown="startSplit" />
          <section class="workflow-graph-panel">
            <header class="workflow-graph-panel__title">
              <span>Child Graph · {{ childPath }}</span>
              <RendererButton size="small" label="关闭子图" :disabled="busy" @click="openChild('')" />
            </header>
            <RendererGraph class="workflow-graph" v-bind="graphProps('child')" />
          </section>
        </template>
      </template>
    </main>

    <aside class="workflow-designs__tools">
      <section>
        <h3>工作流</h3>
        <RendererButton v-if="owner" v-bind="creationView ? {dataViewKey: viewKey(creationView)} : {}" label="新建工作流" :disabled="busy || !owner || creationId !== undefined" @click="openCreation" />
        <RendererButton v-if="owner && deletionView" v-bind="{dataViewKey: viewKey(deletionView)}" label="删除工作流" button-type="danger"
          :disabled="busy || !workflowId || deletionId !== undefined" @click="openDeletion" />
        <RendererButton label="刷新目录" :disabled="busy || !owner" @click="refreshDirectory" />
        <RendererButton label="流程属性" :disabled="!design || busy" @click="openDrawer('workflow')" />
        <RendererButton label="复制已保存 JSON" :disabled="!design || busy" @click="copyJson" />
        <RendererButton label="自动排版" :disabled="!design || busy" @click="mainGraph?.arrange()" />
        <RendererButton label="Definition" :disabled="!design || busy || publicationUnconfirmed" @click="openDefinition" />
        <RendererButton button-type="primary" :label="unconfirmed ? '核验保存结果' : '保存'" :disabled="!design || busy || publicationUnconfirmed || !hasPending" :loading="saving" @click="save" />
        <RendererButton label="取消修改" :disabled="!design || busy || unconfirmed || !hasPending" @click="cancel" />
        <RendererButton button-type="success" :label="publicationUnconfirmed ? '核验首次发布' : '发布 Definition'" :disabled="!design || busy" :loading="publishing" @click="publish" />
      </section>
      <section v-if="design">
        <h3>节点</h3>
        <RendererButton label="新增节点" :disabled="busy || !canAddNode(activeGraph)" @click="openNodeCreate" />
        <RendererButton label="节点属性" :disabled="busy || selected?.kind !== 'node'" @click="openDrawer('node')" />
        <RendererButton label="打开子图" :disabled="busy || !selectedChildPath" @click="openChild(selectedChildPath)" />
        <RendererButton label="删除节点" button-type="danger" :disabled="busy || selected?.kind !== 'node'" @click="removeNode" />
      </section>
      <section v-if="design">
        <h3>连线</h3>
        <RendererButton label="连线属性" :disabled="busy || selected?.kind !== 'edge'" @click="openDrawer('line')" />
        <RendererButton label="清空控制点" :disabled="busy || selected?.kind !== 'edge'" @click="clearControlPoints" />
        <RendererButton label="删除连线" button-type="danger" :disabled="busy || selected?.kind !== 'edge'" @click="removeLine" />
      </section>
      <section v-if="design">
        <h3>ClassModel</h3>
        <FieldText v-model="classModelRoot" label="Root Class" placeholder="Root Class" />
        <RendererButton size="small" label="查询" :loading="classModelLoading" @click="queryClassModel" />
        <p v-if="classModelError" role="alert">{{ classModelError }}</p>
        <RendererButton v-for="option in classModelOptions" :key="option.kind" size="small" :label="option.kind" :link="true" @click="classModelActive = option" />
      </section>
    </aside>

    <RendererDrawer v-model="drawerOpen" class="workflow-properties-drawer" direction="rtl" size="40vw" :title="drawerTitle">
      <template v-if="design && drawerTarget === 'workflow'">
        <RendererForm :data-view-key="viewKey(design.workflow)" :children="workflowFields" :grid-columns="1" :auto-columns="false" :show-data-view-meta="false" />
        <h4>变量</h4>
        <RendererTable :data-view-key="viewKey(design.variables)" :children="variableList" :toolbar="listToolbar(design.variables, 'name', '变量')"
          :show-pagination="false" :show-data-view-meta="false" :highlight-current-row="true" />
        <RendererForm v-if="currentRow(design.variables)" :data-view-key="viewKey(design.variables)" :children="variableFields" :grid-columns="1" :auto-columns="false" :show-data-view-meta="false" />
        <h4>能力</h4>
        <RendererTable :data-view-key="viewKey(design.capabilities)" :children="capabilityList" :toolbar="listToolbar(design.capabilities, 'id', '能力')"
          :show-pagination="false" :show-data-view-meta="false" :highlight-current-row="true" />
        <RendererForm v-if="currentRow(design.capabilities)" :data-view-key="viewKey(design.capabilities)" :children="capabilityFields" :grid-columns="1" :auto-columns="false" :show-data-view-meta="false" />
      </template>
      <RendererForm v-else-if="design && drawerTarget === 'node' && selected" :data-view-key="viewKey(graphViews(selected.graph).nodes)"
        :children="nodeFields" :grid-columns="1" :auto-columns="false" :show-data-view-meta="false" />
      <RendererForm v-else-if="design && drawerTarget === 'line' && selected" :data-view-key="viewKey(graphViews(selected.graph).lines)"
        :children="lineFields" :grid-columns="1" :auto-columns="false" :show-data-view-meta="false" />
    </RendererDrawer>

    <RendererDrawer :model-value="classModelActive !== null" class="class-model-drawer" direction="rtl" size="33vw" title="ClassModel 知识"
      @update:model-value="classModelActive = null">
      <div v-if="classModelActive" class="class-model-doc-panel">
        <h4>{{ classModelActive.kind }}</h4>
        <pre>{{ classModelDocText(classModelActive) }}</pre>
        <template v-if="classModelActive.constructorSignature">
          <code>{{ classModelActive.constructorSignature.signature }}</code>
          <pre>{{ classModelDocText(classModelActive.constructorSignature) }}</pre>
        </template>
        <details open>
          <summary>Attributes {{ classModelActive.attributes.length }}</summary>
          <section v-for="attribute in classModelActive.attributes" :key="attribute.name">
            <strong>{{ attribute.name }}</strong> <code>{{ attribute.typeText }}</code>
            <pre>{{ classModelDocText(attribute) }}</pre>
          </section>
        </details>
        <details open>
          <summary>Actions {{ classModelActive.methods.length }}</summary>
          <section v-for="method in classModelActive.methods" :key="method.name">
            <strong>{{ method.name }}</strong> <code>{{ method.signature }}</code>
            <pre>{{ classModelDocText(method) }}</pre>
          </section>
        </details>
      </div>
    </RendererDrawer>

    <WorkflowCreateDialog v-if="creationId !== undefined && creationView" :key="creationId" :data-view-key="viewKey(creationView)"
      :record-id="creationId" @finish="finishCreation" />
    <WorkflowDeleteDialog v-if="deletionId !== undefined && deletionView" :key="deletionId" :data-view-key="viewKey(deletionView)"
      :record-id="deletionId" @finish="finishDeletion" />

    <RendererDialog v-if="design && nodeCreateOpen" v-model="nodeCreateOpen" title="新增节点" :width="520">
      <RendererForm :grid-columns="1" :auto-columns="false" :show-data-view-meta="false" :form-props="{labelPosition: 'top'}">
        <FieldText :model-value="String(graphViews(activeGraph).nodes.queryContext['graphPath'] ?? '')" label="目标图" readonly />
        <FieldSelect v-model="nodeCreate.nodeKind" label="节点类型" :options="[...nodeKindOptions]" @update:model-value="resetNodeCreateDefaults" />
        <FieldText v-model="nodeCreate.id" label="节点 ID" />
        <FieldText v-model="nodeCreate.title" label="标题" />
        <FieldTextarea v-model="nodeCreate.desc" label="描述" :autosize="{minRows: 2, maxRows: 4}" />
      </RendererForm>
      <template #footer>
        <RendererButton label="取消" @click="nodeCreateOpen = false" />
        <RendererButton label="创建节点" button-type="primary" @click="createNode" />
      </template>
    </RendererDialog>

    <RendererDialog v-if="definitionOpen && owner" :model-value="true" title="Agent Workflow Definition" :width="760" :before-close="closeDefinition">
      <RendererForm :data-view-key="definitionKey" :grid-columns="1" :auto-columns="false" :show-data-view-meta="false">
        <FieldJson class="definition-json-input" field="content" label="definition.json" mode="text" value-format="text" height="460px" />
      </RendererForm>
      <template #footer>
        <RendererButton label="关闭" @click="closeDefinition()" />
        <RendererButton label="保存 Definition" button-type="primary" :loading="savingDefinition" :disabled="!definitionPending" @click="saveDefinition" />
      </template>
    </RendererDialog>
  </div>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref, shallowRef} from 'vue'
import {onBeforeRouteLeave} from 'vue-router'
import {buildDataViewKey, RequestState, type DataRow, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import {LowcodeApiError} from '@spark-appworks/spark-lowcode-api'
import {useSystemPageDirtySource} from '@spark-appworks/spark-app'
import * as SparkComponent from '@spark-appworks/spark-component'
import {createAgentWorkflowFileDataViewOwner, type AgentWorkflowDesignViews, type AgentWorkflowFileDataViewOwner} from '@/lowcode/resources/repository/agent-workflow/agent-workflow-file-owner'
import WorkflowCreateDialog from './workflow-designs/workflow-create-dialog.vue'
import WorkflowDeleteDialog from './workflow-designs/workflow-delete-dialog.vue'
import {AGENT_WORKFLOW_CREATE_TABLE} from '@/lowcode/resources/repository/agent-workflow/creation'
import {AGENT_WORKFLOW_DELETION_TABLE} from '@/lowcode/resources/repository/agent-workflow/deletion'
import {AGENT_WORKFLOW_PUBLICATION_TABLE} from '@/lowcode/resources/repository/agent-workflow/publication'
import {AGENT_WORKFLOW_FILE_TABLE} from '@/lowcode/resources/repository/agent-workflow/agent-workflow-file-resource'
import {createAgentWorkflowDefinitionFromDesign, formatJson, parseWorkflowDesignJson, type WorkflowDesignNodeCreateKind} from '@/services/workflow-designs'
import {classModelDocText, createClassModelKnowledgeProvider, readClassModelOptions, type ClassModelOption} from './workflow-designs/workflow-design-class-model'
import {WORKFLOW_NODE_HANDLES, workflowChildGraphPath, workflowEdgeNodeKeys, workflowLineRow, workflowNodeCorner, workflowNodePositions,
  workflowNodeRow} from './workflow-designs/workflow-design-graph'

const {DisplayEmpty, FieldJson, FieldSelect, FieldText, FieldTextarea, PAGE_RUNTIME, RendererDialog, RendererDrawer, RendererForm, RendererGraph,
  RendererTable, RendererButton, useSparkComponent, consumeRequiredPageService} = SparkComponent

type GraphRole = 'main' | 'child'
type GraphEvent<K extends 'onSelect' | 'onNodeMove' | 'onArrange' | 'onConnect' | 'onEdgePathChange'> = Parameters<NonNullable<SparkComponent.RGraphProps[K]>>[0]
type GraphSelection = GraphEvent<'onSelect'>
type GraphNodeMove = GraphEvent<'onNodeMove'>
type GraphArrange = GraphEvent<'onArrange'>
type GraphConnection = GraphEvent<'onConnect'>
type Selected = Readonly<{graph: GraphRole; kind: 'node' | 'edge'; id: string | number}>
type PublishFirstDefinitionInput = Readonly<{owner: AgentWorkflowFileDataViewOwner; workflowId: string; designContent: string; definitionContent: string}>

const nodeKindOptions = [
  {value: 'node', label: 'Business Node'},
  {value: 'start', label: 'Start'},
  {value: 'output', label: 'Output'},
] as const
const LEFT_COLLAPSED_KEY = 'spark.workflow-design.left-collapsed'
const SPLIT_KEY_PREFIX = 'spark.workflow-design.graph-split.'
const json = (field: string, label: string): SparkNode => ({type: 'r-json', props: {field, label, mode: 'text', valueFormat: 'native', height: 160}})
const text = (field: string, label: string, readonly = false): SparkNode => ({type: 'r-text', props: {field, label, ...readonly ? {readonly} : {}}})
const number = (field: string, label: string): SparkNode => ({type: 'r-number', props: {field, label}})
const directoryFields: SparkNode[] = [text('workflowId', 'Workflow ID'), text('timestamp', '更新时间')]
const workflowFields: SparkNode[] = [text('workflowId', 'Workflow ID', true), text('title', '名称'), number('version', '版本'),
  json('runtimeBinding', '运行绑定'), json('workflow', '流程其它配置'), json('document', '文档其它配置')]
const variableList: SparkNode[] = [text('name', '变量名'), text('title', '标题')]
const variableFields: SparkNode[] = [text('name', '变量名', true), text('title', '标题'), {type: 'r-switch', props: {field: 'required', label: '必填'}},
  json('schema', 'Schema'), json('defaultValue', '默认值'), json('extra', '其它配置')]
const capabilityList: SparkNode[] = [text('id', '能力 ID'), text('title', '标题'), text('scope', '范围')]
const capabilityFields: SparkNode[] = [text('id', '能力 ID', true), text('title', '标题'), text('scope', '范围'),
  {type: 'r-textarea', props: {field: 'description', label: '说明'}}, json('inputs', '输入'), json('outputs', '输出'), json('constraints', '约束'), json('extra', '其它配置')]
const nodeFields: SparkNode[] = [text('id', '节点 ID', true), text('type', '画布类型'), text('dataType', '节点类型'), text('title', '标题'),
  {type: 'r-textarea', props: {field: 'desc', label: '描述'}}, number('x', 'X'), number('y', 'Y'),
  ...([['inputs', '输入'], ['outputs', '输出'], ['capabilities', '能力'], ['models', '模型'], ['llm', 'LLM'], ['validation', '校验'],
    ['loop', '循环'], ['iteration', '迭代'], ['state', '状态'], ['result', '结果'], ['data', '其它数据'], ['extra', '其它配置']] as const).map(([field, label]) => json(field, label))]
const lineFields: SparkNode[] = [text('id', '连线 ID', true), text('fromNodeId', '起点节点'), text('fromModelId', '起点模型'), text('fromMemberName', '起点成员'),
  number('fromDock', '起点 dock'), text('toNodeId', '终点节点'), text('toModelId', '终点模型'), text('toMemberName', '终点成员'), number('toDock', '终点 dock'),
  text('type', '画布类型'), text('relation', '关系'),
  {type: 'r-select', props: {field: 'lineType', label: '线型', options: [{value: 'orthogonal', label: '正交折线'}, {value: 'straight', label: '直线折线'}, {value: 'bezier', label: '平滑曲线'}]}},
  json('controlPoints', '控制点'), json('from', '起点其它配置'), json('to', '终点其它配置'), json('data', '其它数据'), json('extra', '其它配置')]

const {sparkProvide, sparkRemove, sparkConsume} = useSparkComponent({type: 'workflow-designs-page'})
const pageService = consumeRequiredPageService(sparkConsume, 'workflow-designs-page')
if (!pageService) throw new Error('PAGE_SERVICE_MISSING: WorkflowDesigns 缺少页面服务能力')

const owner = shallowRef<AgentWorkflowFileDataViewOwner>()
const revision = ref(0)
const creationId = ref<string | number>()
const deletionId = ref<string | number>()
const creationView = computed(() => owner.value?.dataSet.getView(AGENT_WORKFLOW_CREATE_TABLE, 'default'))
const deletionView = computed(() => owner.value?.dataSet.getView(AGENT_WORKFLOW_DELETION_TABLE, 'default'))
const publicationView = computed(() => owner.value?.dataSet.getView(AGENT_WORKFLOW_PUBLICATION_TABLE, 'default'))
const workflowId = ref('')
const childPath = ref('')
const selected = ref<Selected | null>(null)
const activeGraph = ref<GraphRole>('main')
const loadError = ref('')
const acting = ref(false)
const saving = ref(false)
const publishing = ref(false)
const savingDefinition = ref(false)
const drawerOpen = ref(false)
const drawerTarget = ref<'workflow' | 'node' | 'line'>('workflow')
const nodeCreateOpen = ref(false)
const nodeCreate = ref<{nodeKind: WorkflowDesignNodeCreateKind; id: string; title: string; desc: string}>({nodeKind: 'node', id: '', title: '', desc: ''})
const definitionOpen = ref(false)
const leftCollapsed = ref(localStorage.getItem(LEFT_COLLAPSED_KEY) === '1')
const splitRatio = ref(55)
const mainGraph = ref<InstanceType<typeof RendererGraph>>()
const classModelRoot = ref('')
const classModelOptions = ref<ClassModelOption[]>([])
const classModelActive = ref<ClassModelOption | null>(null)
const classModelLoading = ref(false)
const classModelError = ref('')
let active = true
let stopChanges: (() => void) | undefined

const design = computed<AgentWorkflowDesignViews | undefined>(() => {
  revision.value
  if (!owner.value || !workflowId.value) return undefined
  try {return owner.value.design} catch {return undefined}
})
const designViews = computed<DataView[]>(() => design.value ? [design.value.workflow, design.value.nodes, design.value.lines, design.value.childNodes,
  design.value.childLines, design.value.variables, design.value.capabilities] : [])
const pendingIn = (view: DataView) => view.hasUnconfirmedSave || view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges()
const hasPending = computed(() => {revision.value; return designViews.value.some(pendingIn)})
const unconfirmed = computed(() => {revision.value; return designViews.value.some(view => view.hasUnconfirmedSave)})
const publicationUnconfirmed = computed(() => {revision.value; return publicationView.value?.hasUnconfirmedSave === true})
const busy = computed(() => {revision.value; return acting.value || saving.value || publishing.value || creationView.value?.mutating === true
  || deletionView.value?.mutating === true
  || publicationView.value?.mutating === true || designViews.value.some(view => view.mutating)})
const definitionPending = computed(() => {revision.value; const view = owner.value?.definitionView; return view ? pendingIn(view) : false})
const directoryKey = computed(() => owner.value ? viewKey(owner.value.directoryView) : '')
const definitionKey = computed(() => owner.value ? buildDataViewKey(AGENT_WORKFLOW_FILE_TABLE, 'definition', owner.value.dataSet.scenarioId) : '')
const drawerTitle = computed(() => drawerTarget.value === 'workflow' ? '流程属性' : drawerTarget.value === 'node' ? '节点属性' : '连线属性')
useSystemPageDirtySource({get isDirty() {revision.value; return hasPending.value || definitionPending.value
  || Boolean(creationView.value && pendingIn(creationView.value)) || Boolean(deletionView.value && pendingIn(deletionView.value))
  || Boolean(publicationView.value && pendingIn(publicationView.value))}})

function viewKey(view: DataView): string {return buildDataViewKey(view.tableName, view.viewId, view.dataSet?.scenarioId ?? '')}
function currentRow(view: DataView): DataRow | null {revision.value; return view.currentRow}
function graphViews(role: GraphRole): {nodes: DataView; lines: DataView} {
  const views = design.value
  if (!views) throw new Error('工作流设计视图尚未就绪')
  return role === 'main' ? {nodes: views.nodes, lines: views.lines} : {nodes: views.childNodes, lines: views.childLines}
}
function shownRows(view: DataView): DataRow[] {
  return view.rows.map(row => {const key = view.getPkKey(row); return key === undefined ? row : view.getEditingRow(key) ?? row})
}
function writable(view: DataView, row: DataRow, fields: readonly string[]): boolean {return fields.every(field => view.fieldAccess(row, field).write === 'allowed')}
function member(value: unknown, field: string): unknown {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? Object.entries(value).find(([key]) => key === field)?.[1] : undefined
}
function message(error: unknown): string {return error instanceof Error && error.message ? error.message : String(error)}
function canAddNode(role: GraphRole): boolean {revision.value; return Boolean(design.value) && graphViews(role).nodes.addActionState() === 'enabled'}

const selectedRow = computed(() => {
  revision.value
  const target = selected.value
  if (!target || !design.value) return null
  const {nodes, lines} = graphViews(target.graph), view = target.kind === 'node' ? nodes : lines
  return view.getEditingRow(target.id) ?? view.rows.find(row => view.getPkKey(row) === target.id) ?? null
})
const selectedChildPath = computed(() => selected.value?.kind === 'node' ? workflowChildGraphPath(selectedRow.value) : '')

function graphProps(role: GraphRole): SparkComponent.RGraphProps {
  revision.value
  const {nodes, lines} = graphViews(role)
  const nodeRows = shownRows(nodes), locked = busy.value
  const draggable = locked ? [] : nodes.rows.flatMap(row => writable(nodes, row, ['x', 'y']) ? [String(row['nodeKey'])] : [])
  const connectable = locked || lines.addActionState() !== 'enabled' ? [] : nodeRows.map(row => String(row['nodeKey']))
  return {dataViewKey: viewKey(nodes), edgeDataViewKey: viewKey(lines), labelField: 'title', descriptionField: 'desc', nodeCaptionField: 'dataType',
    nodeAppearance: 'card', backgroundPattern: 'dots', edgeSourceField: 'fromNodeId', edgeTargetField: 'toNodeId',
    edgeNodeKeys: workflowEdgeNodeKeys(nodeRows), nodePositions: workflowNodePositions(nodeRows), nodeHandles: WORKFLOW_NODE_HANDLES,
    edgeSourceHandleField: 'fromDock', edgeTargetHandleField: 'toDock', edgeLineTypeField: 'lineType', edgeControlPointsField: 'controlPoints',
    draggableKeys: draggable, connectableKeys: connectable, disabled: locked,
    onSelect: (event: GraphSelection) => select(role, event), onNodeMove: (event: GraphNodeMove) => moveNode(role, event),
    onArrange: (event: GraphArrange) => arrange(role, event), onConnect: (event: GraphConnection) => void connect(role, event),
    onEdgePathChange: event => graphViews(role).lines.updateEditingValue(event.id, 'controlPoints', event.controlPoints)}
}

function select(role: GraphRole, event: GraphSelection): void {
  selected.value = {graph: role, kind: event.kind, id: event.id}
  activeGraph.value = role
  if (event.open) openDrawer(event.kind === 'node' ? 'node' : 'line')
}

function moveNode(role: GraphRole, event: GraphNodeMove): void {
  const {nodes} = graphViews(role), corner = workflowNodeCorner(event)
  nodes.updateEditingValue(event.id, 'x', corner.x)
  nodes.updateEditingValue(event.id, 'y', corner.y)
}

function arrange(role: GraphRole, event: GraphArrange): void {
  const {nodes} = graphViews(role)
  if (event.nodes.some(node => {const row = nodes.rows.find(item => nodes.getPkKey(item) === node.id); return !row || !writable(nodes, row, ['x', 'y'])})) {
    event.control.cancel = true
    pageService.showMessage('存在不可修改位置的节点，不能自动排版', 'error')
    return
  }
  for (const node of event.nodes) moveNode(role, {...node, edges: []})
}

async function connect(role: GraphRole, event: GraphConnection): Promise<void> {
  const {nodes, lines} = graphViews(role), nodeRows = shownRows(nodes)
  const idOf = (key: string | number) => nodeRows.find(row => row['nodeKey'] === key)?.['id']
  const from = idOf(event.source), to = idOf(event.target)
  if (typeof from !== 'string' || typeof to !== 'string') return
  try {
    const row = await lines.addRow(workflowLineRow({from, to, fromDock: Number(event.sourceHandle ?? 0), toDock: Number(event.targetHandle ?? 0),
      existingIds: shownRows(lines).flatMap(line => typeof line['id'] === 'string' ? [line['id']] : [])}))
    const key = lines.getPkKey(row)
    if (key !== undefined) selected.value = {graph: role, kind: 'edge', id: key}
  } catch (error) {pageService.showMessage(`新增连线失败: ${message(error)}`, 'error')}
}

function openDrawer(target: 'workflow' | 'node' | 'line'): void {
  if (target !== 'workflow' && selected.value) {
    const {nodes, lines} = graphViews(selected.value.graph), view = target === 'node' ? nodes : lines
    view.setCurrentRowById(selected.value.id)
  }
  drawerTarget.value = target
  drawerOpen.value = true
}

function listToolbar(view: DataView, keyField: string, label: string): SparkComponent.RToolbarProps {
  revision.value
  const row = view.currentRow, key = row ? view.getPkKey(row) : undefined
  return {children: [
    {type: 'r-button', props: {label: `新增${label}`, disabled: busy.value || view.addActionState() !== 'enabled', onClick: () => void addListRow(view, keyField, label)}},
    {type: 'r-button', props: {label: `删除${label}`, disabled: busy.value || !row || key === undefined
      || !view.dirtyTracking.isPendingCreate(key) && view.deleteActionState(row) !== 'enabled', onClick: () => key !== undefined && void view.removeRow(key)}},
  ]}
}

async function addListRow(view: DataView, keyField: string, label: string): Promise<void> {
  try {
    const value = await pageService.showPrompt(`输入${label}的 ${keyField}`, `新增${label}`)
    if (value === null) return
    const id = String(value).trim()
    if (!id) return
    if (shownRows(view).some(row => row[keyField] === id)) {pageService.showMessage(`${label} ${id} 已存在`, 'error'); return}
    view.setCurrentRow(await view.addRow({[keyField]: id}))
  } catch (error) {pageService.showMessage(`新增${label}失败: ${message(error)}`, 'error')}
}

function openNodeCreate(): void {
  nodeCreate.value = {nodeKind: 'node', id: '', title: '', desc: ''}
  resetNodeCreateDefaults()
  nodeCreateOpen.value = true
}

function resetNodeCreateDefaults(): void {
  const kind = nodeCreate.value.nodeKind
  nodeCreate.value.id = kind === 'node' ? 'node.model' : kind
  nodeCreate.value.title = kind === 'node' ? 'Business Node' : kind === 'start' ? 'Start' : 'Output'
}

async function createNode(): Promise<void> {
  const {nodes} = graphViews(activeGraph.value), rows = shownRows(nodes)
  const id = nodeCreate.value.id.trim()
  if (!id || rows.some(row => row['id'] === id)) {pageService.showMessage(`节点 ID 为空或已存在: ${id}`, 'error'); return}
  try {
    const row = await nodes.addRow(workflowNodeRow({...nodeCreate.value, id, index: rows.length}))
    const key = nodes.getPkKey(row)
    if (key !== undefined) selected.value = {graph: activeGraph.value, kind: 'node', id: key}
    nodeCreateOpen.value = false
  } catch (error) {pageService.showMessage(`新增节点失败: ${message(error)}`, 'error')}
}

async function removeRows(view: DataView, keys: ReadonlyArray<string | number>): Promise<void> {
  for (const key of keys) {
    const result = await view.removeRow(key)
    if (result === false || typeof result === 'object' && !result.success) throw new Error(`${view.tableName} ${String(key)} 不能删除`)
  }
}

async function removeNode(): Promise<void> {
  const target = selected.value, row = selectedRow.value
  if (target?.kind !== 'node' || !row) return
  const {nodes, lines} = graphViews(target.graph), type = row['dataType']
  if ((type === 'start' || type === 'output') && shownRows(nodes).filter(item => item['dataType'] === type).length <= 1) {
    pageService.showMessage('至少保留一个 start 和 output 节点', 'warning')
    return
  }
  if (!await pageService.showConfirm(`确定删除节点 ${String(row['title'] ?? row['id'])}？相关连线也会被删除。`, '删除节点', {type: 'warning', confirmText: '删除', cancelText: '取消'})) return
  acting.value = true
  try {
    const nested = `${String(row['graphPath'])}.${String(row['id'])}.`
    if (childPath.value.startsWith(nested)) await openChild('')
    const incident = shownRows(lines).filter(line => line['fromNodeId'] === row['id'] || line['toNodeId'] === row['id'])
    await removeRows(lines, incident.flatMap(line => {const key = lines.getPkKey(line); return key === undefined ? [] : [key]}))
    await removeRows(nodes, [target.id])
    selected.value = null
  } catch (error) {pageService.showMessage(`删除节点失败: ${message(error)}`, 'error')} finally {acting.value = false}
}

async function removeLine(): Promise<void> {
  const target = selected.value
  if (target?.kind !== 'edge') return
  try {await removeRows(graphViews(target.graph).lines, [target.id]); selected.value = null} catch (error) {pageService.showMessage(`删除连线失败: ${message(error)}`, 'error')}
}

function clearControlPoints(): void {
  const target = selected.value
  if (target?.kind === 'edge') graphViews(target.graph).lines.updateEditingValue(target.id, 'controlPoints', [])
}

async function openChild(path: string): Promise<void> {
  const views = design.value
  if (!views || !owner.value) return
  if ([views.childNodes, views.childLines].some(pendingIn)) {pageService.showMessage('子图有未保存的修改，请先保存或取消', 'error'); return}
  acting.value = true
  try {
    await owner.value.loadChildGraph(path)
    childPath.value = path
    if (selected.value?.graph === 'child') selected.value = null
    activeGraph.value = path ? 'child' : 'main'
    splitRatio.value = Number(localStorage.getItem(SPLIT_KEY_PREFIX + workflowId.value)) || 55
  } catch (error) {pageService.showMessage(`打开子图失败: ${message(error)}`, 'error')} finally {acting.value = false}
}

function startSplit(event: PointerEvent): void {
  const panel = event.currentTarget instanceof HTMLElement ? event.currentTarget.parentElement : null
  if (!panel) return
  const bounds = panel.getBoundingClientRect()
  const move = (next: PointerEvent) => {splitRatio.value = Math.min(78, Math.max(22, (next.clientY - bounds.top) / bounds.height * 100))}
  const stop = () => {
    window.removeEventListener('pointermove', move)
    localStorage.setItem(SPLIT_KEY_PREFIX + workflowId.value, String(Math.round(splitRatio.value)))
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', stop, {once: true})
}

function toggleLeft(): void {
  leftCollapsed.value = !leftCollapsed.value
  localStorage.setItem(LEFT_COLLAPSED_KEY, leftCollapsed.value ? '1' : '0')
}

function editableViews(): DataView[] {return [...designViews.value, ...(owner.value ? [owner.value.definitionView] : []),
  ...(creationView.value ? [creationView.value] : []), ...(deletionView.value ? [deletionView.value] : []),
  ...(publicationView.value ? [publicationView.value] : [])]}

async function confirmDiscard(): Promise<boolean> {
  const inFlight = (view: DataView) => view.mutating || view.requestState === RequestState.Preparing || view.requestState === RequestState.Loading
  if (editableViews().some(inFlight)) {pageService.showMessage('查询或提交进行中，请等待结果', 'error'); return false}
  const current = owner.value, targetId = workflowId.value, command = creationView.value, commandId = creationId.value
  const commandRows = command ? [...command.rows] : []
  const publication = publicationView.value, publicationRows = publication ? [...publication.rows] : []
  const pendingViews = editableViews().filter(pendingIn)
  if (pendingViews.length === 0) return true
  if (pendingViews.some(view => view.hasUnconfirmedSave)) {pageService.showMessage('保存结果尚未确认，请先核验保存', 'error'); return false}
  if (!await pageService.showConfirm('当前工作流设计有未保存更改，是否丢弃？', '丢弃修改', {type: 'warning', confirmText: '丢弃', cancelText: '取消'})) return false
  if (!active || owner.value !== current || workflowId.value !== targetId || creationView.value !== command || creationId.value !== commandId
    || publicationView.value !== publication
    || command && (command.rows.length !== commandRows.length || command.rows.some((row, index) => row !== commandRows[index]))
    || publication && (publication.rows.length !== publicationRows.length || publication.rows.some((row, index) => row !== publicationRows[index]))
    || pendingViews.some(view => view.destroyed || inFlight(view))
    || editableViews().filter(pendingIn)
      .some(view => inFlight(view) || view.hasUnconfirmedSave || !pendingViews.includes(view))) {
    pageService.showMessage('原工作流已变化或保存结果尚未确认，请先处理原提交', 'error')
    return false
  }
  for (const view of pendingViews) view.discardPendingChanges()
  creationId.value = undefined
  return true
}

async function chooseWorkflow(row: DataRow): Promise<void> {
  const id = row['workflowId']
  if (busy.value || creationId.value !== undefined) return
  if (typeof id !== 'string' || !id || id === workflowId.value || !owner.value) return
  const current = owner.value
  if (!await confirmDiscard() || !active || owner.value !== current) return
  acting.value = true
  loadError.value = ''
  workflowId.value = ''
  nodeCreateOpen.value = false
  childPath.value = ''
  selected.value = null
  activeGraph.value = 'main'
  try {
    await current.loadDesign(id)
    if (!active || owner.value !== current) return
    workflowId.value = id
    const rootClass = member(member(design.value?.workflow.rows[0]?.['runtimeBinding'], 'modelProjectionRef'), 'rootClassName')
    classModelRoot.value = typeof rootClass === 'string' ? rootClass : ''
  } catch (error) {
    if (active && owner.value === current) loadError.value = `${row['status'] === 'created' ? '首稿已创建，但' : ''}打开工作流失败: ${message(error)}`
  } finally {acting.value = false}
}

async function openCreation(): Promise<void> {
  const current = owner.value, view = creationView.value
  if (!current || busy.value || creationId.value !== undefined) return
  acting.value = true
  try {
    if (!view || view.dataSet !== current.dataSet || view.dataTable?.resourceType !== 'command') throw new Error('正式工作流场景缺少首稿创建命令')
    if (pendingIn(view)) throw new Error('原创建命令仍有未处理或待核验的修改')
    const loaded = await view.loadFromServer()
    if (!active || owner.value !== current || view.destroyed) return
    if (!loaded.success) throw loaded.error ?? new Error(loaded.message ?? '创建命令初始化失败')
    if (pendingIn(view)) throw new Error('原创建命令在打开期间已变化')
    const row = await view.addRow({title: ''})
    if (!active || owner.value !== current || view.destroyed) return
    if (!('commandId' in row) || typeof row['commandId'] !== 'string') throw new Error('创建命令未返回原记录身份')
    view.setCurrentRow(row)
    creationId.value = row['commandId']
  } catch (error) {if (active) pageService.showMessage(`打开新建失败: ${message(error)}`, 'error')}
  finally {acting.value = false}
}

async function finishCreation(result: 'saved' | 'cancelled' | 'preserved'): Promise<void> {
  const current = owner.value, view = creationView.value, id = creationId.value
  if (!active || !current || !view || id === undefined) return
  if (result !== 'saved') {creationId.value = undefined; return}
  creationId.value = undefined
  const row = view.rows.find(item => view.getPkKey(item) === id)
  if (!row || view.fieldAccess(row, 'workflowId').read !== 'visible' || view.fieldAccess(row, 'status').read !== 'visible'
    || row['status'] !== 'created' || typeof row['workflowId'] !== 'string') {
    pageService.showMessage('首稿创建已返回，但原创建回执不可读；请保留原命令核查', 'error')
    return
  }
  const target = row['workflowId']
  const assertReceipt = () => {
    if (view.destroyed || current.runtime.resolveView(viewKey(view)) !== view || !view.rows.includes(row)
      || row['workflowId'] !== target || row['status'] !== 'created'
      || ['workflowId', 'status'].some(field => view.fieldAccess(row, field).read !== 'visible')) throw new Error('原创建回执已变化或不可读')
  }
  pageService.showMessage('工作流首稿已创建', 'success')
  acting.value = true
  try {
    await current.refreshDirectory()
    if (!active || owner.value !== current) return
    assertReceipt()
  } catch (error) {
    if (active) pageService.showMessage(`首稿已创建，但目录刷新失败: ${message(error)}`, 'error')
    return
  } finally {acting.value = false}
  if (active && owner.value === current) await chooseWorkflow(row)
}

async function refreshDirectory(): Promise<void> {
  try {await owner.value?.refreshDirectory()} catch (error) {pageService.showMessage(`刷新目录失败: ${message(error)}`, 'error')}
}

async function openDeletion(): Promise<void> {
  const current = owner.value, view = deletionView.value, target = workflowId.value
  if (!current || busy.value || deletionId.value !== undefined || !target) return
  acting.value = true
  try {
    if (!view || view.dataSet !== current.dataSet || view.dataTable?.resourceType !== 'command') throw new Error('正式工作流场景缺少删除命令')
    if (pendingIn(view)) throw new Error('原删除命令仍有未处理或待核验的修改')
    const loaded = await view.loadFromServer()
    if (!active || owner.value !== current || view.destroyed) return
    if (!loaded.success) throw loaded.error ?? new Error(loaded.message ?? '删除命令初始化失败')
    const row = await view.addRow({workflowId: target})
    if (!active || owner.value !== current || view.destroyed) return
    if (!('commandId' in row) || typeof row['commandId'] !== 'string') throw new Error('删除命令未返回原记录身份')
    view.setCurrentRow(row)
    deletionId.value = row['commandId']
  } catch (error) {if (active) pageService.showMessage(`打开删除失败: ${message(error)}`, 'error')}
  finally {acting.value = false}
}

async function finishDeletion(result: 'saved' | 'cancelled' | 'preserved'): Promise<void> {
  const current = owner.value, view = deletionView.value, id = deletionId.value, target = workflowId.value
  if (!active || !current || !view || id === undefined) return
  if (result !== 'saved') {deletionId.value = undefined; return}
  deletionId.value = undefined
  const row = view.rows.find(item => view.getPkKey(item) === id)
  if (!row || row['status'] !== 'deleted' || row['workflowId'] !== target) {
    pageService.showMessage('删除已返回，但原删除回执不可读；请保留原命令核查', 'error')
    return
  }
  pageService.showMessage('工作流已删除', 'success')
  workflowId.value = ''
  childPath.value = ''
  selected.value = null
  try {
    await current.refreshDirectory()
    if (active && owner.value === current) revision.value++
  } catch (error) {
    if (active) pageService.showMessage(`删除成功，但目录刷新失败: ${message(error)}`, 'error')
  }
}

async function save(): Promise<boolean> {
  const current = owner.value
  if (!current || !design.value) return false
  if (publicationUnconfirmed.value) {pageService.showMessage('首次发布结果尚未确认，请先核验原命令', 'error'); return false}
  saving.value = true
  try {
    const views = designViews.value.filter(pendingIn).map(view => ({tableName: view.tableName, viewId: view.viewId}))
    const result = await current.dataSet.saveChanges({views})
    if (!result.success || designViews.value.some(pendingIn)) throw result.error ?? new Error(result.message ?? 'design.json 保存回执未确认')
    pageService.showMessage('设计稿已保存', 'success')
    void refreshDirectory()
    return true
  } catch (error) {
    pageService.showMessage(`保存失败: ${message(error)}`, 'error')
    return false
  } finally {saving.value = false; revision.value++}
}

function cancel(): void {
  if (unconfirmed.value) return
  for (const view of designViews.value) view.discardPendingChanges()
  revision.value++
}

async function copyJson(): Promise<void> {
  const current = owner.value
  if (!current) return
  try {
    await navigator.clipboard.writeText(await current.readDocument(workflowId.value, 'design.json'))
    pageService.showMessage('已保存的 design.json 已复制', 'success')
  } catch (error) {pageService.showMessage(`复制失败: ${message(error)}`, 'error')}
}

async function loadDefinitionRow(): Promise<{view: DataView; id: string | number}> {
  const current = owner.value
  if (!current) throw new Error('工作流文件空间尚未就绪')
  const view = current.definitionView
  if (!pendingIn(view)) {
    try {await current.loadDocument(workflowId.value, 'definition.json')} catch (error) {
      throw new Error(`definition.json 不存在或不可读；本页面不创建文件（${message(error)}）`)
    }
  }
  const row = view.currentRow, id = row ? view.getPkKey(row) : undefined
  if (!row || id === undefined || row['workflowId'] !== workflowId.value || row['fileName'] !== 'definition.json'
    || typeof row['content'] !== 'string' || view.fieldAccess(row, 'content').read !== 'visible'
    || !view.hasUnconfirmedSave && view.fieldAccess(row, 'content').write !== 'allowed') {
    throw new Error('definition.json 原工作流行不可读写或仍有其他目标的待处理修改')
  }
  return {view, id}
}

async function loadDefinitionRowForPublish(): Promise<{view: DataView; id: string | number} | null> {
  const current = owner.value
  if (!current) throw new Error('工作流文件空间尚未就绪')
  const view = current.definitionView
  if (pendingIn(view)) throw new Error('definition.json 有未保存或待核验的修改')
  try {await current.loadDocument(workflowId.value, 'definition.json')} catch (error) {
    if (error instanceof LowcodeApiError && error.code === 404) return null
    throw new Error(`读取 definition.json 失败，拒绝首发或覆盖（${message(error)}）`)
  }
  const row = view.currentRow, id = row ? view.getPkKey(row) : undefined
  if (!row || id === undefined || row['workflowId'] !== workflowId.value || row['fileName'] !== 'definition.json'
    || typeof row['content'] !== 'string' || view.fieldAccess(row, 'content').read !== 'visible'
    || view.fieldAccess(row, 'content').write !== 'allowed') throw new Error('definition.json 原工作流行不可读写')
  return {view, id}
}

async function savePublicationCommand(view: DataView, id: string | number): Promise<DataRow> {
  const dataSet = view.dataSet
  if (!dataSet) throw new Error('首次发布命令视图已释放')
  const result = await dataSet.saveChanges({views: [{tableName: view.tableName, viewId: view.viewId, ids: [id]}]})
  if (!result.success || pendingIn(view)) throw result.error ?? new Error(result.message ?? '首次发布命令回执未确认')
  const row = view.rows.find(item => view.getPkKey(item) === id)
  if (!row || row['status'] !== 'published' || row['workflowId'] !== workflowId.value
    || ['workflowId', 'status'].some(field => view.fieldAccess(row, field).read !== 'visible')) {
    throw new Error('首次发布回执缺失或目标身份不匹配')
  }
  return row
}

async function publishFirstDefinition(input: PublishFirstDefinitionInput): Promise<void> {
  const {owner: current, workflowId: targetId, designContent, definitionContent} = input
  const view = publicationView.value
  if (!view || view.dataSet !== current.dataSet || view.dataTable?.resourceType !== 'command') throw new Error('正式工作流场景缺少首次发布命令')
  if (pendingIn(view)) throw new Error('首次发布命令仍有未处理或待核验的修改')
  const loaded = await view.loadFromServer()
  if (!active || owner.value !== current || workflowId.value !== targetId || view.destroyed) throw new Error('首次发布目标已变化')
  if (!loaded.success) throw loaded.error ?? new Error(loaded.message ?? '首次发布命令初始化失败')
  if (pendingIn(view)) throw new Error('首次发布命令在初始化期间已变化')
  const row = await view.addRow({workflowId: targetId, designContent, definitionContent})
  if (!active || owner.value !== current || workflowId.value !== targetId || view.destroyed) {
    if (!view.destroyed && pendingIn(view)) view.discardPendingChanges()
    throw new Error('首次发布目标在创建命令行期间已变化')
  }
  const id = view.getPkKey(row)
  if (id === undefined) throw new Error('首次发布命令缺少原始身份')
  view.setCurrentRow(row)
  try {await savePublicationCommand(view, id)} catch (error) {
    if (!view.hasUnconfirmedSave && pendingIn(view)) view.discardPendingChanges()
    throw error
  }
}

async function openDefinition(): Promise<void> {
  try {await loadDefinitionRow(); definitionOpen.value = true} catch (error) {pageService.showMessage(`打开 Definition 失败: ${message(error)}`, 'error')}
}

async function saveDefinitionView(view: DataView, id: string | number): Promise<void> {
  const dataSet = view.dataSet
  if (!dataSet) throw new Error('definition.json 视图已释放')
  const result = await dataSet.saveChanges({views: [{tableName: AGENT_WORKFLOW_FILE_TABLE, viewId: 'definition', ids: [id]}]})
  if (!result.success || pendingIn(view)) throw result.error ?? new Error(result.message ?? 'definition.json 保存回执未确认')
}

async function saveDefinition(): Promise<void> {
  const view = owner.value?.definitionView, row = view?.currentRow, id = row ? view?.getPkKey(row) : undefined
  if (!view || id === undefined) return
  savingDefinition.value = true
  try {await saveDefinitionView(view, id); pageService.showMessage('definition.json 已保存', 'success')} catch (error) {
    pageService.showMessage(`保存 Definition 失败: ${message(error)}`, 'error')
  } finally {savingDefinition.value = false; revision.value++}
}

async function closeDefinition(done?: () => void): Promise<void> {
  const current = owner.value, targetId = workflowId.value, view = current?.definitionView
  if (view && definitionPending.value) {
    if (view.hasUnconfirmedSave) {pageService.showMessage('definition.json 保存结果尚未确认', 'error'); return}
    const row = view.currentRow
    let assertRow: () => void
    try {
      if (!row) throw new Error('原Definition行已失效')
      assertRow = view.captureReadRow(row, ['workflowId', 'fileName', 'content'])
    } catch (error) {pageService.showMessage(`关闭 Definition 失败: ${message(error)}`, 'error'); return}
    if (!await pageService.showConfirm('definition.json 有未保存更改，是否丢弃？', '关闭 Definition', {type: 'warning', confirmText: '丢弃', cancelText: '取消'})) return
    if (owner.value !== current || workflowId.value !== targetId || view.destroyed || view.hasUnconfirmedSave || view.currentRow !== row) {
      pageService.showMessage('原Definition已变化或保存结果尚未确认，请先处理原提交', 'error'); return
    }
    try {assertRow()} catch (error) {pageService.showMessage(`关闭 Definition 失败: ${message(error)}`, 'error'); return}
    view.discardPendingChanges()
  }
  definitionOpen.value = false
  done?.()
}

async function publish(): Promise<void> {
  const current = owner.value, targetId = workflowId.value
  if (!current) return
  const publication = publicationView.value
  if (publication?.hasUnconfirmedSave) {
    const row = publication.currentRow, id = row ? publication.getPkKey(row) : undefined
    if (id === undefined) {pageService.showMessage('首次发布未知结果缺少原命令行', 'error'); return}
    publishing.value = true
    try {await savePublicationCommand(publication, id); pageService.showMessage('definition.json 首次发布已确认', 'success')}
    catch (error) {pageService.showMessage(`首次发布结果仍未确认: ${message(error)}`, 'error')}
    finally {publishing.value = false; revision.value++}
    return
  }
  if (publication && pendingIn(publication)) {pageService.showMessage('首次发布命令有未处理修改，请先处理原命令', 'error'); return}
  if (pendingIn(current.definitionView)) {
    pageService.showMessage('发布失败: definition.json 有未保存或待核验的修改，请先在 Definition 中处理原行', 'error')
    return
  }
  if (hasPending.value && !await save()) return
  publishing.value = true
  try {
    const existing = await loadDefinitionRowForPublish()
    if (owner.value !== current || workflowId.value !== targetId || publicationUnconfirmed.value || hasPending.value) {
      throw new Error('发布目标已变化、设计稿有未保存修改或首次发布待核验')
    }
    const assertRow = existing
      ? existing.view.captureReadRow(existing.view.currentRow!, ['workflowId', 'fileName', 'content'])
      : undefined
    const source = await current.readDocument(targetId, 'design.json')
    if (owner.value !== current || workflowId.value !== targetId || publicationUnconfirmed.value
      || hasPending.value || existing && pendingIn(existing.view)) {
      throw new Error('发布目标、设计稿或 Definition 在读取期间已变化')
    }
    assertRow?.()
    const definition = createAgentWorkflowDefinitionFromDesign(parseWorkflowDesignJson(source))
    if (definition.x_spark.validation.status === 'invalid') {
      throw new Error(definition.x_spark.validation.issues.find(issue => issue.severity === 'error')?.message ?? 'definition 校验未通过')
    }
    const definitionContent = formatJson(definition)
    if (!existing) {
      await publishFirstDefinition({owner: current, workflowId: targetId, designContent: source, definitionContent})
      pageService.showMessage('definition.json 已首次发布', 'success')
      return
    }
    const {view, id} = existing
    view.updateEditingValue(id, 'content', definitionContent)
    await saveDefinitionView(view, id)
    pageService.showMessage('definition.json 已发布', 'success')
  } catch (error) {
    pageService.showMessage(`发布失败: ${message(error)}`, 'error')
  } finally {publishing.value = false; revision.value++}
}

async function queryClassModel(): Promise<void> {
  const root = classModelRoot.value.trim()
  if (!root) {classModelError.value = 'Root Class 不能为空'; return}
  classModelLoading.value = true
  classModelError.value = ''
  try {classModelOptions.value = readClassModelOptions(await createClassModelKnowledgeProvider(root).query({includeMembers: true}))} catch (error) {
    classModelError.value = `ClassModel 读取失败: ${message(error)}`
  } finally {classModelLoading.value = false}
}

onMounted(async () => {
  try {
    const created = await createAgentWorkflowFileDataViewOwner()
    if (!active) {created.dispose(); return}
    sparkProvide(PAGE_RUNTIME, created.runtime)
    owner.value = created
    const changed = () => {revision.value++}
    stopChanges = created.dataSet.onAnyViewChange({rowsChanged: changed, currentRowChanged: changed, editingChanged: changed,
      requestStateChanged: changed, mutatingChanged: changed})
    await created.refreshDirectory()
    const first = created.directoryView.rows.find(row => typeof row['workflowId'] === 'string')
    if (first && active) await chooseWorkflow(first)
  } catch (error) {
    if (active) loadError.value = `加载工作流设计稿失败: ${message(error)}`
  }
})

onBeforeRouteLeave(() => confirmDiscard())

onBeforeUnmount(() => {
  active = false
  stopChanges?.()
  sparkRemove(PAGE_RUNTIME)
  owner.value?.dispose()
})
</script>

<style scoped src="./workflow-designs/workflow-designs.css"></style>
