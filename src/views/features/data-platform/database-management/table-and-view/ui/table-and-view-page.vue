<!--
@module app:views/features/data-platform/database-management/table-and-view/ui/table-and-view-page
职责：库/表/视图/字段目录；登记与字段维护经 DataSet.saveChanges；列元信息只在各模型 DataTable.columns，autoColumns 消费列链，不手写字段 children。
-->
<template>
  <section class="table-and-view-page">
    <header><h1>表和视图管理</h1><p>登记库/表并维护字段目录；读写均经同一 DataSet。</p></header>
    <p v-if="catalogHubCatalogBlocked" class="table-and-view-catalog-blocked" role="status">{{ catalogBlockedNotice }}</p>
    <p v-else-if="loading" role="status">正在读取目录…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="ready">
      <p v-if="serverListError" role="alert">{{ serverListError }}</p>
      <p v-if="dbListError" role="alert">{{ dbListError }}</p>
      <p v-if="message" role="status">{{ message }}</p>
      <div class="table-and-view-layout">
        <section class="table-and-view-sidebar">
          <h2>数据库列表</h2>
          <div :inert="busy || !!dbEdit || !!tableEdit">
            <RendererTable :data-view-key="dbKey" :auto-columns="true" :toolbar="dbToolbar" :filter="catalogListFilter" :stripe="true"
              :on-row-click="chooseDatabase" :highlight-current-row="true" :show-pagination="false" :show-data-view-meta="false" />
          </div>
        </section>
        <section v-if="databaseSelected" class="table-and-view-main">
          <RendererTabs v-model="objectTab">
            <RendererTabPane name="tables" label="物理表" :index="0">
              <p v-if="tableListError" role="alert">{{ tableListError }}</p>
              <RendererTable :data-view-key="tableKey" :children="DATABASE_CATALOG_TABLE_LIST_FIELDS" :toolbar="tableToolbar" :stripe="true" :show-pagination="false" :show-data-view-meta="false"
                :on-row-click="chooseTable" :highlight-current-row="true" />
            </RendererTabPane>
            <RendererTabPane name="views" label="视图" :index="1" :lazy="true">
              <p v-if="viewListError" role="alert">{{ viewListError }}</p>
              <RendererTable :data-view-key="viewKey" :children="DATABASE_CATALOG_VIEW_LIST_FIELDS" :toolbar="viewToolbar" :stripe="true" :show-pagination="false" :show-data-view-meta="false"
                :on-row-click="chooseView" :highlight-current-row="true" />
            </RendererTabPane>
          </RendererTabs>
          <section v-if="resourceSelected" class="table-and-view-fields">
            <h2>字段</h2>
            <p v-if="fieldListError" role="alert">{{ fieldListError }}</p>
            <RendererTable :data-view-key="fieldKey" :children="fieldGridChildren" :toolbar="childToolbar" :stripe="true" :show-pagination="false" :show-data-view-meta="false" />
          </section>
          <p v-else class="table-and-view-hint">选择一张表或视图以查看字段目录。</p>
        </section>
        <p v-else class="table-and-view-hint">请从左侧选择数据库（连接已在服务器管理配置，本页不再重复选择服务器）。</p>
      </div>
      <RegisterDatabaseDialog v-if="dbEditing"
        :catalog-key="dbKey" :server-label="selectedServerLabel" :editing="dbEditing"
        :busy="busy" :action-error="actionError" :unregistered-hint="unregisteredHint"
        :can-load-unregistered="canLoadUnregistered"
        @cancel="cancelDbRegister" @save="saveDbRegister" @load-unregistered="loadUnregisteredNames" />
      <RegisterDialog v-if="objectRegisterOpen"
        :database-label="selectedDatabaseLabel" :object-type="objectRegisterType"
        :list-key="objectRegisterListKey" :busy="busy" :load-list="loadObjectRegisterList"
        @update:object-type="value => objectRegisterType = value"
        @cancel="closeObjectRegister" @confirm="confirmObjectRegister" />
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
      <TableRelationDialog v-if="relationDraft"
        :draft="relationDraft" :current-table-label="selectedTableLabel"
        :peer-table-options="relationPeerTableOptions" :peer-table-id="relationPeerTableId"
        :busy="busy" :action-error="actionError"
        @update:draft="updateRelationDraft"
        @update:peer-table-id="assignRelationPeerTable"
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
      <p v-if="actionError && !dbEditing && !deleteTarget" role="alert">{{ actionError }}</p>
    </template>
  </section>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, reactive, ref, shallowRef, toRaw, watch} from 'vue'
import {useDatabaseCatalogRouteScenario} from '@/lowcode/resources/database/database-catalog-context'
import {DATABASE_CATALOG_SERVER_ONLY_NOTICE} from '@/lowcode/resources/database/database-catalog-scenario'
import {buildDataViewKey, type DataRow, type DataSet, type DataView} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import * as SparkComponent from '@spark-appworks/spark-component'
import {
  buildDatabaseCatalogFieldGridChildren,
  databaseCatalogHasDesensitizationRules,
  databaseCatalogHasEncryptionDictionary,
  databaseCatalogHasFieldTypeDictionary,
} from '@/lowcode/resources/database/database-catalog-field-metadata'
import {
  DATABASE_CATALOG_TABLE_DESIGN_HEADER_FIELDS,
  DATABASE_CATALOG_VIEW_DESIGN_FORM_FIELDS,
} from '@/lowcode/resources/database/database-catalog-object-design-metadata'
import {
  DATABASE_CATALOG_DB_MODEL,
  DATABASE_CATALOG_SERVER_MODEL,
  DATABASE_CATALOG_TABLE_MODEL,
  DATABASE_CATALOG_VIEW_MODEL,
  DATABASE_CATALOG_FIELD_MODEL,
  DATABASE_CATALOG_FIELD_TABLE_VIEW,
  DATABASE_CATALOG_FIELD_VIEW_VIEW,
  DATABASE_UNREGISTERED_TABLE_NAMES_TABLE,
  DATABASE_UNREGISTERED_VIEW_NAMES_TABLE,
  DATABASE_CATALOG_RELATION_MODEL,
  DATABASE_CATALOG_RELATION_TABLE_VIEW,
  DATABASE_CATALOG_WORKFLOW_MODEL,
  DATABASE_CATALOG_WORKFLOW_TABLE_VIEW,
  DATABASE_CATALOG_APP_SYSTEM_MODEL,
  LowcodeDatabaseTableView,
} from '@/lowcode/resources/database/lowcode-database-table-view'
import {DATABASE_CATALOG_RELATION_LIST_FIELDS} from '@/lowcode/resources/database/database-catalog-relation-metadata'
import {
  databaseCatalogHasRelationCatalog,
  databaseCatalogRelationCanDeleteSelected,
  databaseCatalogRelationDeleteSelected,
  databaseCatalogRelationRefreshForTable,
} from '@/lowcode/resources/database/database-catalog-relation-view-ops'
import {
  type DatabaseCatalogRelationFormDraft,
  type DatabaseCatalogTableContext,
  databaseCatalogRelationCancelDraft,
  databaseCatalogRelationPeerTableId,
  databaseCatalogRelationPrepareCreate,
  databaseCatalogRelationPrepareEdit,
  databaseCatalogRelationSaveDraft,
  databaseCatalogRelationWithPeerTable,
} from '@/lowcode/resources/database/database-catalog-relation-form-ops'
import {
  databaseCatalogDbBeginCreate,
  databaseCatalogDbCancelEdit,
  databaseCatalogDbCanCreate,
  databaseCatalogDbEditing,
  databaseCatalogEnsureImplicitServer,
  databaseCatalogSyncCommandInput,
  databaseCatalogDbSaveEdit,
  databaseCatalogQueryUnregisteredDbNames,
  databaseCatalogServerSelectedId,
  type DatabaseCatalogDbEditState,
} from '@/lowcode/resources/database/database-catalog-db-view-ops'
import RegisterDatabaseDialog from './register-database-dialog.vue'
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
} from '@/lowcode/resources/database/database-catalog-table-view-ops'
import {
  databaseCatalogDesignCanSave,
  databaseCatalogDesignSavePending,
} from '@/lowcode/resources/database/database-catalog-field-view-ops'
import {databaseCatalogQueryUnregisteredViewNames, databaseCatalogSyncTableMetadata} from '@/lowcode/resources/database/database-catalog-sync-view-ops'
import {
  databaseCatalogRegisterTables,
  databaseCatalogRegisterViews,
} from '@/lowcode/resources/database/database-catalog-register-view-ops'
import {
  DATABASE_CATALOG_TABLE_LIST_FIELDS,
  DATABASE_CATALOG_VIEW_LIST_FIELDS,
} from '@/lowcode/resources/database/database-catalog-list-metadata'
import {
  databaseCatalogCanDeleteRow,
  databaseCatalogDeleteRow,
} from '@/lowcode/resources/database/database-catalog-object-view-ops'
import {databaseCatalogCopyTable} from '@/lowcode/resources/database/database-catalog-copy-view-ops'
import {
  DATABASE_TABLE_PREVIEW_RESULT_TABLE,
  DATABASE_VIEW_PREVIEW_RESULT_TABLE,
  databaseCatalogHasTablePreview,
  databaseCatalogHasViewPreview,
  databaseCatalogPreviewRefresh,
  databaseCatalogViewPreviewRefresh,
} from '@/lowcode/resources/database/database-catalog-preview-view-ops'
import {
  buildDatabaseCatalogWorkflowListFields,
  databaseCatalogHasWorkflowStatusDictionary,
} from '@/lowcode/resources/database/database-catalog-workflow-metadata'
import {
  databaseCatalogHasWorkflowCatalog,
  databaseCatalogWorkflowRefreshForTable,
  type DatabaseCatalogWorkflowQuery,
} from '@/lowcode/resources/database/database-catalog-workflow-view-ops'

type RFilterProps = SparkComponent.RFilterProps
type RToolbarProps = SparkComponent.RToolbarProps
const {PAGE_RUNTIME, RendererTable, RendererTabs, RendererTabPane, RendererDialog, RendererButton, useSparkComponent} = SparkComponent

const {
  scenarioId,
  catalogLoadOptions,
  catalogAwaitingHubResolve,
  catalogHubResolveFailed,
  catalogHubCatalogBlocked,
} = useDatabaseCatalogRouteScenario()
const catalogBlockedNotice = DATABASE_CATALOG_SERVER_ONLY_NOTICE
const {sparkProvide, sparkRemove} = useSparkComponent({type: 'table-and-view-page'})
const dataSet = shallowRef<DataSet>()
const serverView = shallowRef<DataView>()
const dbView = shallowRef<DataView>()
const dbEdit = shallowRef<DatabaseCatalogDbEditState>()
const tableEdit = shallowRef<DatabaseCatalogTableEditState>()
const tableDesignOpen = ref(false)
const relationDraft = ref<DatabaseCatalogRelationFormDraft>()
const viewDesignOpen = ref(false)
const applicationOptionOpen = ref(false)
const copyTableOpen = ref(false)
const objectRegisterOpen = ref(false)
const objectRegisterType = ref<RegisterObjectType>('table')
const deleteTarget = ref<{kind: 'table' | 'view'; id: string; label: string} | undefined>()
const tableView = shallowRef<DataView>()
const viewView = shallowRef<DataView>()
const fieldTableView = shallowRef<DataView>()
const relationView = shallowRef<DataView>()
const previewView = shallowRef<DataView>()
const viewPreviewView = shallowRef<DataView>()
const appSystemView = shallowRef<DataView>()
const workflowView = shallowRef<DataView>()
const fieldViewView = shallowRef<DataView>()
const ready = ref(false), loading = ref(false), error = ref(''), revision = ref(0), objectTab = ref<string | number>('tables')
const busy = ref(false), actionError = ref(''), message = ref(''), unregisteredHint = ref(''), unregisteredTableHint = ref('')
const workflowQuery = reactive<{name?: string; workflowKey?: string; description?: string; status?: string}>({})
let runtime: PageRuntime | undefined, unsubscribe: (() => void) | undefined, generation = 0, active = true, actionGeneration = 0

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
      disabled: busy.value || !ds || !relations || !!relationDraft.value || !selectedTableContext.value,
      onClick: () => { void act(() => beginRelationCreate('child')) },
    }},
    {type: 'r-button', props: {
      label: '编辑',
      disabled: busy.value || !relations || !!relationDraft.value || !canEdit,
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
const relationPeerTableOptions = computed(() => {
  revision.value
  const ctx = selectedTableContext.value
  const tables = tableView.value
  if (!ctx || !tables) return []
  return tables.rows
    .filter(row => {
      const id = tables.getPkKey(row)
      return typeof id === 'string' && id !== ctx.tableId && row['dbid'] === ctx.dbId
    })
    .map(row => {
      const id = tables.getPkKey(row)
      const name = typeof row['tblname'] === 'string' ? row['tblname'] : String(id ?? '')
      return {value: String(id ?? ''), label: name}
    })
})
const relationPeerTableId = computed(() => {
  const draft = relationDraft.value
  if (!draft) return ''
  return databaseCatalogRelationPeerTableId(draft)
})
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
const dbKey = computed(() => buildDataViewKey(DATABASE_CATALOG_DB_MODEL, 'default', catalogScenarioId.value))
const tableKey = computed(() => buildDataViewKey(DATABASE_CATALOG_TABLE_MODEL, 'default', catalogScenarioId.value))
const viewKey = computed(() => buildDataViewKey(DATABASE_CATALOG_VIEW_MODEL, 'default', catalogScenarioId.value))
const fieldKey = computed(() => buildDataViewKey(DATABASE_CATALOG_FIELD_MODEL,
  objectTab.value === 'views' ? DATABASE_CATALOG_FIELD_VIEW_VIEW : DATABASE_CATALOG_FIELD_TABLE_VIEW, catalogScenarioId.value))
const relationKey = computed(() => {
  revision.value
  if (!relationView.value) return ''
  return buildDataViewKey(DATABASE_CATALOG_RELATION_MODEL, DATABASE_CATALOG_RELATION_TABLE_VIEW, catalogScenarioId.value)
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
  return buildDataViewKey(DATABASE_TABLE_PREVIEW_RESULT_TABLE, 'default', catalogScenarioId.value)
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
  return buildDataViewKey(DATABASE_VIEW_PREVIEW_RESULT_TABLE, 'default', catalogScenarioId.value)
})
const viewPreviewListError = computed(() => {revision.value; return viewPreviewView.value?.loadingError?.message ?? ''})
const appSystemKey = computed(() => {
  revision.value
  if (!appSystemView.value) return ''
  return buildDataViewKey(DATABASE_CATALOG_APP_SYSTEM_MODEL, 'default', catalogScenarioId.value)
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
  return buildDataViewKey(DATABASE_CATALOG_WORKFLOW_MODEL, DATABASE_CATALOG_WORKFLOW_TABLE_VIEW, catalogScenarioId.value)
})
const workflowListFields = computed(() => {
  revision.value
  const ds = dataSet.value
  if (!ds) return []
  return buildDatabaseCatalogWorkflowListFields(ds)
})
const workflowListError = computed(() => {revision.value; return workflowView.value?.loadingError?.message ?? ''})
const unregisteredTableNamesKey = computed(() => buildDataViewKey(DATABASE_UNREGISTERED_TABLE_NAMES_TABLE, 'default', catalogScenarioId.value))
const unregisteredViewNamesKey = computed(() => buildDataViewKey(DATABASE_UNREGISTERED_VIEW_NAMES_TABLE, 'default', catalogScenarioId.value))
const objectRegisterListKey = computed(() => objectRegisterType.value === 'table' ? unregisteredTableNamesKey.value : unregisteredViewNamesKey.value)
const activeFieldView = computed(() => objectTab.value === 'views' ? fieldViewView.value : fieldTableView.value)

const serverListError = computed(() => {revision.value; return serverView.value?.loadingError?.message ?? ''})
const dbListError = computed(() => {revision.value; return dbView.value?.loadingError?.message ?? ''})
const dbEditing = computed(() => {revision.value; const v = dbView.value; return v ? databaseCatalogDbEditing(v, dbEdit.value) : undefined})
const tableEditing = computed(() => {revision.value; const v = tableView.value; return v ? databaseCatalogTableEditing(v, tableEdit.value) : undefined})
const selectedServerLabel = computed(() => {
  revision.value
  const view = serverView.value
  if (!view) return ''
  const id = databaseCatalogServerSelectedId(view)
  const row = view.rows.find(item => view.getPkKey(item) === id)
  const name = row?.['ServerName']
  return typeof name === 'string' && name ? name : id
})
const canLoadUnregistered = computed(() => {
  revision.value
  const view = serverView.value
  return !!view && databaseCatalogServerSelectedId(view).length > 0 && !busy.value
})
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
  const tables = tableView.value
  const views = viewView.value
  if (!tables || !views) return false
  return tables.getSelectedValues().length === 1 || views.getSelectedValues().length === 1
})

const dbToolbar = computed<RToolbarProps>(() => {
  revision.value
  const db = dbView.value
  const server = serverView.value
  return {children: [
    {type: 'r-button', props: {label: '注册数据库', disabled: busy.value || !!dbEdit.value || !db || !server || !databaseCatalogDbCanCreate(db, server, dbEdit.value), onClick: beginDbRegister}},
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
      disabled: busy.value || !!tableEdit.value || !!dbEdit.value || objectRegisterOpen.value || !db || !databaseSelected.value,
      onClick: () => openObjectRegister('table'),
    }},
    {type: 'r-button', props: {
      label: '新增',
      disabled: busy.value || !!tableEdit.value || !!dbEdit.value || !tables || !db || !databaseCatalogTableCanCreate(tables, db, tableEdit.value),
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
      disabled: busy.value || !!tableEdit.value || !!dbEdit.value || objectRegisterOpen.value || !db || !databaseSelected.value,
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

async function beginDbRegister(): Promise<void> {
  await act(async () => {
    const db = dbView.value
    const server = serverView.value
    if (!db || !server) return
    unregisteredHint.value = ''
    dbEdit.value = await databaseCatalogDbBeginCreate(db, server)
  })
}

async function cancelDbRegister(): Promise<void> {
  await act(() => {
    const db = dbView.value
    const current = dbEdit.value
    if (!db || !current) return
    dbEdit.value = databaseCatalogDbCancelEdit(db, current)
    unregisteredHint.value = ''
  })
}

async function saveDbRegister(): Promise<void> {
  await act(async () => {
    const ds = dataSet.value
    const db = dbView.value
    const current = dbEdit.value
    if (!ds || !db || !current) return
    dbEdit.value = await databaseCatalogDbSaveEdit(ds, db, current) ?? undefined
    if (!dbEdit.value) unregisteredHint.value = ''
  }, '数据库已注册')
}

function openObjectRegister(type: RegisterObjectType): void {
  objectRegisterType.value = type
  objectRegisterOpen.value = true
  tableDesignOpen.value = false
  viewDesignOpen.value = false
}

function closeObjectRegister(): void {
  objectRegisterOpen.value = false
}

async function loadObjectRegisterList(type: RegisterObjectType): Promise<void> {
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

async function confirmObjectRegister(payload: Readonly<{addDefaultFields: boolean}>): Promise<void> {
  await act(async () => {
    const ds = dataSet.value
    const db = dbView.value
    if (!ds || !db) return
    const dbId = databaseCatalogDbSelectedId(db)
    if (!dbId) throw new Error('请先选择数据库')
    const tableKey = DATABASE_UNREGISTERED_TABLE_NAMES_TABLE
    const viewKey = DATABASE_UNREGISTERED_VIEW_NAMES_TABLE
    const listView = ds.getView(objectRegisterType.value === 'table' ? tableKey : viewKey, 'default')
    if (!listView) throw new Error('未注册列表视图缺失')
    const selected = listView.selectedRows
    const names = selected.map(row => {
      const name = row['name']
      if (typeof name !== 'string' || !name.trim()) throw new Error('未注册项名称无效')
      return name.trim()
    })
    if (names.length === 0) throw new Error(`请至少选择一个${objectRegisterType.value === 'table' ? '表' : '视图'}`)
    if (objectRegisterType.value === 'table') {
      await databaseCatalogRegisterTables(ds, dbId, names.map(tableName => ({
        tableName,
        tableComment: '',
        addDefaultFields: payload.addDefaultFields,
      })))
    } else {
      await databaseCatalogRegisterViews(ds, dbId, names.map(viewName => ({viewName, viewComment: ''})))
    }
    listView.clearSelectedRows()
    await refreshChildren()
    objectRegisterOpen.value = false
  }, objectRegisterType.value === 'table' ? '表已注册' : '视图已注册')
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
  relationDraft.value = undefined
  resetWorkflowQuery()
  tableDesignOpen.value = false
}

function updateRelationDraft(next: DatabaseCatalogRelationFormDraft): void {
  const ctx = selectedTableContext.value
  const previous = relationDraft.value
  if (ctx && previous && next.mode === 'add' && next.currentRole !== previous.currentRole) {
    relationDraft.value = {
      ...next,
      pkdbid: ctx.dbId,
      fkdbid: ctx.dbId,
      ...(next.currentRole === 'master'
        ? {pktbid: ctx.tableId, pktable: ctx.tableName, fktbid: '', fktable: ''}
        : {fktbid: ctx.tableId, fktable: ctx.tableName, pktbid: '', pktable: ''}),
    }
    return
  }
  relationDraft.value = next
}

function assignRelationPeerTable(peerId: string): void {
  const draft = relationDraft.value
  const tables = tableView.value
  const ctx = selectedTableContext.value
  if (!draft || !tables || !ctx || !peerId) return
  const peer = tables.rows.find(row => tables.getPkKey(row) === peerId)
  if (!peer) return
  const tblname = typeof peer['tblname'] === 'string' ? peer['tblname'] : peerId
  const dbid = typeof peer['dbid'] === 'string' ? peer['dbid'] : ctx.dbId
  relationDraft.value = databaseCatalogRelationWithPeerTable(draft, {rowid: peerId, tblname, dbid})
}

async function beginRelationCreate(role: 'master' | 'child'): Promise<void> {
  const relations = relationView.value
  const ctx = selectedTableContext.value
  if (!relations || !ctx) throw new Error('请先选择物理表并打开表设计')
  relationDraft.value = await databaseCatalogRelationPrepareCreate(relations, ctx, role)
}

async function beginRelationEdit(): Promise<void> {
  const relations = relationView.value
  const ctx = selectedTableContext.value
  if (!relations || !ctx) throw new Error('请先选择物理表')
  const relationId = relations.getSelectedValues()[0]
  if (typeof relationId !== 'string') throw new Error('请先选择要编辑的关系')
  relationDraft.value = databaseCatalogRelationPrepareEdit(relations, ctx, relationId)
}

async function cancelRelationDialog(): Promise<void> {
  const relations = relationView.value
  const draft = relationDraft.value
  if (relations && draft) await databaseCatalogRelationCancelDraft(relations, draft)
  relationDraft.value = undefined
}

async function saveRelationDialog(): Promise<void> {
  await act(async () => {
    const ds = dataSet.value
    const relations = relationView.value
    const ctx = selectedTableContext.value
    const draft = relationDraft.value
    if (!ds || !relations || !ctx || !draft) return
    await databaseCatalogRelationSaveDraft({dataSet: ds, view: relations, draft, refreshTableId: ctx.tableId})
    relationDraft.value = undefined
  }, '表关系已保存')
}

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

async function loadUnregisteredNames(): Promise<void> {
  await act(async () => {
    const server = serverView.value
    if (!server) return
    const id = databaseCatalogServerSelectedId(server)
    if (!id) throw new Error('请先选择服务器')
    const ds = dataSet.value
    if (!ds) return
    const names = await databaseCatalogQueryUnregisteredDbNames(ds, id)
    unregisteredHint.value = names.length
      ? `未登记物理库（可填到「Name」）：${names.join('、')}`
      : '该服务器下没有未登记的物理库名'
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
  if (!fields) return
  await fields.refresh()
  if (fields.loadingError) throw fields.loadingError
}

async function chooseDatabase(row: DataRow): Promise<void> {
  if (busy.value || dbEdit.value) return
  const view = dbView.value
  const original = toRaw(row)
  if (!view?.rows.includes(original)) return
  view.setSelectedRows([original])
  tableView.value?.setSelectedRows([])
  viewView.value?.setSelectedRows([])
  revision.value++
  const ds = dataSet.value
  const server = serverView.value
  if (ds && server) databaseCatalogSyncCommandInput(ds, server, view)
  try {
    await refreshChildren()
    await refreshFields()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  }
}

function chooseApplication(row: DataRow): void {
  if (busy.value) return
  const apps = appSystemView.value
  const original = toRaw(row)
  if (apps?.rows.includes(original)) apps.setSelectedRows([original])
  revision.value++
}

function chooseRelation(row: DataRow): void {
  if (busy.value || relationDraft.value) return
  const view = relationView.value
  const original = toRaw(row)
  if (view?.rows.includes(original)) view.setSelectedRows([original])
  revision.value++
}

async function chooseTable(row: DataRow): Promise<void> {
  const view = tableView.value
  const original = toRaw(row)
  if (!view?.rows.includes(original)) return
  viewView.value?.setSelectedRows([])
  view.setSelectedRows([original])
  revision.value++
  try {
    await refreshFields()
    if (tableDesignOpen.value) await refreshTableRelations()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  }
}

async function chooseView(row: DataRow): Promise<void> {
  const view = viewView.value
  const original = toRaw(row)
  if (!view?.rows.includes(original)) return
  tableView.value?.setSelectedRows([])
  view.setSelectedRows([original])
  revision.value++
  try {
    await refreshFields()
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  }
}

function release(): void {
  actionGeneration++
  busy.value = false; actionError.value = ''; message.value = ''; unregisteredHint.value = ''; unregisteredTableHint.value = ''
  unsubscribe?.()
  unsubscribe = undefined
  sparkRemove(PAGE_RUNTIME)
  runtime?.dispose()
  runtime = undefined
  dbEdit.value = undefined
  tableEdit.value = undefined
  tableDesignOpen.value = false
  relationDraft.value = undefined
  viewDesignOpen.value = false
  objectRegisterOpen.value = false
  copyTableOpen.value = false
  deleteTarget.value = undefined
  unregisteredTableHint.value = ''
  serverView.value = undefined
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

watch(tableDesignOpen, open => {
  if (!open) return
  void act(async () => refreshTableRelations())
})

watch([scenarioId, catalogHubCatalogBlocked], async ([id]) => {
  const own = ++generation
  ready.value = false
  loading.value = true
  error.value = ''
  release()
  try {
    if (catalogHubCatalogBlocked.value) return
    if (!id) {
      if (catalogAwaitingHubResolve.value) return
      if (catalogHubResolveFailed.value) return
      throw new Error('表和视图管理入口缺少导航绑定的数据空间ID')
    }
    const ds = await LowcodeDatabaseTableView.loadCatalog(id, catalogLoadOptions.value)
    if (!active || own !== generation) {ds.destroy(); return}
    const server = ds.getView(DATABASE_CATALOG_SERVER_MODEL, 'default')
    const db = ds.getView(DATABASE_CATALOG_DB_MODEL, 'default')
    const tables = ds.getView(DATABASE_CATALOG_TABLE_MODEL, 'default')
    const views = ds.getView(DATABASE_CATALOG_VIEW_MODEL, 'default')
    const tableFields = ds.getView(DATABASE_CATALOG_FIELD_MODEL, DATABASE_CATALOG_FIELD_TABLE_VIEW)
    const viewFields = ds.getView(DATABASE_CATALOG_FIELD_MODEL, DATABASE_CATALOG_FIELD_VIEW_VIEW)
    if (!server || !db || !tables || !views || !tableFields || !viewFields) throw new Error('表和视图目录缺少正式视图')
    dataSet.value = ds
    serverView.value = server
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
    databaseCatalogEnsureImplicitServer(server)
    databaseCatalogSyncCommandInput(ds, server)
    const formKey = ds.scenarioId ?? id
    const current = new PageRuntime({pageId: 'table-and-view-page', scenarioIds: [formKey], loadScenario: async () => ds})
    runtime = current
    await current.load()
    if (!active || own !== generation) {current.dispose(); return}
    unsubscribe = ds.onAnyViewChange({
      rowsChanged: () => revision.value++,
      selectedRowsChanged: () => revision.value++,
      requestStateChanged: () => revision.value++,
      editingChanged: () => revision.value++,
    })
    sparkProvide(PAGE_RUNTIME, current)
    ready.value = true
  } catch (cause) {
    if (active && own === generation) {
      error.value = cause instanceof Error ? cause.message : String(cause)
      release()
    }
  } finally {
    if (active && own === generation) {
      loading.value = catalogHubCatalogBlocked.value
        ? false
        : catalogAwaitingHubResolve.value && !id
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
