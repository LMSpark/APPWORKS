<!--
@module app:views/features/application/data-menu/ui/data-menu-page
职责：恢复导航宿主管理：按名称查询宿主，新增、编辑、删除，并进入所关联数据空间的设计。
边界：列表、候选与编辑绑定同一PageRuntime的正式DataView；删除经DataSet单ID保存。数据空间授权配置随数据权限专题暂缓。
AI用途：迁移导航宿主时核对宿主记录写入字段、空间→资源→字段候选级联与设计入口。
-->
<template>
  <RendererSection class="data-menu-page" title="导航宿主管理" :bordered="false" :grid-columns="1" :grid-gap="16"
    :status="loading ? '正在读取导航宿主…' : ''" :error="error">
    <template v-if="error && !loading && !ready" #header-actions>
      <RendererButton label="重试" @click="loadCurrentRoute" />
    </template>
    <template v-if="ready" #header-actions>
      <RendererButton v-if="deleteReceipt" label="核验原提交" :disabled="busy" @click="verifyOriginal" />
      <RendererButton label="新增" button-type="primary" icon="Plus" :data-view-key="viewKey" perm-action="create"
        :disabled="headerDisabled || !catalogView || catalogView.addActionState() !== 'enabled'" @click="create" />
      <RendererButton label="编辑" icon="Edit" :data-view-key="viewKey" perm-action="edit"
        :disabled="headerDisabled || !current || !catalogView || catalogView.editActionState(current) !== 'enabled'" @click="edit" />
      <RendererButton label="删除" button-type="danger" icon="Delete" :data-view-key="viewKey" perm-action="delete"
        :disabled="headerDisabled || !current || !catalogView || catalogView.deleteActionState(current) !== 'enabled'" @click="remove" />
    </template>
    <template v-if="ready">
      <DisplayAlert v-if="message" alert-type="warning" :closable="false" :show-icon="true" :title="message" />
      <div :inert="busy || !!editing || !!designId">
        <RendererTable :data-view-key="viewKey" :children="fields" :filter="filter" :actions="actions"
          :stripe="true" :border="true" :show-row-index="true" :highlight-current-row="true" :show-data-view-meta="false"
          :pagination="{pageSizes: [10, 20, 50, 100], showJumper: true}" />
      </div>
      <DataMenuDialog v-if="editing" :key="editing.epoch" :data-view-key="viewKey" :record-id="editing.id" :created="editing.created"
        :data-set-key="dataSetKey" :model-key="modelKey" :field-key="fieldKey" @close="closeEdit" />
      <RendererDialog v-if="designId" :model-value="true" title="数据集设计" width="92vw" top="4vh" :append-to-body="true"
        :destroy-on-close="true" :close-disabled="designPending" @update:model-value="designId = ''">
        <DataSetDesign ref="designPage" :target-id="designId" />
      </RendererDialog>
    </template>
  </RendererSection>
</template>

<script setup lang="ts">
import {computed, defineAsyncComponent, onBeforeUnmount, ref, watch} from 'vue'
import {onBeforeRouteLeave, onBeforeRouteUpdate, useRoute} from 'vue-router'
import {buildDataViewKey, type DataRow, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import * as SparkComponent from '@spark-appworks/spark-component'
import type {RFilterProps, RToolbarProps} from '@spark-appworks/spark-component'

const {DisplayAlert, RendererButton, RendererDialog, RendererSection, RendererTable, useSparkComponent, consumeRequiredPageService} = SparkComponent
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
const catalogView = computed(() => {revision.value; return ready.value ? view(viewKey.value) : undefined})
const current = computed(() => {revision.value; return catalogView.value?.currentRow ?? null})
const headerDisabled = computed(() => {
  revision.value
  const target = catalogView.value
  return busy.value || !!editing.value || !!designId.value || target?.hasUnconfirmedSave === true || target?.mutating === true
})
const deleteReceipt = computed(() => {
  revision.value
  const target = catalogView.value, journal = target?.dataSet?.saveJournal
  const [record] = journal?.views ?? []
  const [id] = record?.ids ?? []
  return target?.hasUnconfirmedSave && journal?.currentRecoverableAction === 'verify-original-receipt'
    && journal.views.length === 1 && record?.state === 'unknown' && record.ids.length === 1
    && record.tableName === target.tableName && record.viewId === target.viewId
    && id !== undefined && target.dirtyTracking.isPendingDelete(id) && journal.batchId ? {batchId: journal.batchId, id} : null
})
const actions = computed<RToolbarProps>(() => ({children: [{type: 'r-button', props: {
  label: '设计', link: true, buttonType: 'primary', disabled: headerDisabled.value,
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
  for (const event of ['currentRowChanged', 'rowsChanged', 'cleared', 'mutatingChanged'] as const) {
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
  listen(view(viewKey.value)); listen(view(dataSetKey))
  void loadDataSets()
})
onBeforeUnmount(unbind)

function keepOriginalSave(): boolean {
  const target = catalogView.value
  if (!busy.value && !target?.mutating && !target?.hasUnconfirmedSave) return true
  message.value = target?.hasUnconfirmedSave ? '原删除结果待核验，请处理后再离开' : '导航宿主操作正在处理'
  return false
}

onBeforeRouteLeave(keepOriginalSave)
onBeforeRouteUpdate(keepOriginalSave)

async function create(): Promise<void> {
  const target = view(viewKey.value)
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
  const target = view(viewKey.value), row = target.currentRow
  const id = row ? target.getPkKey(row) : undefined
  if (id === undefined) { message.value = '请先选择导航宿主'; return }
  editing.value = {id, created: false, epoch: ++epoch}
}
async function closeEdit(): Promise<void> {
  editing.value = undefined
  await view(viewKey.value).refresh()
}
/** 通过原模型派生一次只读查询，按原正式键核对删除，再刷新当前列表。 */
async function reportDeleteReadback(target: DataView, id: string | number): Promise<void> {
  if (catalogView.value !== target || target.destroyed) return
  let verification: DataView | undefined
  try {
    const fields = target.effectivePkFields
    const [field] = fields
    if (fields.length !== 1 || !field || field === '_pk') throw new Error('缺少可按键回读的正式主键')
    verification = target.createQueryView(`navigationHostDelete_${crypto.randomUUID()}`)
    verification.queryConfig = {...verification.queryConfig, cacheType: 'none', fields}
    const exact = await verification.loadFromServer({page: 1, pageSize: 1, filter: {field, operator: 'eq', value: id}})
    if (!exact.success || verification.countReported !== true || verification.total !== 0 || verification.rows.length !== 0) {
      throw new Error(exact.message ?? '原记录删除未通过精确回读')
    }
    if (catalogView.value !== target || target.destroyed) return
    const result = await target.requestRefresh({defer: false})
    if (result.refreshStatus !== 'read') throw new Error(result.message ?? '列表未完成读取')
    if (catalogView.value === target) message.value = '删除成功'
  } catch (cause) {
    if (catalogView.value === target) message.value = `删除已确认，回读失败：${failure(cause)}`
  } finally {
    if (verification && !verification.destroyed) verification.dataTable?.destroyView(verification.viewId)
  }
}

async function verifyOriginal(): Promise<void> {
  const target = catalogView.value, dataSet = target?.dataSet, receipt = deleteReceipt.value
  if (!target || !dataSet || !receipt || busy.value) return
  const {batchId, id} = receipt
  busy.value = true
  try {
    const result = await dataSet.verifySaveJournalAndRead({batchId, receiptViews: [target], readbackViews: [], discardNotApplied: true})
    if (catalogView.value !== target || target.destroyed) return
    if (result.settlement === 'confirmed') await reportDeleteReadback(target, id)
    else if (result.settlement === 'not-applied') {
      message.value = result.draftCleanup === 'discarded' ? '原删除未生效，已撤销原草稿' : '原删除未生效，草稿仍保留'
    } else message.value = result.verificationError ? `原删除仍待核验：${result.verificationError.message}` : '原删除仍待核验'
  } catch (cause) {
    if (catalogView.value === target) message.value = `原删除核验失败：${failure(cause)}`
  } finally {
    busy.value = false
    revision.value++
  }
}

async function remove(): Promise<void> {
  const target = catalogView.value, row = target?.currentRow, dataSet = target?.dataSet
  const id = row ? target?.getPkKey(row) : undefined
  if (headerDisabled.value || !target || !dataSet || !row || id === undefined || target.deleteActionState(row) !== 'enabled') return
  busy.value = true
  message.value = ''
  try {
    const original = target.captureReadRow(row, target.effectivePkFields)
    const confirmed = await pageService.showConfirm(`确定删除导航宿主"${text(row, 'Name')}"吗？`, '删除确认', {type: 'warning'})
    if (!confirmed || catalogView.value !== target || target.destroyed) return
    original()
    await target.removeRow(id)
    try {
      const receipt = await dataSet.saveRecord(target, id)
      if (receipt.followUpError) {
        if (catalogView.value === target) message.value = `删除已确认，后续处理失败：${receipt.followUpError.message}`
        return
      }
    } catch (cause) {
      if (!target.hasUnconfirmedSave && !target.destroyed) target.discardPendingChanges([id])
      throw cause
    }
    await reportDeleteReadback(target, id)
  } catch (cause) {
    if (catalogView.value === target) message.value = target.hasUnconfirmedSave ? '删除结果未知，原提交待核验' : `删除导航宿主失败：${failure(cause)}`
  } finally {
    busy.value = false
    revision.value++
  }
}
</script>

<style scoped>
.data-menu-page {padding: 8px}
</style>
