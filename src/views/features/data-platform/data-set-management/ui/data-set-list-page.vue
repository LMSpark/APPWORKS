<template>
  <RendererSection class="data-space-catalog" title="数据空间管理" :bordered="false" :grid-columns="1" :grid-gap="16"
    :status="loading ? '正在读取数据空间目录…' : ''" :error="error || listError || (!editing && !bindingsOpen && !deleteOpen ? actionError : '')">
    <template v-if="ready" #header-actions>
      <RendererButton label="新增" button-type="primary" icon="Plus" :disabled="busy || !owner?.canCreate()" @click="beginCreate" />
      <RendererButton label="编辑" icon="Edit" :disabled="busy || !owner?.canEdit()" @click="beginEdit" />
      <RendererButton label="删除" button-type="danger" icon="Delete" :disabled="busy || !owner?.canDelete()" @click="openDelete" />
    </template>
    <template v-if="ready">
      <DisplayAlert v-if="appsError" alert-type="error" :closable="false" :show-icon="true" :title="appsError" />
      <RendererButton v-if="appsError" label="重试应用选项" @click="retryApps" />
      <DisplayAlert v-if="unresolved" alert-type="warning" :closable="false" :show-icon="true"
        :title="`部分历史创建人不在当前用户资源中（${unresolved} 位）`" />
      <div :inert="busy || !!editing || bindingsOpen || deleteOpen || !!designId">
        <RendererTable :data-view-key="catalogKey" :children="fields" :filter="filter" :actions="actions" :stripe="true" :border="true"
          :on-row-click="choose" :highlight-current-row="true" :show-data-view-meta="false" :action-column="{label: '操作', width: 260, fixed: true}" />
      </div>
      <RendererDialog v-if="editing" :model-value="true" :data-view-key="catalogKey"
        :title="editing.mode === 'add' ? '新增数据空间' : '编辑数据空间'" :width="520" :close-disabled="true">
        <DisplayAlert v-if="actionError" alert-type="error" :closable="false" :title="actionError" />
        <DisplayAlert v-if="editing.unconfirmed" alert-type="warning" :closable="false" title="保存结果尚未确认。核验只确认原提交结果，不会再次写入。" />
        <DisplayAlert v-else-if="editing.readbackFailed" alert-type="warning" :closable="false" title="已保存，但目录尚未重新读取成功，请重新读取。" />
        <RendererForm :data-view-key="catalogKey" context-data-member="currentRow" :auto-columns="false" label-width="80px"
          :show-data-view-meta="false" :grid-columns="1" :form-props="{disabled: busy || editing.unconfirmed || editing.readbackFailed}">
          <FieldSelect field="sysid" label="应用系统" placeholder="请选择所属应用" :option-data-view-key="appsKey" :filterable="true"
            option-value-field="rowid" option-label-field="AppDesc" :option-label-fields="['AppDesc', 'AppName']"
            :readonly="editing.mode !== 'add'" :disabled="owner?.apps.requestState !== RequestState.Loaded" />
          <FieldText field="Name" label="名称" placeholder="请输入名称" :maxlength="100" />
          <FieldTextarea field="description" label="描述" placeholder="请输入描述" :maxlength="500" :autosize="{minRows: 4}" :show-word-limit="true" />
        </RendererForm>
        <template #footer>
          <RendererButton v-if="!editing.unconfirmed" label="取消" :disabled="busy" @click="cancelEdit" />
          <RendererButton v-if="!editing.unconfirmed && !editing.readbackFailed" label="确定" :disabled="busy" @click="saveEdit" />
          <RendererButton v-if="editing.unconfirmed" label="核验保存结果" :disabled="busy" @click="saveEdit" />
          <RendererButton v-if="editing.readbackFailed" label="重新读取" :disabled="busy" @click="saveEdit" />
        </template>
      </RendererDialog>
      <RendererDialog v-if="deleteOpen" :model-value="true" title="删除确认" :width="420" :close-disabled="busy" @update:model-value="closeDelete">
        <DisplayAlert alert-type="warning" :closable="false" :show-icon="true" :title="`确认删除“${deleteName}”吗？`" />
        <DisplayAlert v-if="actionError" alert-type="error" :closable="false" :title="actionError" />
        <template #footer>
          <RendererButton label="取消" :disabled="busy" @click="closeDelete" />
          <RendererButton label="删除" button-type="danger" :disabled="busy" @click="confirmDelete" />
        </template>
      </RendererDialog>
      <RendererDialog v-if="designId" :model-value="true" title="数据集设计" width="92vw" top="4vh" :append-to-body="true"
        :destroy-on-close="true" :close-disabled="designPending" @update:model-value="closeDesign">
        <DataSetDesign ref="designPage" :target-id="designId" />
      </RendererDialog>
      <RendererDialog v-if="bindingsOpen" :model-value="true" title="数据空间影响范围" :width="820" :close-disabled="true">
        <DisplayAlert v-if="busy" alert-type="info" :closable="false" title="正在查询绑定…" />
        <DisplayAlert v-if="actionError" alert-type="error" :closable="false" :title="actionError" />
        <DisplayEmpty v-else-if="bindingsReady && bindingsEmpty" description="当前应用暂无蓝图节点绑定" />
        <RendererTable v-else-if="bindingsReady && bindingsKey" :data-view-key="bindingsKey" :children="bindingFields" :border="true"
          :show-data-view-meta="false" />
        <template #footer>
          <RendererButton label="关闭" @click="closeBindings" />
        </template>
      </RendererDialog>
    </template>
  </RendererSection>
</template>

<script setup lang="ts">
import {computed, defineAsyncComponent, onBeforeUnmount, ref, shallowRef, toRaw, watch} from 'vue'
import {useRoute} from 'vue-router'
import {buildDataViewKey, RequestState, type DataRow, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import {NativePageRuntimeSession} from '@spark-appworks/spark-app'
import * as SparkComponent from '@spark-appworks/spark-component'
import {LowcodeDataSpaceCatalog} from '@/lowcode/data-space/lowcode-data-space-catalog'
import {parseApplicationPathScope} from '@/services/application-scope'

type RFilterProps = SparkComponent.RFilterProps
type RToolbarProps = SparkComponent.RToolbarProps
const DATA_SET_TYPE_LABELS: Readonly<Record<string, string>> = {datasource: '数据源', workflow: '工作流', form: '表单'}
const {PAGE_RUNTIME, RendererSection, RendererTable, RendererButton, RendererDialog, RendererForm, FieldText, FieldTextarea, FieldSelect,
  DisplayAlert, DisplayEmpty, useSparkComponent, consumeRequiredPageService} = SparkComponent
const {sparkConsume} = SparkComponent.useSparkComponent({type: 'data-set-list-page'})
const pageService = consumeRequiredPageService(sparkConsume, 'data-set-list-page')

const DataSetDesign = defineAsyncComponent(() => import('../design/ui/data-set-design-page.vue'))
const route = useRoute()
const deleteOpen = ref(false), deleteName = ref(''), designId = ref('')
const deleteTarget = shallowRef<DataRow>()
const designPage = ref<{hasPending: boolean} | null>(null)
/** 设计页有未保存修改或在途操作时禁止关闭对话框，避免卸载时静默丢弃草稿。 */
const designPending = computed(() => designPage.value?.hasPending === true)
const {sparkProvide, sparkRemove} = useSparkComponent({type: 'data-set-list-page'})
const session = new NativePageRuntimeSession({
  provide: current => sparkProvide(PAGE_RUNTIME, current),
  remove: () => sparkRemove(PAGE_RUNTIME),
})
const owner = shallowRef<LowcodeDataSpaceCatalog>(), ready = ref(false), loading = ref(false), error = ref(''), revision = ref(0)
const busy = ref(false), actionError = ref(''), bindingsOpen = ref(false), bindingsReady = ref(false)
let unsubscribe: (() => void) | undefined, generation = 0, active = true, actionGeneration = 0
const scenarioId = computed(() => typeof route.meta['blueprintScenarioId'] === 'string' ? route.meta['blueprintScenarioId'] : '')
const projectId = computed(() => parseApplicationPathScope(route.path)?.projectId ?? '')
const catalogKey = computed(() => buildDataViewKey('Base_DataSet', 'catalog', scenarioId.value))
const appsKey = computed(() => {revision.value; const apps = owner.value?.appCatalog.scenarioId
  return apps ? buildDataViewKey('Base_AppSystemList', 'catalogApps', apps) : ''})
const listError = computed(() => {revision.value; return owner.value?.view.loadingError?.message ?? ''})
const appsError = computed(() => {revision.value; return owner.value?.apps.loadingError?.message ?? ''})
const unresolved = computed(() => {revision.value; return owner.value?.unresolvedCreatorCount ?? 0})
const editing = computed(() => {revision.value; return owner.value?.editing})
const bindingsKey = computed(() => {revision.value; const view = owner.value?.bindings
  return view ? buildDataViewKey('Base_NavigationInfo', view.viewId, scenarioId.value) : ''})
const bindingsEmpty = computed(() => {revision.value; return owner.value?.bindings?.rows.length === 0})
const bindingFields: SparkNode[] = [
  {type: 'r-text', props: {field: 'rowid', label: '功能路径', readonly: true, minWidth: 220,
    displayFormatter: (value: unknown) => owner.value?.bindingPath(value) ?? ''}},
  {type: 'r-text', props: {field: 'rowid', label: '蓝图节点 ID', readonly: true, minWidth: 240, showOverflowTooltip: true}},
  {type: 'r-text', props: {field: 'NavigationUrl', label: '导航地址', readonly: true, minWidth: 220, showOverflowTooltip: true}},
]
const actions = computed<RToolbarProps>(() => {
  revision.value
  return {children: [{label: '设计', run: design}, {label: '复制API', run: copyApi}, {label: '查询绑定', run: queryBindings}]
    .map(action => ({type: 'r-button', props: {label: action.label,
      onBeforeRender: ({row, dataSource}: {row?: DataRow | null; dataSource?: DataView | null}) => {
        const catalog = owner.value
        // 标准行上下文是渲染镜像；按绑定视图主键定位原行，再由原查询核身份和读取权限。
        const original = row && dataSource && toRaw(dataSource) === catalog?.view
          ? catalog.view.rows.find(item => catalog.view.getPkKey(item) === dataSource.getPkKey(row)) : undefined
        const allowed = () => owner.value === catalog && !busy.value && !editing.value && !bindingsOpen.value && !designId.value
          && !!original && !!catalog?.designTarget(original)
        return {disabled: !allowed(), onClick: async () => {if (original && allowed()) {choose(original); await action.run()}}}
      },
    }}))}
})
const fields = computed<SparkNode[]>(() => {
  revision.value
  return [
    {type: 'r-text', props: {field: 'sysid', label: '应用系统', minWidth: 200, readonly: true, showOverflowTooltip: true,
      displayFormatter: (value: unknown) => owner.value?.applicationLabel(value) ?? ''}},
    {type: 'r-text', props: {field: 'Name', label: '名称', minWidth: 220, readonly: true, showOverflowTooltip: true}},
    {type: 'r-text', props: {field: 'Type', label: '类型', width: 120, readonly: true,
      displayFormatter: (value: unknown) => typeof value === 'string'
        ? DATA_SET_TYPE_LABELS[value] ?? value : ''}},
    {type: 'r-text', props: {field: 'description', label: '描述', minWidth: 320, readonly: true, showOverflowTooltip: true}},
    {type: 'r-text', props: {field: 'createuser', label: '创建人', width: 140, readonly: true, showOverflowTooltip: true,
      displayFormatter: (value: unknown) => owner.value?.creatorLabel(value) ?? ''}},
    {type: 'r-text', props: {field: 'createtime', label: '创建时间', width: 180, readonly: true}},
  ]
})
const filter = computed<RFilterProps>(() => {
  revision.value
  return {autoQuery: false, autoFitMinWidth: '240px', children: [
    {type: 'r-select', props: {field: 'sysid', label: '应用系统', placeholder: '请选择应用系统', clearable: true, filterable: true,
      optionDataViewKey: appsKey.value, optionValueField: 'rowid', optionLabelField: 'AppDesc', optionLabelFields: ['AppDesc', 'AppName'],
      disabled: owner.value?.apps.requestState !== RequestState.Loaded}},
    {type: 'r-text', props: {field: 'Name', label: '名称', placeholder: '请输入名称/id', clearable: true,
      filterAlternatives: [{field: 'Name', operator: 'contains'}, {field: 'rowid', operator: 'eq'}]}},
  ]}
})
function choose(row: DataRow): void {
  if (busy.value || editing.value || bindingsOpen.value || designId.value) return
  const current = owner.value
  const original = toRaw(row)
  if (current?.isCurrent() && current.view.rows.includes(original)) current.view.setSelectedRows([original])
}
async function act(operation: (catalog: LowcodeDataSpaceCatalog) => void | Promise<void>, success = ''): Promise<void> {
  const catalog = owner.value
  if (!catalog || busy.value) return
  const action = ++actionGeneration
  const current = () => owner.value === catalog && action === actionGeneration
  busy.value = true; actionError.value = ''
  try {await operation(catalog); if (current() && success) pageService.showMessage(success, 'success')}
  catch (cause) {if (current()) actionError.value = cause instanceof Error ? cause.message : String(cause)}
  finally {if (current()) {busy.value = false; revision.value++}}
}
async function beginCreate(): Promise<void> {await act(catalog => catalog.beginCreate())}
async function beginEdit(): Promise<void> {await act(catalog => catalog.beginEdit())}
async function cancelEdit(): Promise<void> {await act(catalog => catalog.cancelEdit())}
async function saveEdit(): Promise<void> {await act(catalog => catalog.saveEdit(), editing.value?.mode === 'add' ? '新增成功' : '编辑成功')}
function openDelete(): void {
  const catalog = owner.value
  if (!catalog?.canDelete()) return
  const row = catalog.view.selectedRows[0]
  if (!row || !catalog.view.rows.includes(row)) return
  deleteTarget.value = row
  deleteName.value = typeof row?.['Name'] === 'string' ? row['Name'] : ''
  actionError.value = ''; deleteOpen.value = true
}
function closeDelete(): void {
  if (busy.value) return
  deleteOpen.value = false; deleteTarget.value = undefined; actionError.value = ''
}
async function confirmDelete(): Promise<void> {
  const target = deleteTarget.value
  if (!target) {actionError.value = '删除目标已变化'; return}
  await act(catalog => catalog.deleteSelected(target), '删除成功')
  if (!actionError.value) closeDelete()
}
async function copyApi(): Promise<void> {
  await act(async catalog => {
    const content = await catalog.readApiInfo()
    if (owner.value !== catalog) return
    if (!navigator.clipboard?.writeText) throw new Error('当前环境不支持剪贴板写入')
    await navigator.clipboard.writeText(content)
  }, 'API信息已复制到剪贴板')
}
async function queryBindings(): Promise<void> {
  bindingsOpen.value = true; bindingsReady.value = false
  await act(async catalog => {await catalog.queryBindings(); if (owner.value === catalog && bindingsOpen.value) bindingsReady.value = true})
}
function closeBindings(): void {
  actionGeneration++; busy.value = false; bindingsOpen.value = false; bindingsReady.value = false
  owner.value?.closeBindings(); actionError.value = ''
}
function design(): void {
  if (busy.value || editing.value || bindingsOpen.value || designId.value) return
  const target = owner.value?.designTarget()
  if (target) designId.value = target
}
function closeDesign(): void {
  if (designPending.value) return
  designId.value = ''
  void owner.value?.view.refresh()
}
async function retryApps(): Promise<void> {await owner.value?.apps.refresh()}
function release(): void {
  actionGeneration++
  bindingsOpen.value = false; bindingsReady.value = false; busy.value = false; actionError.value = ''
  unsubscribe?.(); unsubscribe = undefined
  session.dispose()
  owner.value?.dispose(); owner.value = undefined
}
watch([scenarioId, projectId], async ([scenario, project]) => {
  const own = ++generation
  ready.value = false; loading.value = true; error.value = ''; release()
  try {
    if (!scenario) throw new Error('数据空间目录缺少正式蓝图场景')
    if (!project) throw new Error('数据空间目录缺少所属应用')
    const catalog = await LowcodeDataSpaceCatalog.load({scenarioId: scenario, projectId: project})
    if (!active || own !== generation) {catalog.dispose(); return}
    owner.value = catalog
    const appScenario = catalog.appCatalog.scenarioId
    if (!appScenario) throw new Error('应用目录缺少正式场景身份')
    const current = session.acquire({pageId: 'data-set-list-page', scenarioIds: [scenario, appScenario], mainScenarioId: scenario,
      targetId: `${project}:${scenario}`, loadScenario: async id => id === scenario ? catalog.dataSet : catalog.appCatalog})
    await current.load()
    if (!active || own !== generation || !session.isCurrent(current)) return
    const changed = {rowsChanged: () => revision.value++, selectedRowsChanged: () => revision.value++,
      requestStateChanged: () => revision.value++, configChanged: () => revision.value++, editingChanged: () => revision.value++}
    const offs = [catalog.dataSet.onAnyViewChange(changed), catalog.appCatalog.onAnyViewChange(changed)]
    unsubscribe = () => {for (const off of offs) off()}
    // 首次查询先完成，再挂接容器，避免autoLoad与目录初始化并发发起同一请求。
    await catalog.initialize()
    if (active && own === generation && session.isCurrent(current)) ready.value = true
  } catch (cause) {if (active && own === generation) {error.value = cause instanceof Error ? cause.message : String(cause); release()}}
  finally {if (active && own === generation) loading.value = false}
}, {immediate: true})
onBeforeUnmount(() => {active = false; generation++; release()})
</script>

<style scoped>
.data-space-catalog {padding: 8px}
</style>
