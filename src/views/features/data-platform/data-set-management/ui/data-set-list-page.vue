<template>
  <section class="data-space-catalog">
    <header><h1>数据空间管理</h1><p>选择数据空间，进入设计。</p></header>
    <p v-if="loading" role="status">正在读取数据空间目录…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="message" role="status">{{ message }}</p>
    <template v-if="ready">
      <p v-if="listError" role="alert">{{ listError }}</p>
      <p v-if="appsError" role="alert">{{ appsError }} <RendererButton label="重试应用选项" @click="retryApps" /></p>
      <p v-if="unresolved" role="status">有 {{ unresolved }} 位创建人当前无法解析</p>
      <div :inert="busy || !!editing || bindingsOpen || deleteOpen || !!designId">
        <RendererTable :data-view-key="catalogKey" :children="fields" :filter="filter" :toolbar="toolbar" :actions="actions" :stripe="true"
          :on-row-click="choose" :highlight-current-row="true" />
      </div>
      <RendererDialog v-if="editing" :model-value="true" :data-view-key="catalogKey"
        :title="editing.mode === 'add' ? '新增数据空间' : '编辑数据空间'" :width="520" :close-disabled="true">
        <p v-if="actionError" role="alert">{{ actionError }}</p>
        <p v-if="editing.unconfirmed" role="status">保存结果尚未确认。核验只确认原提交结果，不会再次写入。</p>
        <p v-else-if="editing.readbackFailed" role="status">已保存，但目录尚未重新读取成功，请重新读取。</p>
        <RendererForm :data-view-key="catalogKey" context-data-member="currentRow" :auto-columns="false"
          :show-data-view-meta="false" :grid-columns="1" :form-props="{disabled: busy || editing.unconfirmed || editing.readbackFailed}">
          <FieldSelect v-if="editing.mode === 'add'" field="sysid" label="所属应用" :option-data-view-key="appsKey"
            option-value-field="rowid" option-label-field="AppDesc" :option-label-fields="['AppDesc', 'AppName']"
            :disabled="owner?.apps.requestState !== RequestState.Loaded" />
          <FieldText field="Name" label="名称" :maxlength="100" />
          <FieldTextarea field="description" label="描述" :maxlength="500" />
        </RendererForm>
        <template #footer>
          <RendererButton v-if="!editing.unconfirmed" label="取消" :disabled="busy" @click="cancelEdit" />
          <RendererButton v-if="!editing.unconfirmed && !editing.readbackFailed" label="确定" :disabled="busy" @click="saveEdit" />
          <RendererButton v-if="editing.unconfirmed" label="核验保存结果" :disabled="busy" @click="saveEdit" />
          <RendererButton v-if="editing.readbackFailed" label="重新读取" :disabled="busy" @click="saveEdit" />
        </template>
      </RendererDialog>
      <RendererDialog v-if="deleteOpen" :model-value="true" title="删除确认" :width="420" :close-disabled="busy" @update:model-value="deleteOpen = false">
        <p>确认删除数据空间“{{ deleteName }}”吗？仅删除空间记录；空间下仍有模型时不能删除。</p>
        <p v-if="actionError" role="alert">{{ actionError }}</p>
        <template #footer>
          <RendererButton label="取消" :disabled="busy" @click="deleteOpen = false" />
          <RendererButton label="删除" :disabled="busy" @click="confirmDelete" />
        </template>
      </RendererDialog>
      <RendererDialog v-if="designId" :model-value="true" title="数据集设计" width="92vw" top="4vh" :append-to-body="true"
        :destroy-on-close="true" :close-disabled="designPending" @update:model-value="closeDesign">
        <DataSetDesign ref="designPage" :target-id="designId" />
      </RendererDialog>
      <RendererDialog v-if="bindingsOpen" :model-value="true" title="数据空间绑定查询" :width="800" :close-disabled="true">
        <p v-if="busy" role="status">正在查询绑定…</p>
        <p v-if="actionError" role="alert">{{ actionError }}</p>
        <RendererTable v-if="bindingsReady && bindingsKey" :data-view-key="bindingsKey" :children="bindingFields" />
        <RendererButton label="关闭" @click="closeBindings" />
      </RendererDialog>
      <p v-if="actionError && !editing && !bindingsOpen" role="alert">{{ actionError }}</p>
    </template>
  </section>
</template>

<script setup lang="ts">
import {computed, defineAsyncComponent, onBeforeUnmount, ref, shallowRef, toRaw, watch} from 'vue'
import {useRoute} from 'vue-router'
import {buildDataViewKey, RequestState, type DataRow, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {PAGE_RUNTIME, RendererTable, RendererButton, RendererDialog, RendererForm, FieldText, FieldTextarea,
  FieldSelect, useSparkComponent, type RFilterProps, type RToolbarProps} from '@spark-appworks/spark-component'
import {LowcodeDataSpaceCatalog} from '@/lowcode/data-space/lowcode-data-space-catalog'
import {parseTenantScope} from '@/services/tenant-scope'

const DataSetDesign = defineAsyncComponent(() => import('../design/ui/data-set-design-page.vue'))
const route = useRoute()
const deleteOpen = ref(false), deleteName = ref(''), designId = ref('')
const designPage = ref<{hasPending: boolean} | null>(null)
/** 设计页有未保存修改或在途操作时禁止关闭对话框，避免卸载时静默丢弃草稿。 */
const designPending = computed(() => designPage.value?.hasPending === true)
const {sparkProvide, sparkRemove} = useSparkComponent({type: 'data-set-list-page'})
const owner = shallowRef<LowcodeDataSpaceCatalog>(), ready = ref(false), loading = ref(false), error = ref(''), revision = ref(0)
const busy = ref(false), actionError = ref(''), message = ref(''), bindingsOpen = ref(false), bindingsReady = ref(false)
let runtime: PageRuntime | undefined, unsubscribe: (() => void) | undefined, generation = 0, active = true, actionGeneration = 0
const scenarioId = computed(() => typeof route.meta['blueprintScenarioId'] === 'string' ? route.meta['blueprintScenarioId'] : '')
const projectId = computed(() => parseTenantScope(route.path)?.projectId ?? '')
const catalogKey = computed(() => buildDataViewKey('Base_DataSet', 'catalog', scenarioId.value))
const appsKey = computed(() => buildDataViewKey('Base_AppSystemList', 'catalogApps', scenarioId.value))
const listError = computed(() => {revision.value; return owner.value?.view.loadingError?.message ?? ''})
const appsError = computed(() => {revision.value; return owner.value?.apps.loadingError?.message ?? ''})
const unresolved = computed(() => {revision.value; return owner.value?.unresolvedCreatorCount ?? 0})
const editing = computed(() => {revision.value; return owner.value?.editing})
const bindingsKey = computed(() => {revision.value; const view = owner.value?.bindings
  return view ? buildDataViewKey('Base_NavigationInfo', view.viewId, scenarioId.value) : ''})
const bindingFields: SparkNode[] = [
  {type: 'r-text', props: {field: 'rowid', label: '功能路径', readonly: true,
    displayFormatter: (value: unknown) => owner.value?.bindingPath(value) ?? ''}},
  {type: 'r-text', props: {field: 'NavigationUrl', label: '页面路径', readonly: true}},
]
const toolbar = computed<RToolbarProps>(() => {
  revision.value
  return {children: [
    {type: 'r-button', props: {label: '新增', disabled: busy.value || !owner.value?.canCreate(), onClick: beginCreate}},
    {type: 'r-button', props: {label: '编辑', disabled: busy.value || !owner.value?.canEdit(), onClick: beginEdit}},
    {type: 'r-button', props: {label: '删除', disabled: busy.value || !owner.value?.canDelete(), onClick: openDelete}},
    {type: 'r-button', props: {label: '刷新', action: 'refresh'}},
  ]}
})
const actions = computed<RToolbarProps>(() => {
  revision.value
  return {children: [{label: '设计', run: design}, {label: '复制API', run: copyApi}, {label: '查询绑定', run: queryBindings}]
    .map(action => ({type: 'r-button', props: {label: action.label,
      onBeforeRender: ({row, dataSource}: {row?: DataRow | null; dataSource?: DataView | null}) => {
        const catalog = owner.value
        // 标准行上下文是渲染镜像；按绑定视图主键定位原行，再由原查询核身份和读取权限。
        const original = row && dataSource && toRaw(dataSource) === catalog?.view
          ? catalog.view.rows.find(item => catalog.view.getPkKey(item) === dataSource.getPkKey(row)) : undefined
        const allowed = () => owner.value === catalog && !busy.value && !editing.value && !bindingsOpen.value
          && !!original && !!catalog?.designTarget(original)
        return {disabled: !allowed(), onClick: async () => {if (original && allowed()) {choose(original); await action.run()}}}
      },
    }}))}
})
const fields = computed<SparkNode[]>(() => {
  revision.value
  return [
    {type: 'r-text', props: {field: 'sysid', label: '应用系统', width: 200, readonly: true,
      displayFormatter: (value: unknown) => owner.value?.applicationLabel(value) ?? ''}},
    {type: 'r-text', props: {field: 'Name', label: '名称', width: 220, readonly: true}},
    {type: 'r-text', props: {field: 'Type', label: '类型', width: 120, readonly: true,
      displayFormatter: (value: unknown) => typeof value === 'string'
        ? ({datasource: '数据源', workflow: '工作流', form: '表单'} as Record<string, string>)[value] ?? value : ''}},
    {type: 'r-text', props: {field: 'description', label: '描述', width: 320, readonly: true}},
    {type: 'r-text', props: {field: 'createuser', label: '创建人', width: 140, readonly: true,
      displayFormatter: (value: unknown) => owner.value?.creatorLabel(value) ?? ''}},
    {type: 'r-text', props: {field: 'createtime', label: '创建时间', width: 190, readonly: true}},
  ]
})
const filter = computed<RFilterProps>(() => {
  revision.value
  return {autoQuery: false, autoFitMinWidth: '240px', children: [
    {type: 'r-text', props: {field: 'Name', label: '名称或 ID', placeholder: '搜索名称或 ID',
      filterAlternatives: [{field: 'Name', operator: 'contains'}, {field: 'rowid', operator: 'eq'}]}},
    {type: 'r-select', props: {field: 'sysid', label: '所属应用', placeholder: '全部应用', clearable: true,
      optionDataViewKey: appsKey.value, optionValueField: 'rowid', optionLabelField: 'AppDesc', optionLabelFields: ['AppDesc', 'AppName'],
      disabled: owner.value?.apps.requestState !== RequestState.Loaded}},
  ]}
})
function choose(row: DataRow): void {
  if (busy.value || editing.value || bindingsOpen.value) return
  const current = owner.value
  const original = toRaw(row)
  if (current?.isCurrent() && current.view.rows.includes(original)) current.view.setSelectedRows([original])
}
async function act(operation: (catalog: LowcodeDataSpaceCatalog) => void | Promise<void>, success = ''): Promise<void> {
  const catalog = owner.value
  if (!catalog || busy.value) return
  const action = ++actionGeneration
  const current = () => owner.value === catalog && action === actionGeneration
  busy.value = true; actionError.value = ''; message.value = ''
  try {await operation(catalog); if (current()) message.value = success}
  catch (cause) {if (current()) actionError.value = cause instanceof Error ? cause.message : String(cause)}
  finally {if (current()) {busy.value = false; revision.value++}}
}
async function beginCreate(): Promise<void> {await act(catalog => catalog.beginCreate())}
async function beginEdit(): Promise<void> {await act(catalog => catalog.beginEdit())}
async function cancelEdit(): Promise<void> {await act(catalog => catalog.cancelEdit())}
async function saveEdit(): Promise<void> {await act(catalog => catalog.saveEdit(), '数据空间已保存')}
function openDelete(): void {
  const catalog = owner.value
  if (!catalog?.canDelete()) return
  const row = catalog.view.selectedRows[0]
  deleteName.value = typeof row?.['Name'] === 'string' ? row['Name'] : ''
  actionError.value = ''; deleteOpen.value = true
}
async function confirmDelete(): Promise<void> {
  await act(catalog => catalog.deleteSelected(), '数据空间已删除')
  if (!actionError.value) deleteOpen.value = false
}
async function copyApi(): Promise<void> {
  await act(async catalog => {
    const content = await catalog.readApiInfo()
    if (owner.value !== catalog) return
    if (!navigator.clipboard?.writeText) throw new Error('当前环境不支持剪贴板写入')
    await navigator.clipboard.writeText(content)
  }, 'API 调用资料已复制')
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
  bindingsOpen.value = false; bindingsReady.value = false; busy.value = false; actionError.value = ''; message.value = ''
  unsubscribe?.(); unsubscribe = undefined
  sparkRemove(PAGE_RUNTIME); runtime?.dispose(); runtime = undefined
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
    const current = new PageRuntime({pageId: 'data-set-list-page', scenarioIds: [scenario], loadScenario: async () => catalog.dataSet})
    runtime = current; await current.load()
    if (!active || own !== generation) {current.dispose(); return}
    unsubscribe = catalog.dataSet.onAnyViewChange({rowsChanged: () => revision.value++, selectedRowsChanged: () => revision.value++,
      requestStateChanged: () => revision.value++, configChanged: () => revision.value++, editingChanged: () => revision.value++})
    sparkProvide(PAGE_RUNTIME, current)
    // 首次查询先完成，再挂接容器，避免autoLoad与目录初始化并发发起同一请求。
    await catalog.initialize()
    if (active && own === generation) ready.value = true
  } catch (cause) {if (active && own === generation) {error.value = cause instanceof Error ? cause.message : String(cause); release()}}
  finally {if (active && own === generation) loading.value = false}
}, {immediate: true})
onBeforeUnmount(() => {active = false; generation++; release()})
</script>

<style scoped>
.data-space-catalog { display: grid; grid-template-columns: minmax(0, 1fr); min-width: 0; gap: 16px; padding: 24px; color: var(--el-text-color-primary); }
h1 { margin: 0; font-size: 20px; }
header p { color: var(--el-text-color-secondary); }
[role="alert"] { color: var(--el-color-danger); }
</style>
