<!--
@module app:views/features/workflow/flow-model/ui/flow-model-list-page
职责：流程模型目录查询、分页、新建编辑删除与设计入口。
边界：列表与选项绑定 87F0 正式 DataView；设计对话框消费 6E462 设计场景。
-->
<template>
  <RendererSection class="flow-model-page" title="流程模型列表" :bordered="false" :grid-columns="1" :grid-gap="16"
    :status="loading ? '正在读取流程模型…' : ''" :error="error || listError" :retryable="!loading && !ready" @retry="loadCurrentRoute">
    <template v-if="ready" #header-actions>
      <RendererButton label="新建" button-type="primary" icon="Plus" :disabled="directoryLocked || !manager?.canAdd()" @click="beginAdd" />
      <RendererButton :data-view-key="viewKey" label="刷新" action="refresh" :disabled="directoryLocked" />
    </template>
    <DisplayAlert v-if="createUserWarning" alert-type="warning" :closable="false" :show-icon="true" :title="createUserWarning" />
    <RendererTable v-if="ready" :data-view-key="viewKey" :children="columns" :filter="filter" :actions="actions"
      :stripe="true" :show-row-index="true" :show-data-view-meta="false"
      :pagination="{pageSizes: [10, 15, 20, 50], showJumper: true}" />
    <RendererDialog v-if="editing" :model-value="true" :data-view-key="viewKey" :title="editing === 'add' ? '新增流程' : '编辑流程'"
      :width="680" :close-disabled="busy || hasUnconfirmedSave()" @update:model-value="cancelEdit">
      <RendererForm :data-view-key="viewKey" context-data-member="currentRow" label-width="88px" :grid-columns="1" :show-data-view-meta="false">
        <FieldSelect v-if="editing === 'add'" field="sysid" label="应用系统" :option-data-view-key="appKey"
          option-value-field="rowid" option-label-field="AppDesc" :filterable="true" clearable />
        <FieldText field="TITLE" label="流程名称" />
        <FieldTextarea field="MEMO" label="备注" :autosize="{minRows: 4}" />
      </RendererForm>
      <template #footer>
        <RendererButton label="取消" :disabled="busy || hasUnconfirmedSave()" @click="cancelEdit" />
        <RendererButton label="保存" button-type="primary" :disabled="busy" @click="saveEdit" />
      </template>
    </RendererDialog>
    <RendererDialog v-if="design" :model-value="true" title="流程设计" width="94vw" top="3vh" :append-to-body="true"
      :destroy-on-close="true" :close-disabled="designDirty || designReadback" @update:model-value="closeDesign">
      <FlowDesignPage :flow-model-id="design.id" :assert-open="design.assertCurrent"
        :after-save="design.refreshDirectory" @close-blocked="design.setDirty" />
    </RendererDialog>
  </RendererSection>
</template>

<script setup lang="ts">
import {computed, defineAsyncComponent, onBeforeUnmount, ref, shallowRef, toRaw, watch} from 'vue'
import {buildDataViewKey, type DataRow, type SparkNode} from '@spark-appworks/spark-data'
import {PageTool} from '@spark-appworks/spark-project-model'
import * as SparkComponent from '@spark-appworks/spark-component'
import type {RFilterProps, RToolbarProps} from '@spark-appworks/spark-component'

const {DisplayAlert, FieldSelect, FieldText, FieldTextarea, RendererButton, RendererDialog, RendererForm, RendererSection, RendererTable,
  consumeRequiredPageService, useSparkComponent} = SparkComponent
import {FLOW_DESIGN_SCENARIO_ID, WorkflowFlowModelManager} from '@/platform-adapters/resources/system/workflow/manage'
import {useFeaturePageRuntime} from '@/views/features/shared/runtime/use-feature-page-runtime'
import rule from '../design/ui/tool/rule.json?raw'
import script from '../design/ui/tool/script.js?raw'
import style from '../design/ui/tool/style.css?raw'

const FlowDesignPage = defineAsyncComponent(() => import('../design/ui/flow-design-page.vue'))
const scenarioId = '87F0EF6AD1B64D67FFE597E7E3285994'
const modelName = 'WFM_FLOW_MODLE'
const {sparkConsume} = useSparkComponent({type: 'flow-model-list-page'})
const pageService = consumeRequiredPageService(sparkConsume, 'flow-model-list-page')
type DesignOpening = Readonly<{
  id: string
  assertCurrent: () => void
  setDirty: (value: boolean) => void
  refreshDirectory: () => Promise<void>
}>
const design = shallowRef<DesignOpening>(), designDirty = ref(false), designReadback = ref(false)
const {viewKey, session, ready, loading, error, loadCurrentRoute} = useFeaturePageRuntime({
  scenarioId, modelName, componentType: 'flow-model-list-page', title: '流程模型列表',
  tool: pageId => {
    const tool = new PageTool({pageId})
    tool.hydrateFileText('rule.json', rule)
    tool.hydrateFileText('script.js', script)
    tool.hydrateFileText('style.css', style)
    tool.markLoaded()
    return tool
  },
  preserveRuntime: () => designDirty.value || designReadback.value,
  optionViews: [buildDataViewKey('Base_AppSystemList', 'default', FLOW_DESIGN_SCENARIO_ID)],
  peerScenarioIds: [FLOW_DESIGN_SCENARIO_ID],
})
const appKey = buildDataViewKey('Base_AppSystemList', 'default', FLOW_DESIGN_SCENARIO_ID)
const userKey = buildDataViewKey('Base_UserInfo', 'default', scenarioId)
const manager = shallowRef<WorkflowFlowModelManager>()
const busy = ref(false), listError = ref(''), createUserWarning = ref('')
const editing = ref<'add' | 'edit' | null>(null)
const directoryLocked = computed(() => busy.value || !!editing.value || !!design.value)
let generation = 0

const columns: SparkNode[] = [
  {type: 'r-select', props: {field: 'sysid', label: '应用系统', readonly: true, minWidth: 160, sortable: false, optionDataViewKey: appKey, optionValueField: 'rowid', optionLabelField: 'AppDesc'}},
  {type: 'r-text', props: {field: 'TITLE', label: '流程名称', readonly: true, minWidth: 220, showOverflowTooltip: true}},
  {type: 'r-select', props: {field: 'createuser', label: '创建人', readonly: true, minWidth: 120, showOverflowTooltip: true,
    optionDataViewKey: userKey, optionValueField: 'rowid', optionLabelField: 'UserName'}},
  {type: 'r-text', props: {field: 'CRTDATE', label: '创建时间', readonly: true, minWidth: 170, showOverflowTooltip: true}},
  {type: 'r-text', props: {field: 'MEMO', label: '备注', readonly: true, minWidth: 240, showOverflowTooltip: true}},
]
const filter: RFilterProps = {
  autoQuery: false, queryOnReset: true, firstPageOnSearch: true, showExpressionEditor: false, showDataViewMeta: false,
  children: [
    {type: 'r-select', props: {field: 'sysid', label: '应用系统', placeholder: '应用系统', clearable: true, filterable: true, optionDataViewKey: appKey, optionValueField: 'rowid', optionLabelField: 'AppDesc'}},
    {type: 'r-text', props: {field: 'TITLE', label: '流程名称', placeholder: '流程名称', filterTrim: true}},
  ],
}

const actions = computed<RToolbarProps>(() => ({children: [
  {type: 'r-button', props: {label: '编辑', disabled: directoryLocked.value, onClick: (row: DataRow) => beginEdit(row)}},
  {type: 'r-button', props: {label: '删除', buttonType: 'danger', disabled: directoryLocked.value, onClick: (row: DataRow) => removeRow(row)}},
  {type: 'r-button', props: {label: '设计', disabled: directoryLocked.value, onClick: (row: DataRow) => openDesign(row)}},
  {type: 'r-button', props: {label: '复制模型KEY', disabled: busy.value, onClick: (row: DataRow) => copyKey(row)}},
  {type: 'r-button', props: {label: '复制workFormId', disabled: busy.value, onClick: (row: DataRow) => copyWorkForm(row)}},
]}))

function listView() {
  const view = session.runtime?.resolveView(viewKey.value)
  if (!view) throw new Error('流程模型列表尚未就绪')
  return view
}

async function bindManager(): Promise<void> {
  const own = ++generation
  if (!ready.value) {
    closeDesign(false)
    manager.value = undefined
    return
  }
  try {
    const view = listView()
    const userView = session.runtime?.resolveView(userKey)
    const next = new WorkflowFlowModelManager(view, {
      ...(userView ? {userView} : {}),
      assertCurrent: () => {if (own !== generation || session.runtime?.resolveView(viewKey.value) !== view) throw Error('原流程模型目录已失效')},
    })
    const result = await next.refresh()
    if (own !== generation) return
    manager.value = next
    setCreateUserWarning(result.unresolvedCreateUserIds)
    listError.value = ''
  } catch (cause) {
    if (own === generation) listError.value = cause instanceof Error ? cause.message : String(cause)
  }
}

watch([ready, viewKey], () => { void bindManager() }, {immediate: true})
onBeforeUnmount(() => { generation++ })

function setCreateUserWarning(ids: readonly string[]): void {
  createUserWarning.value = ids.length ? `部分历史创建人无法映射：${ids.join('、')}` : ''
}

async function beginAdd(): Promise<void> {
  try {
    if (!manager.value) throw new Error('流程模型目录尚未就绪')
    await manager.value.beginAdd(); editing.value = 'add'; listError.value = ''
  } catch (cause) { listError.value = String(cause) }
}
function beginEdit(row: DataRow): void {
  try { manager.value?.beginEdit(row); editing.value = 'edit' } catch (cause) { listError.value = String(cause) }
}
function cancelEdit(): void {
  const view = listView()
  if (busy.value || view.hasUnconfirmedSave) {listError.value = '保存结果尚待核实，请先核实原次保存结果'; return}
  view.discardPendingChanges()
  view.setCurrentRow(null)
  editing.value = null
}
function hasUnconfirmedSave(): boolean {return session.runtime?.resolveView(viewKey.value)?.hasUnconfirmedSave === true}
async function saveEdit(): Promise<void> {
  busy.value = true
  try { await manager.value?.saveCurrent(); editing.value = null } catch (cause) { listError.value = String(cause) }
  finally { busy.value = false }
}
async function removeRow(row: DataRow): Promise<void> {
  const ok = await pageService.showConfirm('确认删除该流程模型？', '删除流程模型')
  if (!ok) return
  busy.value = true
  try { await manager.value?.removeRow(row) } catch (cause) { listError.value = String(cause) }
  finally { busy.value = false }
}
function openDesign(row: DataRow): void {
  if (directoryLocked.value) return
  const owner = manager.value, runtime = session.runtime, original = toRaw(row)
  try {
    if (!owner || !runtime) throw Error('流程模型目录尚未就绪')
    const view = listView(), id = view.getPkKey(original)
    if (typeof id !== 'string' || !id.trim()) throw Error('流程模型缺少 rowid')
    view.captureReadRow(original, [view.primaryKey])()
    const isCurrent = () => design.value === opened && session.isCurrent(runtime)
      && runtime.resolveView(viewKey.value) === view && manager.value === owner
    const opened: DesignOpening = {
      id,
      assertCurrent: () => { if (!isCurrent()) throw Error('原流程设计入口已失效') },
      setDirty: value => { if (isCurrent()) designDirty.value = value },
      async refreshDirectory() {
        if (!isCurrent() || designReadback.value || hasUnconfirmedSave()) return
        designReadback.value = true
        try {
          const result = await owner.refresh()
          if (isCurrent()) setCreateUserWarning(result.unresolvedCreateUserIds)
        } catch (cause) {
          if (isCurrent()) listError.value = `流程设计已确认保存，目录重新读取失败：${cause instanceof Error ? cause.message : String(cause)}`
        } finally { if (isCurrent()) designReadback.value = false }
      },
    }
    design.value = opened
    listError.value = ''
  } catch (cause) {
    listError.value = cause instanceof Error ? cause.message : String(cause)
  }
}
function closeDesign(open: boolean): void {
  if (open || designDirty.value || designReadback.value) return
  design.value = undefined
}
async function copyKey(row: DataRow): Promise<void> {
  const text = manager.value?.readModelKey(row) ?? ''
  if (!text) return
  await pageService.copyText(text)
  pageService.showMessage('已复制流程模型 KEY', 'success')
}
async function copyWorkForm(row: DataRow): Promise<void> {
  const text = manager.value?.readWorkFormId(row)
  if (!text) { pageService.showMessage('该记录无 workFormId', 'info'); return }
  await pageService.copyText(text)
  pageService.showMessage('已复制 workFormId', 'success')
}
</script>

<style scoped>
.flow-model-page {padding: 8px}
</style>
