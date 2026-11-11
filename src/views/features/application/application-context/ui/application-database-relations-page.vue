<!--
@module app:views/features/application/application-context/ui/application-database-relations-page
职责：恢复应用关联数据库：列出当前应用已关联的数据库，从可选数据库中添加关联，删除非默认关联。
边界：关联、候选及数据库信息绑定同一PageRuntime的正式DataView；新增与删除经DataSet保存，默认数据库(isRef=0)不可删除。
AI用途：迁移应用系统数据库关联时，核对sysid来源、候选视图输入参数与关联记录写入字段。
-->
<template>
  <section class="database-relations-page">
    <header class="database-relations-page__header">
      <h1>关联数据库</h1>
      <span>{{ sysid }}</span>
    </header>
    <p v-if="loading" role="status">正在读取数据库信息…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <RendererButton v-if="error && !loading && !ready" label="重试" @click="loadCurrentRoute" />
    <template v-if="ready">
      <p v-if="message" role="alert">{{ message }}</p>
      <RendererTable :data-view-key="relationKey" :children="relationFields" :toolbar="toolbar" :stripe="true"
        :highlight-current-row="true" :show-data-view-meta="false" />
      <RendererDialog v-if="choosing" :model-value="true" title="选择数据库" width="min(1200px, 94vw)" :append-to-body="true"
        :close-disabled="busy" @update:model-value="choosing = false">
        <RendererTable :data-view-key="candidateKey" :children="candidateFields" :actions="candidateActions"
          :stripe="true" :show-data-view-meta="false" />
        <template #footer><RendererButton label="取消" :disabled="busy" @click="choosing = false" /></template>
      </RendererDialog>
    </template>
  </section>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, ref, watch} from 'vue'
import {useRoute} from 'vue-router'
import {ElMessageBox} from 'element-plus'
import {buildDataViewKey, type DataRow, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import {RendererButton, RendererDialog, RendererTable, type RToolbarProps} from '@spark-appworks/spark-component'
import {useFeaturePageRuntime} from '@/views/features/shared/runtime/use-feature-page-runtime'
import {parseApplicationPathScope} from '@/services/application-scope'

const scenarioId = '93DF05182084B1F0E8DA7283E83BBE0C'
const {session, ready, loading, error, loadCurrentRoute} = useFeaturePageRuntime({
  scenarioId, modelName: '_base_dbInfo', componentType: 'application-database-relations-page', title: '关联数据库',
})
const key = (model: string) => buildDataViewKey(model, 'default', scenarioId)
const databaseKey = key('_base_dbInfo'), relationKey = key('Base_AppAndSource_Relation'), candidateKey = key('db_relation_sel')
const route = useRoute()
/** 原页面由应用管理携带sysid进入；导航直达时管理当前应用自身的数据库关联。 */
const sysid = computed(() => {
  const query = route.query['sysid']
  return (typeof query === 'string' && query.trim()) || parseApplicationPathScope(route.path)?.projectId || ''
})
const busy = ref(false), choosing = ref(false), message = ref(''), revision = ref(0)
const view = (dataViewKey: string): DataView => {
  const found = session.runtime?.resolveView(dataViewKey)
  if (!found) throw new Error(`关联数据库缺少正式视图 ${dataViewKey}`)
  return found
}
const text = (row: DataRow | null | undefined, field: string) => {
  const raw = row?.[field]
  return typeof raw === 'string' || typeof raw === 'number' ? String(raw).trim() : ''
}
const failure = (cause: unknown) => cause instanceof Error ? cause.message : String(cause)
/** 关联记录只保存数据库Id，服务器、端口等信息按conid取自正式数据库视图。 */
const database = (conid: unknown) => {
  revision.value
  return view(databaseKey).rows.find(row => text(row, 'Id') === String(conid ?? '').trim())
}
const fromDatabase = (field: string, label: string, minWidth = 120): SparkNode => ({type: 'r-text', props: {
  field: 'conid', label, readonly: true, minWidth, sortable: false, showOverflowTooltip: true,
  displayFormatter: (conid: unknown) => text(database(conid), field)}})
const relationFields: SparkNode[] = [
  {type: 'r-checkbox', props: {field: 'isRef', label: '是否引用', readonly: true, width: 90, trueValue: 1, falseValue: 0}},
  {type: 'r-text', props: {field: 'conName', label: '数据库名', readonly: true, minWidth: 160, sortable: false, showOverflowTooltip: true}},
  {type: 'r-text', props: {field: 'cnName', label: '数据库中文名', readonly: true, minWidth: 180, sortable: false, showOverflowTooltip: true}},
  fromDatabase('ServerName', '服务器地址', 180), fromDatabase('Port', '端口', 100), fromDatabase('Type', '类型', 100),
  fromDatabase('SchemaName', '架构名称', 120), fromDatabase('Remark', '备注', 200),
]
const candidateText = (field: string, label: string, minWidth = 120): SparkNode =>
  ({type: 'r-text', props: {field, label, readonly: true, minWidth, sortable: false, showOverflowTooltip: true}})
const candidateFields: SparkNode[] = [candidateText('Name', '数据库名', 180), candidateText('Remark', '描述', 220),
  candidateText('Port', '端口', 100), candidateText('Type', '类型', 100)]

const current = computed(() => {revision.value; return ready.value ? view(relationKey).currentRow : null})
const toolbar = computed<RToolbarProps>(() => ({children: [
  {type: 'r-button', props: {label: '添加', buttonType: 'primary', disabled: busy.value || !sysid.value, onClick: openChoose}},
  {type: 'r-button', props: {label: '删除', buttonType: 'danger', onClick: remove,
    disabled: busy.value || !current.value || Number(current.value['isRef']) === 0}},
]}))
const candidateActions = computed<RToolbarProps>(() => ({children: [{type: 'r-button', props: {
  label: '选择', buttonType: 'primary', link: true, disabled: busy.value, onClick: choose}}]}))

let stops: (() => void)[] = []
function unbind(): void { for (const stop of stops) stop(); stops = [] }
function listen(target: DataView): void {
  const bump = () => {revision.value++}
  for (const event of ['currentRowChanged', 'rowsChanged', 'cleared'] as const) {
    target.events.on(event, bump); stops.push(() => target.events.off(event, bump))
  }
}
async function loadRelations(): Promise<void> {
  if (!ready.value) return
  const relations = view(relationKey)
  message.value = ''
  if (!sysid.value) { message.value = '缺少应用系统身份，无法读取关联数据库'; return }
  relations.queryContext = {sysid: sysid.value}
  await relations.refresh()
  if (relations.loadingError) message.value = `获取已关联数据库列表失败：${relations.loadingError.message}`
}
watch(ready, isReady => {
  unbind()
  if (!isReady) return
  listen(view(relationKey)); listen(view(databaseKey))
  void loadRelations()
})
watch(sysid, () => void loadRelations())
onBeforeUnmount(unbind)

async function openChoose(): Promise<void> {
  const candidates = view(candidateKey)
  const conids = view(relationKey).rows.map(row => text(row, 'conid')).filter(Boolean)
  candidates.queryContext = {conidsArray: conids, database: 'database', sysid: sysid.value}
  choosing.value = true
  await candidates.refresh()
}

/** 一次关联记录提交：保存范围仅本记录，失败且结果明确时丢弃本地变更。 */
async function commit(id: string | number, discard: () => void): Promise<void> {
  const relations = view(relationKey)
  const result = await relations.dataSet?.saveChanges({views: [{tableName: relations.tableName, viewId: relations.viewId, ids: [id]}]})
  if (!result) throw new Error('关联视图缺少DataSet')
  if (!result.success) {
    if (!relations.hasUnconfirmedSave) discard()
    throw new Error(result.error?.message ?? '保存未确认，请刷新核验')
  }
}

async function choose(row: DataRow): Promise<void> {
  const relations = view(relationKey), conid = text(row, 'Id')
  if (busy.value || !conid) return
  if (relations.addActionState() !== 'enabled') { message.value = '当前无新增数据库关联的权限'; return }
  busy.value = true; message.value = ''
  try {
    const created = await relations.addRow({conid, type: 'database', sysid: sysid.value,
      conName: text(row, 'Name'), cnName: text(row, 'Remark'), isRef: 1})
    const pk = relations.getPkKey(created)
    if (pk === undefined) throw new Error('关联记录新增缺少正式行身份')
    await commit(pk, () => relations.discardPendingChanges([pk]))
    choosing.value = false
    message.value = '关联成功'
    await relations.refresh()
  } catch (cause) { message.value = `添加数据库关联失败：${failure(cause)}` } finally { busy.value = false }
}

async function remove(): Promise<void> {
  const relations = view(relationKey), row = relations.currentRow
  const id = row ? relations.getPkKey(row) : undefined
  if (busy.value || !row || id === undefined) return
  if (Number(row['isRef']) === 0) { message.value = '默认数据库不可删除'; return }
  if (relations.deleteActionState(row) !== 'enabled') { message.value = '当前无删除该关联的权限'; return }
  const confirmed = await ElMessageBox.confirm(`确定要删除数据库关联"${text(row, 'conName')}"吗？`, '删除确认', {type: 'warning'})
    .then(() => true, () => false)
  if (!confirmed) return
  busy.value = true; message.value = ''
  try {
    await relations.removeRow(id)
    await commit(id, () => relations.discardPendingChanges([id]))
    message.value = '删除成功'
    await relations.refresh()
  } catch (cause) { message.value = `删除数据库关联失败：${failure(cause)}` } finally { busy.value = false }
}
</script>

<style scoped>
.database-relations-page {display: grid; gap: 16px; padding: 24px; color: var(--el-text-color-primary)}
.database-relations-page__header {display: flex; align-items: baseline; gap: 12px}
.database-relations-page__header h1 {margin: 0; font-size: 20px}
.database-relations-page__header span {color: var(--el-text-color-secondary); font-size: 13px}
</style>
