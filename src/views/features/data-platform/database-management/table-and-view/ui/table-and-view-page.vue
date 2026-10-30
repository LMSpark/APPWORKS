<!--
@module app:views/features/data-platform/database-management/table-and-view/ui/table-and-view-page
职责：库/表/视图/字段目录；登记与字段维护经 DataSet.saveChanges；标准字段子组件消费正式列元数据并绑定所属 DataView。
-->
<template>
  <section class="table-and-view-page">
    <header><h1>表和视图管理</h1><p>登记库/表并维护字段目录；读写均经同一 DataSet。</p></header>
    <p v-if="loading" role="status">正在读取目录…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="ready">
      <p v-if="dbListError" role="alert">{{ dbListError }}</p>
      <p v-if="message" role="status">{{ message }}</p>
      <div class="table-and-view-layout">
        <section class="table-and-view-sidebar">
          <h2>数据库列表</h2>
          <div :inert="busy || !!tableEdit">
            <RendererTable :data-view-key="dbKey" :auto-columns="true" :toolbar="dbToolbar" :filter="catalogListFilter" :stripe="true"
              :on-current-change="guardDatabaseCurrentChange" :on-row-click="chooseDatabase"
              :highlight-current-row="true" :show-pagination="true" :show-data-view-meta="false" />
          </div>
        </section>
        <section v-if="databaseSelected" class="table-and-view-main">
          <RendererTabs v-model="objectTab">
            <RendererTabPane name="tables" label="物理表" :index="0">
              <p v-if="tableListError" role="alert">{{ tableListError }}</p>
              <RendererTable :data-view-key="tableKey" :children="DATABASE_CATALOG_TABLE_LIST_FIELDS" :toolbar="tableToolbar" :stripe="true" :show-pagination="true" :show-data-view-meta="false"
                :on-row-click="chooseTable" :highlight-current-row="true" />
            </RendererTabPane>
            <RendererTabPane name="views" label="视图" :index="1" :lazy="true">
              <p v-if="viewListError" role="alert">{{ viewListError }}</p>
              <RendererTable :data-view-key="viewKey" :children="DATABASE_CATALOG_VIEW_LIST_FIELDS" :toolbar="viewToolbar" :stripe="true" :show-pagination="true" :show-data-view-meta="false"
                :on-row-click="chooseView" :highlight-current-row="true" />
            </RendererTabPane>
          </RendererTabs>
          <section v-if="resourceSelected" class="table-and-view-fields">
            <h2>字段</h2>
            <p v-if="fieldListError" role="alert">{{ fieldListError }}</p>
            <RendererTable :data-view-key="fieldKey" :children="fieldGridChildren" :toolbar="childToolbar" :stripe="true" :show-pagination="true" :show-data-view-meta="false" />
          </section>
          <p v-else class="table-and-view-hint">选择一张表或视图以查看字段目录。</p>
        </section>
        <p v-else class="table-and-view-hint">请从左侧选择数据库（连接已在服务器管理配置，本页不再重复选择服务器）。</p>
      </div>
      <RegisterDialog v-if="objectRegisterOpen"
        :database-label="selectedDatabaseLabel" :object-type="objectRegisterType"
        :list-key="objectRegisterListKey" :progress-key="objectRegisterProgressKey"
        :command-input-key="commandInputKey" :busy="busy"
        :has-unconfirmed="objectRegisterHasUnconfirmed" :has-pending="objectRegisterHasPending"
        :requires-cancel="objectRegisterRequiresCancel"
        :load-list="loadObjectRegisterList"
        @update:object-type="value => objectRegisterType = value"
        @cancel="closeObjectRegister" @confirm="confirmObjectRegister" @verify="verifyObjectRegister"
        @discard-pending="discardPendingObjectRegister" />
      <AddTableDialog v-if="tableEditing"
        :table-key="tableKey" :database-label="selectedDatabaseLabel" :editing="tableEditing"
        :busy="busy" :action-error="actionError" :unregistered-hint="unregisteredTableHint"
        :can-load-unregistered="canLoadUnregisteredTables"
        @cancel="cancelTableRegister" @save="saveTableRegister" @load-unregistered="loadUnregisteredTableNames" />
      <TableDesignDialog v-if="tableDesignOpen"
        title="表设计" :object-label="selectedTableLabel" :object-meta-key="tableKey"
        :object-header-children="DATABASE_CATALOG_TABLE_DESIGN_HEADER_FIELDS"
        :field-key="fieldKey" :field-children="fieldGridChildren"
        :relation-key="relationKey" :relation-list-fields="DATABASE_CATALOG_RELATION_LIST_FIELDS"
        :relation-toolbar="relationToolbar" :relation-error="relationListError"
        :workflow-key="workflowKey" :workflow-list-fields="workflowListFields" :workflow-toolbar="workflowToolbar"
        :workflow-error="workflowListError" :workflow-query="workflowQuery"
        :preview-key="previewKey" :preview-toolbar="previewToolbar" :preview-error="previewListError"
        :toolbar="designFieldToolbar" :hint="designFieldHint"
        :busy="busy" :error="fieldListError" :on-relation-row-click="chooseRelation" @close="closeTableDesign"
        @open-preview="refreshTablePreview" @open-workflow="refreshTableWorkflows"
        @apply-workflow-filter="applyTableWorkflowFilter" @update:workflow-query="applyWorkflowQueryUpdate" />
      <TableRelationDialog v-if="relationSession"
        :data-view-key="relationKey" :peer-data-view-key="relationPeerKey" :peer-field="relationPeerField"
        :session="relationSession" :current-table-label="selectedTableLabel"
        :columns="relationExpressionColumns" :function-context="relationExpressionContext"
        :expression-loading="relationExpressionLoading" :expression-error="relationExpressionError" :expression-warning="relationExpressionWarning"
        :on-expression-editing-change="value => setRelationExpressionEditing(relationSession!, value)"
        :busy="relationEditorBusy" :unconfirmed="relationView?.hasUnconfirmedSave === true" :action-error="actionError"
        :on-peer-change="onRelationPeerChange"
        @switch-role="switchRelationRole"
        @cancel="cancelRelationDialog" @save="saveRelationDialog" />
      <CopyTableDialog v-if="copyTableOpen"
        :source-label="selectedTableLabel" :busy="busy" :action-error="actionError"
        @cancel="copyTableOpen = false" @save="saveCopyTable" />
      <ViewDesignDialog v-if="viewDesignOpen"
        title="视图设计" :object-label="selectedViewLabel" :object-meta-key="viewKey"
        :design-form-children="DATABASE_CATALOG_VIEW_DESIGN_FORM_FIELDS"
        :application-label="selectedApplicationLabel"
        :field-key="fieldKey" :field-children="fieldGridChildren"
        :toolbar="designFieldToolbar" :hint="designFieldHint"
        :preview-key="viewPreviewKey" :preview-toolbar="viewPreviewToolbar" :preview-error="viewPreviewListError"
        :busy="busy" :error="fieldListError" @close="closeViewDesign" @open-preview="refreshViewPreview"
        @pick-application="applicationOptionOpen = true" />
      <ApplicationOptionDialog v-if="applicationOptionOpen"
        :app-key="appSystemKey" :busy="busy" :toolbar="appOptionToolbar" :on-row-click="chooseApplication"
        @close="applicationOptionOpen = false" @confirm="confirmApplicationPick" />
      <RendererDialog v-if="deleteTarget" :model-value="true" title="删除确认" :width="420" :close-disabled="busy" @update:model-value="deleteTarget = undefined">
        <p>确认删除{{ deleteTarget.kind === 'table' ? '表' : '视图' }}「{{ deleteTarget.label }}」吗？</p>
        <p v-if="actionError" role="alert">{{ actionError }}</p>
        <template #footer>
          <RendererButton label="取消" :disabled="busy" @click="deleteTarget = undefined" />
          <RendererButton label="删除" :disabled="busy" @click="confirmObjectDelete" />
        </template>
      </RendererDialog>
      <p v-if="actionError && !deleteTarget" role="alert">{{ actionError }}</p>
    </template>
  </section>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, reactive, ref, shallowRef, toRaw, watch} from 'vue'
import {useRoute} from 'vue-router'
import {useSystemPageDirtySource} from '@spark-appworks/spark-app'
import * as SparkData from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import * as SparkComponent from '@spark-appworks/spark-component'
type RTableProps = SparkComponent.RTableProps
import {
  buildDatabaseCatalogFieldGridChildren,
  databaseCatalogHasDesensitizationRules,
  databaseCatalogHasEncryptionDictionary,
  databaseCatalogHasFieldTypeDictionary,
} from '@/lowcode/resources/database/catalog/table/field-metadata'
import {
  DATABASE_CATALOG_TABLE_DESIGN_HEADER_FIELDS,
  DATABASE_CATALOG_VIEW_DESIGN_FORM_FIELDS,
} from '@/lowcode/resources/database/catalog/object-design-metadata'
import {
  DATABASE_CATALOG_DB_MODEL,
  DATABASE_CATALOG_TABLE_MODEL,
  DATABASE_CATALOG_VIEW_MODEL,
  DATABASE_CATALOG_FIELD_MODEL,
  DATABASE_CATALOG_FIELD_TABLE_VIEW,
  DATABASE_CATALOG_FIELD_VIEW_VIEW,
  DATABASE_UNREGISTERED_TABLE_NAMES_TABLE,
  DATABASE_UNREGISTERED_VIEW_NAMES_TABLE,
  DATABASE_CATALOG_RELATION_MODEL,
  DATABASE_CATALOG_RELATION_TABLE_VIEW,
  DATABASE_CATALOG_RELATION_PEER_VIEW,
  DATABASE_CATALOG_RELATION_ENDPOINT_VIEW,
  DATABASE_CATALOG_RELATION_FIELD_VIEW,
  DATABASE_CATALOG_WORKFLOW_MODEL,
  DATABASE_CATALOG_WORKFLOW_TABLE_VIEW,
  DATABASE_CATALOG_APP_SYSTEM_MODEL,
  DATABASE_CATALOG_COMMAND_INPUT_TABLE,
  DATABASE_TABLE_REGISTER_TABLE,
  DATABASE_VIEW_REGISTER_TABLE,
  LowcodeDatabaseTableView,
} from '@/lowcode/resources/database/catalog/table-view'
import {DATABASE_CATALOG_RELATION_LIST_FIELDS} from '@/lowcode/resources/database/catalog/relation/metadata'
import {
  databaseCatalogHasRelationCatalog,
  databaseCatalogRelationCanDeleteSelected,
  databaseCatalogRelationDeleteSelected,
  databaseCatalogRelationRefreshForTable,
} from '@/lowcode/resources/database/catalog/relation/view-ops'
import {
  type DatabaseCatalogRelationSession,
  type DatabaseCatalogTableContext,
  databaseCatalogRelationAssertIdentity,
  databaseCatalogRelationAssertSession,
  databaseCatalogRelationCancel,
  databaseCatalogRelationChoosePeer,
  databaseCatalogRelationInferRole,
  databaseCatalogRelationRelease,
  databaseCatalogRelationPrepareCreate,
  databaseCatalogRelationPrepareEdit,
  databaseCatalogRelationSwitchRole,
} from '@/lowcode/resources/database/catalog/relation/form-ops'
import {
  databaseCatalogSyncCommandInput,
} from '@/lowcode/resources/database/catalog/db-view-ops'
import RegisterDialog, {type RegisterObjectType} from './register-dialog.vue'
import AddTableDialog from './add-table-dialog.vue'
import CopyTableDialog from './copy-table-dialog.vue'
import TableDesignDialog from './table-design-dialog.vue'
import TableRelationDialog from './table-relation-dialog.vue'
import ViewDesignDialog from './view-design-dialog.vue'
import ApplicationOptionDialog from './application-option-dialog.vue'
import {
  databaseCatalogDbSelectedId,
  databaseCatalogQueryUnregisteredTableNames,
  databaseCatalogTableBeginCreate,
  databaseCatalogTableCancelEdit,
  databaseCatalogTableCanCreate,
  databaseCatalogTableEditing,
  databaseCatalogTableSaveEdit,
  type DatabaseCatalogTableEditState,
} from '@/lowcode/resources/database/catalog/table/view-ops'
import {
  databaseCatalogDesignCanSave,
  databaseCatalogDesignSavePending,
} from '@/lowcode/resources/database/catalog/table/field-view-ops'
import {databaseCatalogQueryUnregisteredViewNames, databaseCatalogSyncTableMetadata} from '@/lowcode/resources/database/catalog/table/sync-view-ops'
import {
  databaseCatalogVerifyTableRegistration,
  databaseCatalogVerifyViewRegistration,
  databaseCatalogBeginRegistrationBatch,
  databaseCatalogDiscardPendingRegistration,
  databaseCatalogSettleCommandInput,
  databaseCatalogRegisterTables,
  databaseCatalogRegisterViews,
} from '@/lowcode/resources/database/catalog/table/register-view-ops'
import {
  DATABASE_CATALOG_TABLE_LIST_FIELDS,
  DATABASE_CATALOG_VIEW_LIST_FIELDS,
} from '@/lowcode/resources/database/catalog/list-metadata'
import {
  databaseCatalogCanDeleteRow,
  databaseCatalogDeleteRow,
} from '@/lowcode/resources/database/catalog/object-view-ops'
import {databaseCatalogCopyTable} from '@/lowcode/resources/database/catalog/table/copy-view-ops'
import {
  DATABASE_TABLE_PREVIEW_RESULT_TABLE,
  DATABASE_VIEW_PREVIEW_RESULT_TABLE,
  databaseCatalogHasTablePreview,
  databaseCatalogHasViewPreview,
  databaseCatalogPreviewRefresh,
  databaseCatalogViewPreviewRefresh,
} from '@/lowcode/resources/database/catalog/table/preview-view-ops'
import {
  buildDatabaseCatalogWorkflowListFields,
  databaseCatalogHasWorkflowStatusDictionary,
} from '@/lowcode/resources/database/catalog/workflow/metadata'
import {
  databaseCatalogHasWorkflowCatalog,
  databaseCatalogWorkflowRefreshForTable,
  type DatabaseCatalogWorkflowQuery,
} from '@/lowcode/resources/database/catalog/workflow/view-ops'

type RFilterProps = SparkComponent.RFilterProps
type RToolbarProps = SparkComponent.RToolbarProps
const {PAGE_RUNTIME, RendererTable, RendererTabs, RendererTabPane, RendererDialog, RendererButton, useSparkComponent} = SparkComponent

const route = useRoute()
const scenarioId = computed(() => typeof route.meta['blueprintScenarioId'] === 'string' ? route.meta['blueprintScenarioId'].trim() : '')
const requestedDatabaseId = computed((): Readonly<{provided: boolean; value?: string; error?: string}> => {
  if (!Object.hasOwn(route.query, 'databaseId')) return {provided: false}
  const value = route.query['databaseId']
  if (typeof value !== 'string' || !value.trim()) return {provided: true, error: 'databaseId 参数必须是唯一的非空数据库主键'}
  return {provided: true, value: value.trim()}
})
const {sparkProvide, sparkRemove} = useSparkComponent({type: 'table-and-view-page'})
const dataSet = shallowRef<SparkData.DataSet>()
const dbView = shallowRef<SparkData.DataView>()
const tableEdit = shallowRef<DatabaseCatalogTableEditState>()
const tableDesignOpen = ref(false)
const relationSession = shallowRef<DatabaseCatalogRelationSession>()
const relationExpressionColumns = shallowRef<readonly SparkData.DataColumn[]>([])
const relationExpressionContext = shallowRef<SparkData.DataViewFilterFunctionContext>({})
const relationExpressionLoading = ref(false), relationExpressionError = ref(''), relationExpressionWarning = ref('')
const relationExpressionGeneration = ref(0)
const relationExpressionEditing = ref(false)
const viewDesignOpen = ref(false)
const applicationOptionOpen = ref(false)
const copyTableOpen = ref(false)
const objectRegisterOpen = ref(false)
const objectRegisterType = ref<RegisterObjectType>('table')
const deleteTarget = ref<{kind: 'table' | 'view'; id: string; label: string} | undefined>()
const tableView = shallowRef<SparkData.DataView>()
const viewView = shallowRef<SparkData.DataView>()
const fieldTableView = shallowRef<SparkData.DataView>()
const relationView = shallowRef<SparkData.DataView>()
const previewView = shallowRef<SparkData.DataView>()
const viewPreviewView = shallowRef<SparkData.DataView>()
const appSystemView = shallowRef<SparkData.DataView>()
const workflowView = shallowRef<SparkData.DataView>()
const fieldViewView = shallowRef<SparkData.DataView>()
const ready = ref(false), loading = ref(false), error = ref(''), revision = ref(0), objectTab = ref<string | number>('tables')
const busy = ref(false), actionError = ref(''), message = ref(''), unregisteredHint = ref(''), unregisteredTableHint = ref('')
const workflowQuery = reactive<{name?: string; workflowKey?: string; description?: string; status?: string}>({})
let runtime: PageRuntime | undefined, unsubscribe: (() => void) | undefined, generation = 0, active = true, actionGeneration = 0, selectionGeneration = 0

const catalogScenarioId = computed(() => dataSet.value?.scenarioId ?? scenarioId.value)
const catalogListFilter = computed<RFilterProps>(() => ({
  autoQuery: true,
  collapsible: true,
  defaultCollapsed: true,
}))
const fieldGridChildren = computed(() => {
  revision.value
  const ds = dataSet.value
  return ds ? buildDatabaseCatalogFieldGridChildren(ds) : []
})
const designObjectView = computed(() => {
  revision.value
  if (tableDesignOpen.value) return tableView.value
  if (viewDesignOpen.value) return viewView.value
  return undefined
})
const designExtraViews = computed(() => {
  revision.value
  if (tableDesignOpen.value && relationView.value) return [relationView.value]
  return []
})
const relationToolbar = computed<RToolbarProps>(() => {
  revision.value
  const relations = relationView.value
  const ds = dataSet.value
  const relationId = relations?.getSelectedValues()[0]
  const canEdit = typeof relationId === 'string' && relationId.length > 0
  return {children: [
    {type: 'r-button', props: {
      label: '新增',
      disabled: busy.value || !ds || !relations || !!relationSession.value || !selectedTableContext.value,
      onClick: () => { void act(() => beginRelationCreate('child')) },
    }},
    {type: 'r-button', props: {
      label: '编辑',
      disabled: busy.value || !relations || !!relationSession.value || !canEdit,
      onClick: () => { void act(() => beginRelationEdit()) },
    }},
    {type: 'r-button', props: {
      label: '删除',
      disabled: busy.value || !ds || !relations || !databaseCatalogRelationCanDeleteSelected(relations),
      onClick: deleteSelectedRelation,
    }},
    {type: 'r-button', props: {
      label: '刷新',
      disabled: busy.value || !relations,
      onClick: () => { void act(() => refreshTableRelations()) },
    }},
  ]}
})
const selectedTableContext = computed((): DatabaseCatalogTableContext | undefined => {
  revision.value
  const tables = tableView.value
  const db = dbView.value
  if (!tables || !db) return undefined
  const tableId = tables.getSelectedValues()[0]
  if (typeof tableId !== 'string' || !tableId) return undefined
  const row = tables.rows.find(item => tables.getPkKey(item) === tableId)
  if (!row) return undefined
  const dbId = typeof row['dbid'] === 'string' && row['dbid'] ? row['dbid'] : databaseCatalogDbSelectedId(db)
  if (!dbId) return undefined
  const tableName = typeof row['tblname'] === 'string' ? row['tblname'] : tableId
  return {tableId, tableName, dbId}
})
const relationPeerKey = computed(() => SparkData.buildDataViewKey(DATABASE_CATALOG_TABLE_MODEL,
  DATABASE_CATALOG_RELATION_PEER_VIEW, catalogScenarioId.value))
const relationPeerField = computed(() => relationSession.value?.currentRole === 'master' ? 'fktbid' : 'pktbid')
const relationEditorBusy = computed(() => busy.value || relationExpressionLoading.value
  || relationView.value?.requestState === SparkData.RequestState.Loading
  || relationView.value?.mutating === true)
const designFieldHint = computed(() => {
  revision.value
  const ds = dataSet.value
  const base = viewDesignOpen.value
    ? '视图定义与输出字段绑定同一 DataSet；保存提交本次变更。'
    : '表头与字段均绑定同一 DataSet；保存提交本次变更。'
  if (!ds) return base
  const gaps: string[] = []
  if (!databaseCatalogHasDesensitizationRules(ds)) gaps.push('脱敏规则')
  if (!databaseCatalogHasEncryptionDictionary(ds)) gaps.push('加密字典')
  if (!databaseCatalogHasFieldTypeDictionary(ds)) gaps.push('字段类型字典')
  if (!databaseCatalogHasRelationCatalog(ds)) gaps.push('表关系 Base_TblRln')
  if (!databaseCatalogHasTablePreview(ds)) gaps.push('物理表数据预览')
  if (viewDesignOpen.value && !databaseCatalogHasViewPreview(ds)) gaps.push('视图数据预览')
  if (!databaseCatalogHasWorkflowCatalog(ds)) gaps.push('工作流 Base_WorkflowDefinition')
  else if (!databaseCatalogHasWorkflowStatusDictionary(ds)) gaps.push('工作流状态字典 workflowStatus')
  if (gaps.length === 0) return `${base} 双击单元格编辑字段。`
  return `${base} 未装配：${gaps.join('、')}，对应列降级为文本。`
})
const dbKey = computed(() => SparkData.buildDataViewKey(DATABASE_CATALOG_DB_MODEL, 'default', catalogScenarioId.value))
const tableKey = computed(() => SparkData.buildDataViewKey(DATABASE_CATALOG_TABLE_MODEL, 'default', catalogScenarioId.value))
const viewKey = computed(() => SparkData.buildDataViewKey(DATABASE_CATALOG_VIEW_MODEL, 'default', catalogScenarioId.value))
const fieldKey = computed(() => SparkData.buildDataViewKey(DATABASE_CATALOG_FIELD_MODEL,
  objectTab.value === 'views' ? DATABASE_CATALOG_FIELD_VIEW_VIEW : DATABASE_CATALOG_FIELD_TABLE_VIEW, catalogScenarioId.value))
const relationKey = computed(() => {
  revision.value
  if (!relationView.value) return ''
  return SparkData.buildDataViewKey(DATABASE_CATALOG_RELATION_MODEL, DATABASE_CATALOG_RELATION_TABLE_VIEW, catalogScenarioId.value)
})
const relationListError = computed(() => {revision.value; return relationView.value?.loadingError?.message ?? ''})
const previewToolbar = computed<RToolbarProps>(() => {
  revision.value
  const preview = previewView.value
  return {children: [
    {type: 'r-button', props: {
      label: '刷新',
      disabled: busy.value || !preview,
      onClick: () => { void act(() => refreshTablePreview()) },
    }},
  ]}
})
const previewKey = computed(() => {
  revision.value
  if (!previewView.value) return ''
  return SparkData.buildDataViewKey(DATABASE_TABLE_PREVIEW_RESULT_TABLE, 'default', catalogScenarioId.value)
})
const previewListError = computed(() => {revision.value; return previewView.value?.loadingError?.message ?? ''})
const viewPreviewToolbar = computed<RToolbarProps>(() => {
  revision.value
  const preview = viewPreviewView.value
  return {children: [
    {type: 'r-button', props: {
      label: '刷新',
      disabled: busy.value || !preview,
      onClick: () => { void act(() => refreshViewPreview()) },
    }},
  ]}
})
const viewPreviewKey = computed(() => {
  revision.value
  if (!viewPreviewView.value) return ''
  return SparkData.buildDataViewKey(DATABASE_VIEW_PREVIEW_RESULT_TABLE, 'default', catalogScenarioId.value)
})
const viewPreviewListError = computed(() => {revision.value; return viewPreviewView.value?.loadingError?.message ?? ''})
const appSystemKey = computed(() => {
  revision.value
  if (!appSystemView.value) return ''
  return SparkData.buildDataViewKey(DATABASE_CATALOG_APP_SYSTEM_MODEL, 'default', catalogScenarioId.value)
})
const appOptionToolbar = computed<RToolbarProps>(() => ({children: [{type: 'r-button', props: {label: '刷新', action: 'refresh'}}]}))
const selectedApplicationLabel = computed(() => {
  revision.value
  const catalog = viewView.value
  const apps = appSystemView.value
  if (!catalog || catalog.getSelectedValues().length !== 1) return ''
  const row = catalog.rows.find(item => catalog.getPkKey(item) === catalog.getSelectedValues()[0])
  const modid = typeof row?.['modid'] === 'string' ? row['modid'].trim() : ''
  if (!modid) return ''
  if (!apps) return modid
  const appRow = apps.rows.find(item => apps.getPkKey(item) === modid)
  const desc = typeof appRow?.['AppDesc'] === 'string' ? appRow['AppDesc'] : ''
  const name = typeof appRow?.['AppName'] === 'string' ? appRow['AppName'] : ''
  if (desc && name) return `${desc}[${name}]`
  return modid
})
const workflowToolbar = computed<RToolbarProps>(() => {
  revision.value
  const workflow = workflowView.value
  return {children: [
    {type: 'r-button', props: {
      label: '设计',
      disabled: busy.value,
      onClick: () => { message.value = '暂未实现' },
    }},
    {type: 'r-button', props: {
      label: '刷新',
      disabled: busy.value || !workflow,
      onClick: () => { void act(() => refreshTableWorkflows()) },
    }},
  ]}
})
const workflowKey = computed(() => {
  revision.value
  if (!workflowView.value) return ''
  return SparkData.buildDataViewKey(DATABASE_CATALOG_WORKFLOW_MODEL, DATABASE_CATALOG_WORKFLOW_TABLE_VIEW, catalogScenarioId.value)
})
const workflowListFields = computed(() => {
  revision.value
  const ds = dataSet.value
  if (!ds) return []
  return buildDatabaseCatalogWorkflowListFields(ds)
})
const workflowListError = computed(() => {revision.value; return workflowView.value?.loadingError?.message ?? ''})
const unregisteredTableNamesKey = computed(() => SparkData.buildDataViewKey(DATABASE_UNREGISTERED_TABLE_NAMES_TABLE, 'default', catalogScenarioId.value))
const unregisteredViewNamesKey = computed(() => SparkData.buildDataViewKey(DATABASE_UNREGISTERED_VIEW_NAMES_TABLE, 'default', catalogScenarioId.value))
const commandInputKey = computed(() => SparkData.buildDataViewKey(DATABASE_CATALOG_COMMAND_INPUT_TABLE, 'default', catalogScenarioId.value))
const objectRegisterProgressKey = computed(() => SparkData.buildDataViewKey(
  objectRegisterType.value === 'table' ? DATABASE_TABLE_REGISTER_TABLE : DATABASE_VIEW_REGISTER_TABLE,
  'default', catalogScenarioId.value,
))
const objectRegisterHasUnconfirmed = computed(() => {
  revision.value
  const ds = dataSet.value
  const model = objectRegisterType.value === 'table' ? DATABASE_TABLE_REGISTER_TABLE : DATABASE_VIEW_REGISTER_TABLE
  return ds?.getView(model, 'default')?.hasUnconfirmedSave === true
})
const objectRegisterHasPending = computed(() => {
  revision.value
  const ds = dataSet.value
  const model = objectRegisterType.value === 'table' ? DATABASE_TABLE_REGISTER_TABLE : DATABASE_VIEW_REGISTER_TABLE
  const view = ds?.getView(model, 'default')
  return view?.hasUnconfirmedSave === true || view?.dirtyTracking.hasPendingChanges() === true
})
const objectRegisterRequiresCancel = computed(() => {
  revision.value
  if (objectRegisterType.value !== 'table') return false
  const view = dataSet.value?.getView(DATABASE_TABLE_REGISTER_TABLE, 'default')
  if (!view) return false
  return view.rows.some(row => {
    const id = view.getPkKey(row)
    if (typeof id !== 'string' && typeof id !== 'number') return false
    return (view.getEditingRow(id) ?? row)['registrationDisposition'] === 'cancel-required'
  })
})
const objectRegisterListKey = computed(() => objectRegisterType.value === 'table' ? unregisteredTableNamesKey.value : unregisteredViewNamesKey.value)
const activeFieldView = computed(() => objectTab.value === 'views' ? fieldViewView.value : fieldTableView.value)
const activeFieldParentSelected = computed(() => {
  revision.value
  const parent = objectTab.value === 'views' ? viewView.value : tableView.value
  return parent?.getSelectedValues().length === 1
})

const dbListError = computed(() => {revision.value; return dbView.value?.loadingError?.message ?? ''})
const tableEditing = computed(() => {revision.value; const v = tableView.value; return v ? databaseCatalogTableEditing(v, tableEdit.value) : undefined})
const selectedDatabaseLabel = computed(() => {
  revision.value
  const view = dbView.value
  if (!view) return ''
  const id = databaseCatalogDbSelectedId(view)
  const row = view.rows.find(item => view.getPkKey(item) === id)
  const name = row?.['Name']
  return typeof name === 'string' && name ? name : id
})
const canLoadUnregisteredTables = computed(() => {
  revision.value
  const view = dbView.value
  return !!view && databaseCatalogDbSelectedId(view).length > 0 && !busy.value
})
const selectedTableLabel = computed(() => {
  revision.value
  const view = tableView.value
  if (!view || view.getSelectedValues().length !== 1) return ''
  const id = view.getSelectedValues()[0]
  const row = view.rows.find(item => view.getPkKey(item) === id)
  const name = row?.['tblname']
  return typeof name === 'string' && name ? name : String(id ?? '')
})
const selectedViewLabel = computed(() => {
  revision.value
  const view = viewView.value
  if (!view || view.getSelectedValues().length !== 1) return ''
  const id = view.getSelectedValues()[0]
  const row = view.rows.find(item => view.getPkKey(item) === id)
  const name = row?.['vewname']
  return typeof name === 'string' && name ? name : String(id ?? '')
})
const tableListError = computed(() => {revision.value; return tableView.value?.loadingError?.message ?? ''})
const viewListError = computed(() => {revision.value; return viewView.value?.loadingError?.message ?? ''})
const fieldListError = computed(() => {revision.value; return activeFieldView.value?.loadingError?.message ?? ''})
const databaseSelected = computed(() => {
  revision.value
  const view = dbView.value
  if (!view) return false
  return view.getSelectedValues().length === 1
})
const resourceSelected = computed(() => {
  revision.value
  return activeFieldParentSelected.value
})

const dbToolbar = computed<RToolbarProps>(() => {
  revision.value
  return {children: [
    {type: 'r-button', props: {label: '刷新', action: 'refresh'}},
  ]}
})
const tableToolbar = computed<RToolbarProps>(() => {
  revision.value
  const tables = tableView.value
  const db = dbView.value
  return {children: [
    {type: 'r-button', props: {
      label: '注册',
      disabled: busy.value || !!tableEdit.value || objectRegisterOpen.value || !db || !databaseSelected.value,
      onClick: () => openObjectRegister('table'),
    }},
    {type: 'r-button', props: {
      label: '新增',
      disabled: busy.value || !!tableEdit.value || !tables || !db || !databaseCatalogTableCanCreate(tables, db, tableEdit.value),
      onClick: beginTableRegister,
    }},
    {type: 'r-button', props: {
      label: '表设计',
      disabled: busy.value || !selectedTableLabel.value,
      onClick: () => { tableDesignOpen.value = true; viewDesignOpen.value = false },
    }},
    {type: 'r-button', props: {
      label: '复制',
      disabled: busy.value || !selectedTableLabel.value || copyTableOpen.value,
      onClick: () => { copyTableOpen.value = true; tableDesignOpen.value = false; viewDesignOpen.value = false },
    }},
    {type: 'r-button', props: {
      label: '删除',
      disabled: busy.value || !canDeleteSelectedTable.value,
      onClick: openDeleteSelectedTable,
    }},
    {type: 'r-button', props: {label: '刷新', action: 'refresh'}},
  ]}
})
const canDeleteSelectedTable = computed(() => {
  revision.value
  const tables = tableView.value
  if (!tables || tables.getSelectedValues().length !== 1) return false
  const id = tables.getSelectedValues()[0]
  return typeof id === 'string' && databaseCatalogCanDeleteRow(tables, id)
})
const viewToolbar = computed<RToolbarProps>(() => {
  revision.value
  const db = dbView.value
  return {children: [
    {type: 'r-button', props: {
      label: '注册',
      disabled: busy.value || !!tableEdit.value || objectRegisterOpen.value || !db || !databaseSelected.value,
      onClick: () => openObjectRegister('view'),
    }},
    {type: 'r-button', props: {
      label: '视图设计',
      disabled: busy.value || !selectedViewLabel.value,
      onClick: () => { viewDesignOpen.value = true; tableDesignOpen.value = false },
    }},
    {type: 'r-button', props: {
      label: '删除',
      disabled: busy.value || !canDeleteSelectedView.value,
      onClick: openDeleteSelectedView,
    }},
    {type: 'r-button', props: {label: '刷新', action: 'refresh'}},
  ]}
})
const canDeleteSelectedView = computed(() => {
  revision.value
  const views = viewView.value
  if (!views || views.getSelectedValues().length !== 1) return false
  const id = views.getSelectedValues()[0]
  return typeof id === 'string' && databaseCatalogCanDeleteRow(views, id)
})
const childToolbar = computed<RToolbarProps>(() => ({children: [{type: 'r-button', props: {label: '刷新', action: 'refresh'}}]}))
const designFieldToolbar = computed<RToolbarProps>(() => {
  revision.value
  const fields = activeFieldView.value
  const ds = dataSet.value
  const tables = tableView.value
  const db = dbView.value
  const showSync = tableDesignOpen.value && objectTab.value === 'tables'
  const tableId = tables?.getSelectedValues()[0]
  const children: RToolbarProps['children'] = []
  if (showSync) {
    children.push({type: 'r-button', props: {
      label: '同步元数据',
      disabled: busy.value || !ds || !db || !fields || typeof tableId !== 'string',
      onClick: syncDesignMetadata,
    }})
  }
  children.push(
    {type: 'r-button', props: {
      label: '保存',
      disabled: busy.value || !ds || !fields || !databaseCatalogDesignCanSave(fields, designObjectView.value, designExtraViews.value),
      onClick: saveDesignFields,
    }},
    {type: 'r-button', props: {label: '刷新', disabled: busy.value, onClick: refreshDesignFields}},
  )
  return {children}
})

async function act(operation: () => void | Promise<void>, success = ''): Promise<void> {
  const ds = dataSet.value
  const db = dbView.value
  if (!ds || !db || busy.value) return
  const action = ++actionGeneration
  const current = () => dataSet.value === ds && dbView.value === db && action === actionGeneration
  busy.value = true; actionError.value = ''; message.value = ''
  try {await operation(); if (current()) message.value = success}
  catch (cause) {if (current()) actionError.value = cause instanceof Error ? cause.message : String(cause)}
  finally {if (current()) {busy.value = false; revision.value++}}
}

async function openObjectRegister(type: RegisterObjectType): Promise<void> {
  await act(async () => {
    const ds = dataSet.value
    if (!ds) throw new Error('目录未就绪')
    const action = actionGeneration
    await databaseCatalogBeginRegistrationBatch(ds)
    if (!active || dataSet.value !== ds || actionGeneration !== action) return
    objectRegisterType.value = type
    objectRegisterOpen.value = true
    tableDesignOpen.value = false
    viewDesignOpen.value = false
  })
}

async function closeObjectRegister(): Promise<void> {
  if (objectRegisterHasPending.value || busy.value) return
  const ds = dataSet.value
  const action = actionGeneration
  if (ds) await databaseCatalogSettleCommandInput(ds)
  if (active && dataSet.value === ds && actionGeneration === action && !objectRegisterHasPending.value) objectRegisterOpen.value = false
}

async function loadObjectRegisterList(type: RegisterObjectType): Promise<void> {
  if (objectRegisterHasPending.value) throw new Error('本批命令尚未完成，不能刷新或替换列表')
  const ds = dataSet.value
    const db = dbView.value
  if (!ds || !db) throw new Error('目录未就绪')
  const dbId = databaseCatalogDbSelectedId(db)
  if (!dbId) throw new Error('请先选择数据库')
  if (type === 'table') await databaseCatalogQueryUnregisteredTableNames(ds, dbId)
  else await databaseCatalogQueryUnregisteredViewNames(ds, dbId)
}

function openDeleteSelectedTable(): void {
  const tables = tableView.value
  if (!tables) return
  const id = tables.getSelectedValues()[0]
  if (typeof id !== 'string') return
  deleteTarget.value = {kind: 'table', id, label: selectedTableLabel.value || id}
}

function openDeleteSelectedView(): void {
  const views = viewView.value
  if (!views) return
  const id = views.getSelectedValues()[0]
  if (typeof id !== 'string') return
  deleteTarget.value = {kind: 'view', id, label: selectedViewLabel.value || id}
}

async function confirmObjectDelete(): Promise<void> {
  await act(async () => {
    const ds = dataSet.value
    const target = deleteTarget.value
    if (!ds || !target) return
    const view = target.kind === 'table' ? tableView.value : viewView.value
    if (!view) return
    await databaseCatalogDeleteRow(ds, view, target.id)
    if (target.kind === 'table') tableView.value?.setSelectedRows([])
    else viewView.value?.setSelectedRows([])
    await refreshFields()
    deleteTarget.value = undefined
  }, '已删除')
}

async function confirmObjectRegister(): Promise<void> {
  await act(async () => {
    const ds = dataSet.value
    const db = dbView.value
    if (!ds || !db) return
    const type = objectRegisterType.value
    const dbId = databaseCatalogDbSelectedId(db)
    if (!dbId) throw new Error('请先选择数据库')
    const tableKey = DATABASE_UNREGISTERED_TABLE_NAMES_TABLE
    const viewKey = DATABASE_UNREGISTERED_VIEW_NAMES_TABLE
    const listView = ds.getView(type === 'table' ? tableKey : viewKey, 'default')
    if (!listView) throw new Error('未注册列表视图缺失')
    const selected = listView.selectedRows
    const names = selected.map(row => {
      const name = row['name']
      if (typeof name !== 'string' || !name.trim()) throw new Error('未注册项名称无效')
      return name.trim()
    })
    if (names.length === 0) throw new Error(`请至少选择一个${type === 'table' ? '表' : '视图'}`)
    const inputView = ds.getView(DATABASE_CATALOG_COMMAND_INPUT_TABLE, 'default')
    const inputRow = inputView?.rows[0]
    if (!inputView || !inputRow) throw new Error('注册命令缺少默认字段选项视图')
    const inputId = inputView.getPkKey(inputRow)
    if (typeof inputId !== 'string' || !inputId) throw new Error('默认字段选项行身份无效')
    const optionRow = inputView.getEditingRow(inputId) ?? inputRow
    const addDefaultFields = optionRow['addDefaultFields'] === '1'
    const action = actionGeneration
    const operationIsCurrent = (): boolean => active && dataSet.value === ds && dbView.value === db
      && objectRegisterType.value === type && actionGeneration === action
    if (type === 'table') {
      await databaseCatalogRegisterTables(ds, dbId, names.map(tableName => ({
        tableName,
        tableComment: '',
        addDefaultFields,
      })))
    } else {
      await databaseCatalogRegisterViews(ds, dbId, names.map(viewName => ({viewName, viewComment: ''})))
    }
    if (!operationIsCurrent()) return
    listView.clearSelectedRows()
    const tables = tableView.value, views = viewView.value
    if (tables && views) {
      await Promise.all([tables.refresh(), views.refresh()])
      if (!operationIsCurrent()) return
      if (tables.loadingError) throw tables.loadingError
      if (views.loadingError) throw views.loadingError
    }
    if (!operationIsCurrent()) return
    objectRegisterOpen.value = false
  }, objectRegisterType.value === 'table' ? '表已注册' : '视图已注册')
}

async function verifyObjectRegister(): Promise<void> {
  await act(async () => {
    const ds = dataSet.value
    if (!ds) throw new Error('目录未就绪')
    if (objectRegisterType.value === 'table') await databaseCatalogVerifyTableRegistration(ds)
    else await databaseCatalogVerifyViewRegistration(ds)
  }, '已核验当前注册结果；可继续提交本批剩余项')
}

async function discardPendingObjectRegister(): Promise<void> {
  await act(async () => {
    const ds = dataSet.value
    if (!ds) throw new Error('目录未就绪')
    const kind = objectRegisterType.value
    const action = actionGeneration
    await databaseCatalogDiscardPendingRegistration(ds, kind)
    if (!active || dataSet.value !== ds || actionGeneration !== action) return
    revision.value++
    objectRegisterOpen.value = false
  }, '已取消未提交注册项')
}

async function saveCopyTable(payload: Readonly<{tblname: string; tbldesc: string}>): Promise<void> {
  await act(async () => {
    const ds = dataSet.value
    const db = dbView.value
    const tables = tableView.value
    if (!ds || !db || !tables) return
    const sourceId = tables.getSelectedValues()[0]
    if (typeof sourceId !== 'string') throw new Error('请先选择要复制的表')
    const dbId = databaseCatalogDbSelectedId(db)
    const newId = await databaseCatalogCopyTable(ds, {
      sourceTableId: sourceId,
      dbId,
      newTableName: payload.tblname,
      newTableDesc: payload.tbldesc,
    })
    copyTableOpen.value = false
    await refreshChildren()
    const created = tables.rows.find(row => tables.getPkKey(row) === newId)
    if (created) tables.setSelectedRows([created])
  }, '表已复制')
}

async function beginTableRegister(): Promise<void> {
  await act(async () => {
    const tables = tableView.value
    const db = dbView.value
    if (!tables || !db) return
    unregisteredTableHint.value = ''
    tableDesignOpen.value = false
    viewDesignOpen.value = false
    objectRegisterOpen.value = false
    copyTableOpen.value = false
    tableEdit.value = await databaseCatalogTableBeginCreate(tables, db)
  })
}

async function cancelTableRegister(): Promise<void> {
  await act(() => {
    const tables = tableView.value
    const current = tableEdit.value
    if (!tables || !current) return
    tableEdit.value = databaseCatalogTableCancelEdit(tables, current)
    unregisteredTableHint.value = ''
  })
}

async function saveTableRegister(): Promise<void> {
  await act(async () => {
    const ds = dataSet.value
    const tables = tableView.value
    const current = tableEdit.value
    if (!ds || !tables || !current) return
    tableEdit.value = await databaseCatalogTableSaveEdit(ds, tables, current) ?? undefined
    if (!tableEdit.value) unregisteredTableHint.value = ''
  }, '数据表已新增')
}

async function loadUnregisteredTableNames(): Promise<void> {
  await act(async () => {
    const db = dbView.value
    if (!db) return
    const id = databaseCatalogDbSelectedId(db)
    if (!id) throw new Error('请先选择数据库')
    const ds = dataSet.value
    if (!ds) return
    const names = await databaseCatalogQueryUnregisteredTableNames(ds, id)
    unregisteredTableHint.value = names.length
      ? `未登记物理表（可填到「tblname」）：${names.join('、')}`
      : '该数据库下没有未登记的物理表名'
  })
}

async function saveDesignFields(): Promise<void> {
  await act(async () => {
    const ds = dataSet.value
    const fields = activeFieldView.value
    const objectView = designObjectView.value
    if (!ds || !fields) return
    await databaseCatalogDesignSavePending({
      dataSet: ds,
      fieldView: fields,
      extraViews: designExtraViews.value,
      ...(objectView === undefined ? {} : {objectView}),
    })
  }, '已保存')
}

async function refreshTableWorkflows(): Promise<void> {
  const workflows = workflowView.value
  const tables = tableView.value
  if (!workflows || !tables) return
  const tableId = tables.getSelectedValues()[0]
  if (typeof tableId !== 'string') throw new Error('请先选择物理表')
  await databaseCatalogWorkflowRefreshForTable(workflows, tableId, {...workflowQuery})
}

function applyWorkflowQueryUpdate(next: DatabaseCatalogWorkflowQuery): void {
  Object.assign(workflowQuery, next)
}

function resetWorkflowQuery(): void {
  workflowQuery.name = ''
  workflowQuery.workflowKey = ''
  workflowQuery.description = ''
  workflowQuery.status = ''
}

async function applyTableWorkflowFilter(): Promise<void> {
  await act(() => refreshTableWorkflows())
}

async function refreshViewPreview(): Promise<void> {
  const ds = dataSet.value
  const preview = viewPreviewView.value
  const views = viewView.value
  if (!ds || !preview || !views) return
  const viewId = views.getSelectedValues()[0]
  if (typeof viewId !== 'string') throw new Error('请先选择视图')
  const row = views.rows.find(item => views.getPkKey(item) === viewId)
  const dbId = typeof row?.['dbid'] === 'string' ? row['dbid'] : ''
  const viewName = typeof row?.['vewname'] === 'string' ? row['vewname'] : ''
  if (!dbId || !viewName) throw new Error('当前视图缺少 dbid 或视图名，无法预览数据')
  await databaseCatalogViewPreviewRefresh(ds, preview, {
    dbId,
    viewName,
    pageIndex: preview.page,
    pageSize: preview.pageSize,
  })
}

async function confirmApplicationPick(): Promise<void> {
  await act(async () => {
    const apps = appSystemView.value
    const catalog = viewView.value
    if (!apps || !catalog) return
    const appId = apps.getSelectedValues()[0]
    const viewId = catalog.getSelectedValues()[0]
    if (typeof appId !== 'string' || !appId) throw new Error('请选择应用')
    if (typeof viewId !== 'string') throw new Error('请先选择视图')
    await catalog.editRowById(viewId, {modid: appId})
    applicationOptionOpen.value = false
  })
}

function closeViewDesign(): void {
  applicationOptionOpen.value = false
  viewDesignOpen.value = false
}

async function refreshTablePreview(): Promise<void> {
  const ds = dataSet.value
  const preview = previewView.value
  const tables = tableView.value
  if (!ds || !preview || !tables) return
  const tableId = tables.getSelectedValues()[0]
  if (typeof tableId !== 'string') throw new Error('请先选择物理表')
  const row = tables.rows.find(item => tables.getPkKey(item) === tableId)
  const dbId = typeof row?.['dbid'] === 'string' ? row['dbid'] : ''
  const tableName = typeof row?.['tblname'] === 'string' ? row['tblname'] : ''
  if (!dbId || !tableName) throw new Error('当前表缺少 dbid 或表名，无法预览数据')
  await databaseCatalogPreviewRefresh(ds, preview, {
    dbId,
    tableName,
    tblid: tableId,
    pageIndex: preview.page,
    pageSize: preview.pageSize,
  })
}

async function refreshTableRelations(): Promise<void> {
  const relations = relationView.value
  const tables = tableView.value
  if (!relations || !tables) return
  const tableId = tables.getSelectedValues()[0]
  if (typeof tableId !== 'string') throw new Error('请先选择物理表')
  await databaseCatalogRelationRefreshForTable(relations, tableId)
}

async function deleteSelectedRelation(): Promise<void> {
  await act(async () => {
    const ds = dataSet.value
    const relations = relationView.value
    if (!ds || !relations) return
    await databaseCatalogRelationDeleteSelected(ds, relations)
    await refreshTableRelations()
  }, '关系已删除')
}

function closeTableDesign(): void {
  if (relationSession.value) return
  resetWorkflowQuery()
  tableDesignOpen.value = false
}

function sameTableContext(left: DatabaseCatalogTableContext | undefined, right: DatabaseCatalogTableContext): boolean {
  return left?.tableId === right.tableId && left.dbId === right.dbId && left.tableName === right.tableName
}

function relationSessionMatches(options: Readonly<{session: DatabaseCatalogRelationSession; dataSet: SparkData.DataSet;
  view: SparkData.DataView; context: DatabaseCatalogTableContext}>): boolean {
  const {session, dataSet: ds, view, context} = options
  return dataSet.value === ds && relationView.value === view && relationSession.value === session
    && sameTableContext(selectedTableContext.value, context) && tableDesignOpen.value
}

function setRelationExpressionEditing(session: DatabaseCatalogRelationSession, editing: boolean): void {
  if (relationSession.value !== session) return
  relationExpressionEditing.value = editing
}

const relationValidationFields = ['pkdbid', 'pktbid', 'pktable', 'fkdbid', 'fktbid', 'fktable', 'RelshipExp', 'IsCascadeDeletion'] as const

function relationValidationSnapshot(options: Readonly<{view: SparkData.DataView; session: DatabaseCatalogRelationSession;
  context: DatabaseCatalogTableContext; selection: number}>): string {
  const {view, session, context, selection} = options
  const row = databaseCatalogRelationAssertSession(view, session, context)
  return JSON.stringify({rowId: session.rowid, mode: session.mode, currentRole: session.currentRole,
    context: session.context, selection, queryIdentity: session.queryIdentity,
    values: relationValidationFields.map(field => [field, Object.hasOwn(row, field), row[field]])})
}

function assertRelationValidationSnapshot(options: Readonly<{view: SparkData.DataView; session: DatabaseCatalogRelationSession;
  context: DatabaseCatalogTableContext; selection: number; expected: string}>): SparkData.DataRow {
  const {view, session, context, selection, expected} = options
  const row = databaseCatalogRelationAssertSession(view, session, context)
  if (relationValidationSnapshot({view, session, context, selection}) !== expected) {
    throw new Error('关系端点或表达式在校验期间已变化；当前草稿保留，请重新保存')
  }
  return row
}

async function validateRelationBeforeSave(options: Readonly<{dataSet: SparkData.DataSet; view: SparkData.DataView;
  session: DatabaseCatalogRelationSession; context: DatabaseCatalogTableContext; selection: number}>): Promise<string> {
  const {dataSet: ds, view, session, context, selection} = options
  const row = databaseCatalogRelationAssertSession(view, session, context)
  const patch = view.getEditingPatch(session.rowid) ?? {}
  const requiresValidation = session.mode === 'add' || relationValidationFields.some(field => Object.hasOwn(patch, field))
  const snapshot = relationValidationSnapshot({view, session, context, selection})
  if (!requiresValidation) return snapshot

  const parentId = relationText(row['pktbid']), childId = relationText(row['fktbid'])
  const parentDbId = relationText(row['pkdbid']), childDbId = relationText(row['fkdbid'])
  const parentName = relationText(row['pktable']), childName = relationText(row['fktable'])
  if (!parentId || !childId || parentId === childId || !parentDbId || !childDbId || !parentName || !childName) {
    throw new Error('关系必须配置两个不同且完整的物理表端点')
  }
  const inferredRole = databaseCatalogRelationInferRole(context, row)
  if (inferredRole !== session.currentRole) throw new Error('关系当前表端点已变化，请重新打开后再保存')

  const endpoints = ds.getView(DATABASE_CATALOG_TABLE_MODEL, DATABASE_CATALOG_RELATION_ENDPOINT_VIEW)
  if (!endpoints) throw new Error('缺少关系端点正式目录查询')
  if (endpoints.requestState === SparkData.RequestState.Loading) throw new Error('关系端点目录正在读取，暂不能保存')
  const endpointFilter = SparkData.DataViewFilter.condition({field: endpoints.primaryKey, operator: 'in', value: [parentId, childId]})
  await endpoints.setFilter(endpointFilter.toJSON())
  if (endpoints.loadingError || endpoints.requestState !== SparkData.RequestState.Loaded) throw new Error('关系端点目录未能完成读取')
  if (!relationSessionMatches({session, dataSet: ds, view, context}) || selectionGeneration !== selection) throw new Error('关系端点查询返回时编辑目标已变化')
  assertRelationValidationSnapshot({view, session, context, selection, expected: snapshot})
  const endpointRows = endpoints.rows.filter(endpoint => {
    const id = endpoints.getPkKey(endpoint)
    return id === parentId || id === childId
  })
  if (endpoints.total !== 2 || endpointRows.length !== 2
    || endpointRows.some(endpoint => ['rowid', 'dbid', 'tblname'].some(field => endpoints.fieldAccess(endpoint, field).read !== 'visible'))) {
    throw new Error('关系端点目录缺失、重复或不可读')
  }
  const parent = endpointRows.find(endpoint => endpoints.getPkKey(endpoint) === parentId)
  const child = endpointRows.find(endpoint => endpoints.getPkKey(endpoint) === childId)
  if (!parent || !child || relationText(parent['dbid']) !== parentDbId || relationText(parent['tblname']) !== parentName
    || relationText(child['dbid']) !== childDbId || relationText(child['tblname']) !== childName) {
    throw new Error('关系端点身份、数据库或物理表名与正式目录不一致')
  }
  const currentEndpoint = inferredRole === 'master' ? parent : child
  if (endpoints.getPkKey(currentEndpoint) !== context.tableId
    || relationText(currentEndpoint['dbid']) !== context.dbId
    || relationText(currentEndpoint['tblname']) !== context.tableName) {
    throw new Error('当前表与关系端点目录不一致')
  }

  const fields = ds.getView(DATABASE_CATALOG_FIELD_MODEL, DATABASE_CATALOG_RELATION_FIELD_VIEW)
  if (!fields) throw new Error('缺少关系端点物理字段查询')
  if (fields.requestState === SparkData.RequestState.Loading) throw new Error('关系端点字段正在读取，暂不能保存')
  const fieldFilter = SparkData.DataViewFilter.condition({field: 'tblid', operator: 'in', value: [parentId, childId]})
  await fields.setFilter(fieldFilter.toJSON())
  if (fields.loadingError || fields.requestState !== SparkData.RequestState.Loaded || fields.rows.length !== fields.total) {
    throw new Error('关系端点字段目录未完整读取')
  }
  if (!relationSessionMatches({session, dataSet: ds, view, context}) || selectionGeneration !== selection) {
    throw new Error('关系端点字段返回时编辑目标已变化')
  }
  const currentRow = assertRelationValidationSnapshot({view, session, context, selection, expected: snapshot})
  if (fields.rows.some(field => ['tblid', 'enname', 'DataType'].some(name => fields.fieldAccess(field, name).read !== 'visible'))) {
    throw new Error('关系端点字段目录不可读')
  }
  const parentFieldNames = new Set(fields.rows.filter(field => relationText(field['tblid']) === parentId)
    .map(field => relationText(field['enname'])).filter(Boolean))
  const childFieldNames = new Set(fields.rows.filter(field => relationText(field['tblid']) === childId)
    .map(field => relationText(field['enname'])).filter(Boolean))
  const childMappedFieldNames = new Set(fields.rows.filter(field => relationText(field['tblid']) === childId
    && relationExpressionColumnType(field['DataType']) !== undefined)
    .map(field => relationText(field['enname'])).filter(Boolean))
  if (!parentFieldNames.size || !childFieldNames.size) throw new Error('关系端点未返回可读物理字段')
  const expression = currentRow['RelshipExp']
  if (expression !== undefined && expression !== null && expression !== '') {
    if (typeof expression !== 'string') throw new Error('关系表达式不是已核实的 SPARK JSON 文本')
    const expressionError = expressionReferenceError({expression, childTable: childName, parentTable: parentName,
      childNames: childFieldNames, mappedChildNames: childMappedFieldNames, parentNames: parentFieldNames})
    if (expressionError) throw new Error(expressionError)
  }
  return snapshot
}

async function loadRelationPeerCandidates(ds: SparkData.DataSet, context: DatabaseCatalogTableContext): Promise<SparkData.DataView> {
  const peers = ds.getView(DATABASE_CATALOG_TABLE_MODEL, DATABASE_CATALOG_RELATION_PEER_VIEW)
  if (!peers) throw new Error('表目录缺少关系对端命名视图')
  const filter = SparkData.DataViewFilter.group({logic: 'and', filters: [
    {field: 'dbid', operator: 'eq', value: context.dbId},
    {field: peers.primaryKey, operator: 'ne', value: context.tableId},
  ]})
  await peers.setFilter(filter.toJSON())
  if (peers.loadingError) throw peers.loadingError
  return peers
}

async function beginRelationCreate(role: 'master' | 'child'): Promise<void> {
  const ds = dataSet.value
  const relations = relationView.value
  const context = selectedTableContext.value
  const selection = selectionGeneration
  if (!ds || !relations || !context) throw new Error('请先选择物理表并打开表设计')
  await loadRelationPeerCandidates(ds, context)
  if (dataSet.value !== ds || relationView.value !== relations || !sameTableContext(selectedTableContext.value, context)
    || selectionGeneration !== selection || !tableDesignOpen.value) throw new Error('关系新增目标已变化，请重试')
  const session = await databaseCatalogRelationPrepareCreate(relations, context, role)
  if (dataSet.value !== ds || relationView.value !== relations || !sameTableContext(selectedTableContext.value, context)
    || selectionGeneration !== selection || !tableDesignOpen.value) {
    databaseCatalogRelationCancel(relations, session)
    throw new Error('关系新增目标已变化，已丢弃本次待新增行')
  }
  relationSession.value = session
  actionError.value = ''
}

async function beginRelationEdit(): Promise<void> {
  const ds = dataSet.value
  const relations = relationView.value
  const ctx = selectedTableContext.value
  const selection = selectionGeneration
  if (!ds || !relations || !ctx) throw new Error('请先选择物理表')
  const relationId = relations.getSelectedValues()[0]
  if (typeof relationId !== 'string') throw new Error('请先选择要编辑的关系')
  await loadRelationPeerCandidates(ds, ctx)
  if (dataSet.value !== ds || relationView.value !== relations || !sameTableContext(selectedTableContext.value, ctx)
    || selectionGeneration !== selection || !tableDesignOpen.value) throw new Error('关系编辑目标已变化，请重试')
  relationSession.value = databaseCatalogRelationPrepareEdit(relations, ctx, relationId)
  actionError.value = ''
}

function onRelationPeerChange(...args: unknown[]): void {
  const control = args.at(-1)
  if (!control || typeof control !== 'object' || !('cancel' in control) || typeof control.cancel !== 'boolean') return
  control.cancel = true
  try {
    const ds = dataSet.value
    const view = relationView.value
    const session = relationSession.value
    const context = selectedTableContext.value
    const value = args[0]
    if (!ds || !view || !session || !context || typeof value !== 'string') throw new Error('关系对端选择上下文已失效')
    if (!relationSessionMatches({session, dataSet: ds, view, context})) throw new Error('关系对端选择目标已变化')
    const peers = ds.getView(DATABASE_CATALOG_TABLE_MODEL, DATABASE_CATALOG_RELATION_PEER_VIEW)
    const peer = peers?.rows.find(row => peers.getPkKey(row) === value)
    if (!peer) throw new Error('所选关系对端不在当前已加载选项范围')
    databaseCatalogRelationChoosePeer({view, session, context, peerRow: peer})
    revision.value++
    actionError.value = ''
  } catch (cause) {
    actionError.value = cause instanceof Error ? cause.message : String(cause)
  }
}

function switchRelationRole(role: 'master' | 'child'): void {
  void act(() => {
    const ds = dataSet.value
    const view = relationView.value
    const session = relationSession.value
    const context = selectedTableContext.value
    if (!ds || !view || !session || !context || !relationSessionMatches({session, dataSet: ds, view, context})) {
      throw new Error('关系端点操作目标已变化')
    }
    relationSession.value = databaseCatalogRelationSwitchRole({view, session, context, nextRole: role})
    actionError.value = ''
    revision.value++
  })
}

async function cancelRelationDialog(): Promise<void> {
  await act(() => {
    const view = relationView.value
    const session = relationSession.value
    const context = selectedTableContext.value
    if (!view || !session || !context) throw new Error('关系编辑会话已失效')
    databaseCatalogRelationAssertSession(view, session, context)
    databaseCatalogRelationCancel(view, session)
    if (session.mode === 'edit') databaseCatalogRelationRelease(session)
    relationExpressionEditing.value = false
    relationSession.value = undefined
    relationExpressionGeneration.value++
    relationExpressionColumns.value = []
    relationExpressionContext.value = {}
    relationExpressionError.value = ''
    relationExpressionWarning.value = ''
  })
}

async function saveRelationDialog(): Promise<void> {
  await act(async () => {
    const ds = dataSet.value
    const view = relationView.value
    const session = relationSession.value
    const context = selectedTableContext.value
    if (!ds || !view || !session || !context) throw new Error('关系编辑会话已失效')
    if (!relationSessionMatches({session, dataSet: ds, view, context})) throw new Error('关系保存目标或查询身份已变化')
    const selection = selectionGeneration
    let validationSnapshot: string | undefined
    if (view.hasUnconfirmedSave) databaseCatalogRelationAssertIdentity(view, session, context)
    else {
      databaseCatalogRelationAssertSession(view, session, context)
      validationSnapshot = await validateRelationBeforeSave({dataSet: ds, view, session, context, selection})
    }
    if (!relationSessionMatches({session, dataSet: ds, view, context}) || selectionGeneration !== selection) {
      throw new Error('关系预检完成时编辑目标已变化')
    }
    if (validationSnapshot !== undefined) assertRelationValidationSnapshot({view, session, context, selection, expected: validationSnapshot})
    const result = await ds.saveChanges({views: [{tableName: DATABASE_CATALOG_RELATION_MODEL,
      viewId: DATABASE_CATALOG_RELATION_TABLE_VIEW, ids: [session.rowid]}]})
    if (!result.success) throw new Error(result.message ?? '保存表关系失败')
    if (dataSet.value !== ds || relationView.value !== view || relationSession.value !== session
      || !sameTableContext(selectedTableContext.value, context) || selectionGeneration !== selection) {
      databaseCatalogRelationRelease(session)
      throw new Error('表关系已提交，但当前目标已变化；新目标保持不变，请重新读取确认')
    }
    databaseCatalogRelationRelease(session)
    relationExpressionEditing.value = false
    relationSession.value = undefined
    relationExpressionGeneration.value++
    relationExpressionColumns.value = []
    relationExpressionContext.value = {}
    await databaseCatalogRelationRefreshForTable(view, context.tableId)
  }, '表关系已保存')
}

function relationExpressionColumnType(value: unknown): SparkData.DataColumn['type'] | undefined {
  const type = relationText(value).toUpperCase()
  if (['INT', 'INTEGER', 'BIGINT', 'SMALLINT', 'TINYINT', 'DECIMAL', 'NUMERIC', 'FLOAT', 'REAL', 'DOUBLE', 'NUMBER'].includes(type)) return 'number'
  if (['BIT', 'BOOL', 'BOOLEAN'].includes(type)) return 'boolean'
  if (['DATETIME', 'DATETIME2', 'TIMESTAMP', 'TIMESTAMP WITH TIME ZONE'].includes(type)) return 'datetime'
  if (type === 'DATE') return 'date'
  if (['TIME', 'TIME WITHOUT TIME ZONE'].includes(type)) return 'time'
  if (['CHAR', 'NCHAR', 'VARCHAR', 'NVARCHAR', 'TEXT', 'NTEXT', 'STRING'].includes(type)) return 'string'
  return undefined
}

function relationText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value === null || value === undefined ? '' : String(value).trim()
}

function relationEndpointSignature(): string {
  const session = relationSession.value
  const view = relationView.value
  if (!session || !view) return ''
  revision.value
  const row = view.getEditingRow(session.rowid)
  if (!row) return ''
  return JSON.stringify([session.rowid, session.currentRole, row['pkdbid'], row['pktbid'], row['pktable'],
    row['fkdbid'], row['fktbid'], row['fktable']])
}

function expressionReferenceError(options: Readonly<{expression: string; childTable: string; parentTable: string;
  childNames: ReadonlySet<string>; mappedChildNames: ReadonlySet<string>; parentNames: ReadonlySet<string>}>): string {
  const {expression, childTable, parentTable, childNames, mappedChildNames, parentNames} = options
  try {
  const tree = SparkData.DataViewFilterCodec.parseStored(expression)?.toJSON()
    if (!tree) return '关系表达式无法按 SPARK 条件格式解析；原值保留，请显式处理'
    const visit = (node: unknown): string => {
      if (!node || typeof node !== 'object') return '关系表达式节点无效；原值保留'
      if ('logic' in node) {
        const filters = 'filters' in node ? node.filters : undefined
        if (!Array.isArray(filters)) return '关系表达式分组无效；原值保留'
        for (const child of filters) {const problem = visit(child); if (problem) return problem}
        return ''
      }
      const field = 'field' in node ? node.field : undefined
      if (typeof field !== 'string' || !field.startsWith(`${childTable}.`)) {
        return '原关系表达式的从表字段不属于当前端点；原值保留，请核对或显式编辑'
      }
      const childField = field.slice(childTable.length + 1)
      if (!childNames.has(childField)) return '原关系表达式的从表字段不属于当前端点；原值保留，请核对或显式编辑'
      if (!mappedChildNames.has(childField)) return `原关系表达式引用字段 ${field}，其字段类型未映射（正式 DataType 无法映射）；原值保留，暂不能安全编辑`
      const value = 'value' in node ? node.value : undefined
      if (value && typeof value === 'object' && 'Type' in value && value['Type'] === 'GetTableField') {
        const related = 'Field' in value ? value['Field'] : undefined
        if (typeof related !== 'string' || !related.startsWith(`${parentTable}.`) || !parentNames.has(related.slice(parentTable.length + 1))) {
          return '原关系表达式引用的主表字段不属于当前端点；原值保留，请核对或显式编辑'
        }
      }
      return ''
    }
    return visit(tree)
  } catch {
    return '原关系表达式无法按 SPARK 条件格式解析；原值保留，请切换端点或显式处理'
  }
}

async function loadRelationExpressionCatalog(): Promise<void> {
  const ds = dataSet.value
  const view = relationView.value
  const session = relationSession.value
  const context = selectedTableContext.value
  if (!ds || !view || !session || !context || !relationSessionMatches({session, dataSet: ds, view, context})) {
    relationExpressionColumns.value = []
    relationExpressionContext.value = {}
    relationExpressionError.value = ''
    relationExpressionWarning.value = ''
    return
  }
  const identity = relationEndpointSignature()
  const row = view.getEditingRow(session.rowid)
  const parentId = relationText(row?.['pktbid']), childId = relationText(row?.['fktbid'])
  const parentName = relationText(row?.['pktable']), childName = relationText(row?.['fktable'])
  if (!parentId || !childId || !parentName || !childName) {
    relationExpressionGeneration.value++
    relationExpressionColumns.value = []
    relationExpressionContext.value = {}
    relationExpressionLoading.value = false
    relationExpressionError.value = ''
    relationExpressionWarning.value = ''
    return
  }
  const fields = ds.getView(DATABASE_CATALOG_FIELD_MODEL, DATABASE_CATALOG_RELATION_FIELD_VIEW)
  if (!fields) {
    relationExpressionError.value = '字段目录缺少关系端点命名视图；原关系表达式保留'
    relationExpressionWarning.value = ''
    return
  }
  const own = ++relationExpressionGeneration.value
  relationExpressionLoading.value = true
  relationExpressionError.value = ''
  relationExpressionWarning.value = ''
  try {
    const filter = SparkData.DataViewFilter.condition({field: 'tblid', operator: 'in', value: [parentId, childId]})
    await fields.setFilter(filter.toJSON())
    if (fields.loadingError) throw fields.loadingError
    if (own !== relationExpressionGeneration.value || !relationSessionMatches({session, dataSet: ds, view, context})
      || relationEndpointSignature() !== identity) return
    const rows = fields.rows
    const visibleRows = rows.filter(field => fields.fieldAccess(field, 'tblid').read === 'visible'
      && fields.fieldAccess(field, 'enname').read === 'visible'
      && fields.fieldAccess(field, 'DataType').read === 'visible'
      && fields.fieldAccess(field, 'DataTypeName').read === 'visible'
      && fields.fieldAccess(field, 'cnname').read === 'visible')
    if (visibleRows.length !== rows.length) throw new Error('端点字段目录受数据读取权限限制；原关系表达式保留')
    const parentRows = rows.filter(field => String(field['tblid'] ?? '') === parentId)
    const childRows = rows.filter(field => String(field['tblid'] ?? '') === childId)
    if (!parentRows.length || !childRows.length) throw new Error('当前端点未返回完整物理字段目录；原关系表达式保留')
    const childColumns: SparkData.DataColumn[] = childRows.flatMap(field => {
      const name = relationText(field['enname'])
      const type = relationExpressionColumnType(field['DataType'])
      if (!name || !type) return []
      return [{name: `${childName}.${name}`, label: `${childName}.${relationText(field['cnname']) || name}`, type}]
    })
    const relatedFields = parentRows.flatMap(field => {
      const name = relationText(field['enname'])
      if (!name) return []
      return [{value: `${parentName}.${name}`, label: `${parentName}.${relationText(field['cnname']) || name}`}]
    })
    const rawExpression = row?.['RelshipExp']
    let warning = childColumns.length < childRows.length
      ? '部分端点字段的正式 DataType 未映射，候选字段已省略；原关系表达式保留'
      : ''
    let error = ''
    if (rawExpression !== undefined && rawExpression !== null && rawExpression !== '') {
      if (typeof rawExpression !== 'string') error = '关系表达式不是实服确认的 SPARK JSON 文本；原值保留，不能自动转换'
      else error = expressionReferenceError({expression: rawExpression, childTable: childName, parentTable: parentName,
        childNames: new Set(childRows.map(field => relationText(field['enname'])).filter(Boolean)),
        mappedChildNames: new Set(childColumns.map(column => column.name.slice(childName.length + 1))),
        parentNames: new Set(relatedFields.map(item => item.value.slice(parentName.length + 1)))})
    }
    relationExpressionColumns.value = childColumns
    relationExpressionContext.value = {relatedFields}
    relationExpressionError.value = error
    relationExpressionWarning.value = warning
  } catch (cause) {
    if (own === relationExpressionGeneration.value && relationSessionMatches({session, dataSet: ds, view, context})) {
      relationExpressionColumns.value = []
      relationExpressionContext.value = {}
      relationExpressionWarning.value = ''
      relationExpressionError.value = cause instanceof Error ? `${cause.message}；原关系表达式保留` : '端点字段目录读取失败；原关系表达式保留'
    }
  } finally {
    if (own === relationExpressionGeneration.value && relationSessionMatches({session, dataSet: ds, view, context})) relationExpressionLoading.value = false
  }
}

watch(() => relationEndpointSignature(), () => {void loadRelationExpressionCatalog()}, {flush: 'post'})

async function syncDesignMetadata(): Promise<void> {
  await act(async () => {
    const ds = dataSet.value
  const db = dbView.value
    const tables = tableView.value
    const fields = fieldTableView.value
    if (!ds || !db || !tables || !fields) return
    const dbId = databaseCatalogDbSelectedId(db)
    const tableId = tables.getSelectedValues()[0]
    if (!dbId) throw new Error('请先选择数据库')
    if (typeof tableId !== 'string') throw new Error('请先选择物理表')
    await databaseCatalogSyncTableMetadata({dataSet: ds, dbId, tableId, fieldView: fields})
  }, '元数据已同步')
}

async function refreshDesignFields(): Promise<void> {
  await act(async () => {
    await refreshFields()
  })
}

async function refreshChildren(): Promise<void> {
  const tables = tableView.value
  const views = viewView.value
  if (!tables || !views) return
  await Promise.all([tables.refresh(), views.refresh()])
  if (tables.loadingError) throw tables.loadingError
  if (views.loadingError) throw views.loadingError
}

async function refreshFields(): Promise<void> {
  const fields = activeFieldView.value
  if (!fields || !activeFieldParentSelected.value) return
  await fields.refresh()
  if (fields.loadingError) throw fields.loadingError
}

function assertDatabaseSelectionReplaceable(): void {
  if (relationSession.value) throw new Error('表关系编辑期间不能切换数据库或物理表')
  for (const view of [tableView.value, viewView.value, fieldTableView.value, fieldViewView.value, relationView.value]) {
    view?.assertResultReplacementAllowed()
  }
}

const guardDatabaseCurrentChange: NonNullable<RTableProps['onCurrentChange']> = (_row, _previous, control) => {
  try {
    assertDatabaseSelectionReplaceable()
  } catch (cause) {
    control.cancel = true
    actionError.value = cause instanceof Error ? cause.message : String(cause)
  }
}

const chooseDatabase: NonNullable<RTableProps['onRowClick']> = async (...args: Parameters<NonNullable<RTableProps['onRowClick']>>) => {
  const [row, , , control] = args
  control.cancel = true
  if (busy.value) return
  const view = dbView.value
  const original = toRaw(row)
  if (!view?.rows.includes(original)) return
  const ds = dataSet.value
  const own = ++selectionGeneration
  const current = () => active && own === selectionGeneration && dataSet.value === ds
  try {
    assertDatabaseSelectionReplaceable()
    tableView.value?.clearAll()
    viewView.value?.clearAll()
    fieldTableView.value?.clearAll()
    fieldViewView.value?.clearAll()
    view.setCurrentRow(original)
  view.setSelectedRows([original])
  } catch (cause) {
    actionError.value = cause instanceof Error ? cause.message : String(cause)
    return
  }
  actionError.value = ''
  revision.value++
  if (ds) databaseCatalogSyncCommandInput(ds, view)
  try {
    await refreshChildren()
  } catch (cause) {
    if (current()) actionError.value = cause instanceof Error ? cause.message : String(cause)
  }
}

function chooseApplication(row: SparkData.DataRow): void {
  if (busy.value) return
  const apps = appSystemView.value
  const original = toRaw(row)
  if (apps?.rows.includes(original)) apps.setSelectedRows([original])
  revision.value++
}

function chooseRelation(row: SparkData.DataRow): void {
  if (busy.value || relationSession.value) return
  const view = relationView.value
  const original = toRaw(row)
  if (view?.rows.includes(original)) view.setSelectedRows([original])
  revision.value++
}

const chooseTable: NonNullable<RTableProps['onRowClick']> = async (...args) => {
  const [row, , , control] = args
  if (busy.value || relationSession.value) {control.cancel = true; return}
  const view = tableView.value
  const original = toRaw(row)
  if (!view?.rows.includes(original)) {control.cancel = true; return}
  const ds = dataSet.value
  const own = ++selectionGeneration
  const current = () => active && own === selectionGeneration && dataSet.value === ds
  viewView.value?.setSelectedRows([])
  view.setSelectedRows([original])
  revision.value++
  try {
    await refreshFields()
    if (current() && tableDesignOpen.value) await refreshTableRelations()
  } catch (cause) {
    if (current()) error.value = cause instanceof Error ? cause.message : String(cause)
  }
}

const chooseView: NonNullable<RTableProps['onRowClick']> = async (...args) => {
  const [row, , , control] = args
  if (busy.value || relationSession.value) {control.cancel = true; return}
  const view = viewView.value
  const original = toRaw(row)
  if (!view?.rows.includes(original)) {control.cancel = true; return}
  const ds = dataSet.value
  const own = ++selectionGeneration
  const current = () => active && own === selectionGeneration && dataSet.value === ds
  tableView.value?.setSelectedRows([])
  view.setSelectedRows([original])
  revision.value++
  try {
    await refreshFields()
  } catch (cause) {
    if (current()) error.value = cause instanceof Error ? cause.message : String(cause)
  }
}

function release(): void {
  actionGeneration++
  selectionGeneration++
  busy.value = false; actionError.value = ''; message.value = ''; unregisteredHint.value = ''; unregisteredTableHint.value = ''
  unsubscribe?.()
  unsubscribe = undefined
  sparkRemove(PAGE_RUNTIME)
  runtime?.dispose()
  runtime = undefined
  tableEdit.value = undefined
  tableDesignOpen.value = false
  if (relationSession.value?.mode === 'edit') databaseCatalogRelationRelease(relationSession.value)
  relationSession.value = undefined
  relationExpressionEditing.value = false
  viewDesignOpen.value = false
  objectRegisterOpen.value = false
  copyTableOpen.value = false
  deleteTarget.value = undefined
  unregisteredTableHint.value = ''
  dbView.value = undefined
  tableView.value = undefined
  viewView.value = undefined
  fieldTableView.value = undefined
  fieldViewView.value = undefined
  relationView.value = undefined
  previewView.value = undefined
  viewPreviewView.value = undefined
  appSystemView.value = undefined
  workflowView.value = undefined
  dataSet.value?.destroy()
  dataSet.value = undefined
}

function hasPendingWork(): boolean {
  if (busy.value || loading.value || relationExpressionEditing.value) return true
  const data = dataSet.value
  if (!data) return false
  return Object.values(data.tables).some(table => Object.values(table.views).some(view =>
    view.mutating || view.hasUnconfirmedSave || view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges()))
}

useSystemPageDirtySource({get isDirty() {return hasPendingWork()}})

watch(tableDesignOpen, open => {
  if (!open) return
  void act(async () => refreshTableRelations())
})

watch([scenarioId, requestedDatabaseId], async ([id, databaseTarget]) => {
  const own = ++generation
  ready.value = false
  loading.value = true
  error.value = ''
  release()
  try {
    if (!id) throw new Error('表和视图管理入口缺少导航绑定的数据空间ID')
    if (databaseTarget.error) throw new Error(databaseTarget.error)
    const databaseId = databaseTarget.value
    const ds = await LowcodeDatabaseTableView.loadCatalog(id, databaseId === undefined ? {} : {databaseId})
    if (!active || own !== generation) {ds.destroy(); return}
    const db = ds.getView(DATABASE_CATALOG_DB_MODEL, 'default')
    const tables = ds.getView(DATABASE_CATALOG_TABLE_MODEL, 'default')
    const views = ds.getView(DATABASE_CATALOG_VIEW_MODEL, 'default')
    const tableFields = ds.getView(DATABASE_CATALOG_FIELD_MODEL, DATABASE_CATALOG_FIELD_TABLE_VIEW)
    const viewFields = ds.getView(DATABASE_CATALOG_FIELD_MODEL, DATABASE_CATALOG_FIELD_VIEW_VIEW)
    if (!db || !tables || !views || !tableFields || !viewFields) throw new Error('表和视图目录缺少正式视图')
    if (databaseId !== undefined) {
      const matches = db.rows.filter(row => String(db.getPkKey(row) ?? '') === databaseId)
      if (matches.length !== 1 || db.total !== 1) throw new Error('指定 databaseId 未在当前数据库目录中唯一命中')
      db.setCurrentRow(matches[0]!)
    }
    dataSet.value = ds
    dbView.value = db
    tableView.value = tables
    viewView.value = views
    fieldTableView.value = tableFields
    fieldViewView.value = viewFields
    relationView.value = ds.getView(DATABASE_CATALOG_RELATION_MODEL, DATABASE_CATALOG_RELATION_TABLE_VIEW) ?? undefined
    previewView.value = ds.getView(DATABASE_TABLE_PREVIEW_RESULT_TABLE, 'default') ?? undefined
    viewPreviewView.value = ds.getView(DATABASE_VIEW_PREVIEW_RESULT_TABLE, 'default') ?? undefined
    appSystemView.value = ds.getView(DATABASE_CATALOG_APP_SYSTEM_MODEL, 'default') ?? undefined
    workflowView.value = ds.getView(DATABASE_CATALOG_WORKFLOW_MODEL, DATABASE_CATALOG_WORKFLOW_TABLE_VIEW) ?? undefined
    databaseCatalogSyncCommandInput(ds, db)
    const formKey = ds.scenarioId ?? id
    const current = new PageRuntime({pageId: 'table-and-view-page', scenarioIds: [formKey], loadScenario: async () => ds})
    runtime = current
    await current.load()
    if (!active || own !== generation) {current.dispose(); ds.destroy(); return}
    unsubscribe = ds.onAnyViewChange({
      rowsChanged: () => revision.value++,
      selectedRowsChanged: () => revision.value++,
      requestStateChanged: () => revision.value++,
      editingChanged: () => revision.value++,
    })
    sparkProvide(PAGE_RUNTIME, current)
    ready.value = true
    if (databaseId !== undefined) {
      try {await refreshChildren()} catch { /* 正式子目录视图保留其加载错误，目录仍可见 */ }
    }
  } catch (cause) {
    if (active && own === generation) {
      error.value = cause instanceof Error ? cause.message : String(cause)
      release()
    }
  } finally {
    if (active && own === generation) {
      loading.value = false
    }
  }
}, {immediate: true})

onBeforeUnmount(() => {active = false; generation++; release()})
</script>

<style scoped>
.table-and-view-page { display: grid; gap: 16px; padding: 24px; color: var(--el-text-color-primary); }
h1 { margin: 0; font-size: 20px; }
h2 { margin: 0 0 8px; font-size: 16px; }
header p { color: var(--el-text-color-secondary); }
.table-and-view-layout { display: grid; grid-template-columns: minmax(280px, 360px) 1fr; gap: 20px; align-items: start; }
.table-and-view-main { display: grid; gap: 16px; }
.table-and-view-fields { display: grid; gap: 8px; }
.table-and-view-hint { color: var(--el-text-color-secondary); margin: 0; padding-top: 24px; }
.table-and-view-catalog-blocked { color: var(--el-color-warning); margin: 0; }
[role="alert"] { color: var(--el-color-danger); }
@media (max-width: 960px) {
  .table-and-view-layout { grid-template-columns: 1fr; }
}
</style>
