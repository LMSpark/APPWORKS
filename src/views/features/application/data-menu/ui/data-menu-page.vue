<!--
@module app:views/features/application/data-menu/ui/data-menu-page
职责：恢复导航宿主管理：按名称查询宿主，新增、编辑、删除，并进入所关联数据空间的设计。
边界：列表、候选与编辑绑定同一PageRuntime的正式DataView；删除经DataSet单ID保存。数据空间授权配置随数据权限专题暂缓。
AI用途：迁移导航宿主时核对宿主记录写入字段、空间→资源→字段候选级联与设计入口。
-->
<template>
  <section class="data-menu-page">
    <header class="data-menu-page__header"><h1>导航宿主管理</h1></header>
    <p v-if="loading" role="status">正在读取导航宿主…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <RendererButton v-if="error && !loading && !ready" label="重试" @click="loadCurrentRoute" />
    <template v-if="ready">
      <p v-if="message" role="alert">{{ message }}</p>
      <div :inert="busy || !!editing || !!designId">
        <RendererTable :data-view-key="viewKey" :children="fields" :filter="filter" :toolbar="toolbar" :actions="actions"
          :stripe="true" :show-row-index="true" :highlight-current-row="true" :show-data-view-meta="false"
          :pagination="{pageSizes: [10, 20, 50, 100], showJumper: true}" />
      </div>
      <DataMenuDialog v-if="editing" :key="editing.epoch" :data-view-key="viewKey" :record-id="editing.id" :created="editing.created"
        :data-set-key="dataSetKey" :model-key="modelKey" :field-key="fieldKey" @close="closeEdit" />
      <RendererDialog v-if="designId" :model-value="true" title="数据集设计" width="92vw" top="4vh" :append-to-body="true"
        :destroy-on-close="true" :close-disabled="designPending" @update:model-value="designId = ''">
        <DataSetDesign ref="designPage" :target-id="designId" />
      </RendererDialog>
    </template>
  </section>
</template>

<script setup lang="ts">
import {computed, defineAsyncComponent, onBeforeUnmount, ref, watch} from 'vue'
import {useRoute} from 'vue-router'
import {buildDataViewKey, type DataRow, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import {PAGE_SERVICE, RendererButton, RendererDialog, RendererTable, useSparkComponent, type RFilterProps, type RToolbarProps, consumeRequiredPageService} from '@spark-appworks/spark-component'
import {useFeaturePageRuntime} from '@/views/features/shared/runtime/use-feature-page-runtime'
import {parseApplicationPathScope} from '@/services/application-scope'
import DataMenuDialog from './data-menu-dialog.vue'

const DataSetDesign = defineAsyncComponent(() => import('@/views/features/data-platform/data-set-management/design/ui/data-set-design-page.vue'))
const scenarioId = '2CA968B3513084BA2537BB0C85AE945E'
const {sparkConsume} = useSparkComponent({type: 'data-menu-page'})
const pageService = consumeRequiredPageService(sparkConsume, 'data-menu-page')
const {viewKey, session, ready, loading, error, loadCurrentRoute} = useFeaturePageRuntime({
  scenarioId, modelName: 'Base_DataMenu', componentType: 'data-menu-page', title: '导航宿主管理',
})
const key = (model: string) => buildDataViewKey(model, 'default', scenarioId)
const dataSetKey = key('Base_DataSet'), modelKey = key('Base_DataModel'), fieldKey = key('Base_DataModel_Field')
const route = useRoute()
const applicationId = computed(() => parseApplicationPathScope(route.path)?.projectId ?? '')
const busy = ref(false), message = ref(''), revision = ref(0), designId = ref('')
const editing = ref<{id: string | number; created: boolean; epoch: number}>()
const designPage = ref<{hasPending: boolean} | null>(null)
/** 设计页有未保存修改或在途操作时禁止关闭，避免卸载时静默丢弃草稿。 */
const designPending = computed(() => designPage.value?.hasPending === true)
let epoch = 0
const view = (dataViewKey: string): DataView => {
  const found = session.runtime?.resolveView(dataViewKey)
  if (!found) throw new Error(`导航宿主缺少正式视图 ${dataViewKey}`)
  return found
}
const text = (row: Readonly<DataRow> | null | undefined, field: string) => {
  const raw = row?.[field]
  return typeof raw === 'string' || typeof raw === 'number' ? String(raw).trim() : ''
}
const failure = (cause: unknown) => cause instanceof Error ? cause.message : String(cause)
/** sortable=false 用于存空间 ID、按名称显示的列：服务端按 ID 排序与所见名称次序无关。 */
type ColumnSpec = Readonly<{field: string; label: string; minWidth?: number; displayFormatter?: (value: unknown) => string; sortable?: false}>
const column = ({field, label, minWidth = 130, displayFormatter, sortable}: ColumnSpec): SparkNode =>
  ({type: 'r-text', props: {field, label, readonly: true, minWidth, showOverflowTooltip: true, displayFormatter,
    ...(sortable === false ? {sortable} : {})}})
/** 宿主只保存空间身份；名称取自当前应用的数据空间视图，查不到时显示原身份。 */
const dataSetName = (value: unknown) => {
  revision.value
  const id = String(value ?? '').trim()
  return text(view(dataSetKey).rows.find(row => text(row, 'rowid') === id), 'Name') || id || '-'
}
const createTime = (value: unknown) => String(value ?? '').trim().replace('T', ' ').slice(0, 19) || '-'
const fields: SparkNode[] = [
  column({field: 'Name', label: '宿主名称', minWidth: 160}), column({field: 'Desc', label: '用途描述', minWidth: 180}),
  column({field: 'DataType', label: '宿主类型', minWidth: 100}),
  column({field: 'dataSetId', label: '数据空间', minWidth: 160, displayFormatter: dataSetName, sortable: false}),
  column({field: 'ValueField', label: '值字段'}), column({field: 'TextField', label: '文字字段'}),
  column({field: 'createtime', label: '创建时间', minWidth: 170, displayFormatter: createTime}),
]
const filter: RFilterProps = {
  autoQuery: false, queryOnReset: true, firstPageOnSearch: true, showExpressionEditor: false, showDataViewMeta: false,
  children: [{type: 'r-text', props: {field: 'Name', label: '宿主名称', placeholder: '请输入宿主名称', filterTrim: true}}],
}
const current = computed(() => {revision.value; return ready.value ? view(viewKey).currentRow : null})
const toolbar = computed<RToolbarProps>(() => {
  revision.value
  const target = ready.value ? view(viewKey) : undefined, row = current.value
  return {children: [
    {type: 'r-button', props: {label: '新增', buttonType: 'primary', onClick: create,
      disabled: busy.value || !target || target.addActionState() !== 'enabled'}},
    {type: 'r-button', props: {label: '编辑', onClick: edit, disabled: busy.value || !target || !row || target.editActionState(row) !== 'enabled'}},
    {type: 'r-button', props: {label: '删除', buttonType: 'danger', onClick: remove,
      disabled: busy.value || !target || !row || target.deleteActionState(row) !== 'enabled'}},
  ]}
})
const actions = computed<RToolbarProps>(() => ({children: [{type: 'r-button', props: {
  label: '设计', link: true, buttonType: 'primary', disabled: busy.value,
  onClick: (row: DataRow) => {
    const id = text(row, 'dataSetId')
    if (id) designId.value = id
    else message.value = '该导航宿主未关联数据空间，不能设计'
  },
}}]}))

let stops: (() => void)[] = []
function unbind(): void { for (const stop of stops) stop(); stops = [] }
function listen(target: DataView): void {
  const bump = () => {revision.value++}
  for (const event of ['currentRowChanged', 'rowsChanged', 'cleared'] as const) {
    target.events.on(event, bump); stops.push(() => target.events.off(event, bump))
  }
}
async function loadDataSets(): Promise<void> {
  if (!ready.value || !applicationId.value) return
  const dataSets = view(dataSetKey)
  dataSets.queryContext = {applicationId: applicationId.value}
  await dataSets.refresh()
  if (dataSets.loadingError) message.value = `读取数据空间失败：${dataSets.loadingError.message}`
}
watch(ready, isReady => {
  unbind()
  if (!isReady) return
  listen(view(viewKey)); listen(view(dataSetKey))
  void loadDataSets()
})
onBeforeUnmount(unbind)

async function create(): Promise<void> {
  const target = view(viewKey)
  if (busy.value || target.addActionState() !== 'enabled') return
  busy.value = true; message.value = ''
  try {
    const row = await target.addRow({ShowType: 'ChildItem', DataType: 'Table'})
    const id = target.getPkKey(row)
    if (id === undefined) throw new Error('新增导航宿主缺少原生身份')
    editing.value = {id, created: true, epoch: ++epoch}
  } catch (cause) { message.value = `新增导航宿主失败：${failure(cause)}` } finally { busy.value = false }
}
function edit(): void {
  const target = view(viewKey), row = target.currentRow
  const id = row ? target.getPkKey(row) : undefined
  if (id === undefined) { message.value = '请先选择导航宿主'; return }
  editing.value = {id, created: false, epoch: ++epoch}
}
async function closeEdit(): Promise<void> {
  editing.value = undefined
  await view(viewKey).refresh()
}
async function remove(): Promise<void> {
  const target = view(viewKey), row = target.currentRow
  const id = row ? target.getPkKey(row) : undefined
  if (busy.value || !row || id === undefined || target.deleteActionState(row) !== 'enabled') return
  const confirmed = await pageService.showConfirm(`确定删除导航宿主"${text(row, 'Name')}"吗？`, '删除确认', {type: 'warning'})
    .then(() => true, () => false)
  if (!confirmed) return
  busy.value = true; message.value = ''
  try {
    await target.removeRow(id)
    const result = await target.dataSet?.saveChanges({views: [{tableName: target.tableName, viewId: target.viewId, ids: [id]}]})
    if (!result) throw new Error('导航宿主视图缺少DataSet')
    if (!result.success) {
      if (!target.hasUnconfirmedSave) target.discardPendingChanges([id])
      throw new Error(result.error?.message ?? '删除结果未确认，请刷新核验')
    }
    message.value = '删除成功'
    await target.refresh()
  } catch (cause) { message.value = `删除导航宿主失败：${failure(cause)}` } finally { busy.value = false }
}
</script>

<style scoped>
.data-menu-page {display: grid; gap: 16px; padding: 24px; color: var(--el-text-color-primary)}
.data-menu-page__header h1 {margin: 0; font-size: 20px}
</style>
