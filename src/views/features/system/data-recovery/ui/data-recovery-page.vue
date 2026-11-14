<!--
@module app:views/features/system/data-recovery/ui/data-recovery-page
职责：按应用系统、数据库及数据表浏览软删除数据，恢复单条数据或撤销已恢复记录，并查看表全部数据。
边界：选择、表列表、动态字段、三类数据及恢复记录均绑定同一PageRuntime的正式DataView；恢复与撤销经DataSet保存。
AI用途：迁移系统运维数据恢复时，核对级联输入、data_id取值与恢复记录的权限及保存回执。
-->
<template>
  <RendererSection class="recovery-page" :bordered="false" :grid-columns="1" :grid-gap="16"
    :status="loading ? '正在读取应用系统…' : ''" :error="error" :retryable="!loading && !ready" @retry="loadCurrentRoute">
    <div v-if="ready" class="recovery-page__body">
      <RendererSection class="recovery-page__side" title="数据表选择" :grid-columns="1" :grid-gap="12">
        <RendererForm :data-view-key="appKey" :auto-columns="false" :show-data-view-meta="false" :grid-columns="1">
          <FieldSelect data-member="value" :option-data-view-key="appKey" :option-label-fields="['AppDesc', 'AppName']"
            label="应用系统" placeholder="请选择应用系统" :filterable="true" :clearable="true" :disabled="busy" />
        </RendererForm>
        <RendererForm :data-view-key="dbKey" :auto-columns="false" :show-data-view-meta="false" :grid-columns="1">
          <FieldSelect data-member="value" :option-data-view-key="dbKey" :option-label-fields="['conName']"
            label="数据库" placeholder="请选择数据库" :filterable="true" :clearable="true" :disabled="busy" />
        </RendererForm>
        <RendererTable :data-view-key="tableKey" :children="tableFields" :show-data-view-meta="false"
          :pagination="{pageSizes: [15, 30, 50]}" />
      </RendererSection>
      <RendererSection class="recovery-page__main" :title="table?.label ?? '数据'" :grid-columns="1"
        :status="table ? notice : '请先选择应用系统和数据库，再选择数据表'" :error="message">
        <template v-if="table">
          <RendererTabs v-model="tab" @tab-change="loadAll">
            <RendererTabPane label="待恢复数据" name="deleted" :index="0">
              <RendererTable :key="`deleted-${columnsEpoch}`" :data-view-key="deletedKey" :children="dataFields" :actions="deletedActions"
                :show-data-view-meta="false" :pagination="{pageSizes: [15, 30, 50, 100]}" />
            </RendererTabPane>
            <RendererTabPane label="已恢复数据" name="recovered" :index="1">
              <RendererTable :data-view-key="recoveredKey" :children="recoveredFields" :actions="recoveredActions"
                :show-data-view-meta="false" :pagination="{pageSizes: [15, 30, 50, 100]}" />
            </RendererTabPane>
            <RendererTabPane label="全部数据" name="all" :index="2" :lazy="true">
              <RendererTable :key="`all-${columnsEpoch}`" :data-view-key="allKey" :children="dataFields"
                :show-data-view-meta="false" :pagination="{pageSizes: [15, 30, 50, 100]}" />
            </RendererTabPane>
          </RendererTabs>
        </template>
      </RendererSection>
    </div>
  </RendererSection>
</template>

<script setup lang="ts">
import {computed, nextTick, onBeforeUnmount, ref, shallowRef, watch} from 'vue'
import {ElMessageBox} from 'element-plus'
import {buildDataViewKey, type DataRow, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import * as Components from '@spark-appworks/spark-component'
import type {RToolbarProps} from '@spark-appworks/spark-component'
import {useFeaturePageRuntime} from '@/views/features/shared/runtime/use-feature-page-runtime'

const {RendererSection, RendererForm, RendererTable, RendererTabs, RendererTabPane, FieldSelect} = Components
const scenarioId = '70D5D8FACCC201A822F64B16A441BE8F'
const {session, ready, loading, error, loadCurrentRoute} = useFeaturePageRuntime({
  scenarioId, modelName: 'Base_AppSystemList', componentType: 'data-recovery-page', title: '数据恢复',
})
const key = (model: string) => buildDataViewKey(model, 'default', scenarioId)
const appKey = key('Base_AppSystemList'), dbKey = key('Base_AppAndSource_Relation'), tableKey = key('_Base_TblList')
const fieldKey = key('Base_TblField'), deletedKey = key('获取软删除的数据'), allKey = key('获取表数据')
const recoveredKey = key('Base_TableData_Recovery')
const text = (field: string, label: string, minWidth = 140): SparkNode =>
  ({type: 'r-text', props: {field, label, readonly: true, minWidth, sortable: false, showOverflowTooltip: true}})
const tableFields: SparkNode[] = [text('tbldesc', '表描述', 120), text('tblname', '表名', 120)]
const recoveredFields: SparkNode[] = [text('sys_id', '应用系统ID'), text('db_id', '数据库ID'), text('data_id', '表数据ID'),
  text('recovery_date', '恢复操作日期', 160), text('table_id', '表名称'), text('recovery_userid', '恢复操作人')]
const tab = ref<string | number>('deleted')
const table = shallowRef<{rowid: string; label: string}>()
const columns = shallowRef<readonly {name: string; label: string}[]>([])
const columnsEpoch = ref(0), busy = ref(false), message = ref(''), notice = ref('')
const dataFields = computed(() => columns.value.map(column => text(column.name, column.label)))
const view = (dataViewKey: string): DataView => {
  const found = session.runtime?.resolveView(dataViewKey)
  if (!found) throw new Error(`数据恢复缺少正式视图 ${dataViewKey}`)
  return found
}
const value = (row: DataRow | null | undefined, field: string) => {
  const raw = row?.[field]
  return typeof raw === 'string' || typeof raw === 'number' ? String(raw).trim() : ''
}
const failure = (cause: unknown) => cause instanceof Error ? cause.message : String(cause)

let stops: (() => void)[] = []
function unbind(): void { for (const stop of stops) stop(); stops = [] }
function listen(target: DataView, events: readonly Parameters<DataView['events']['on']>[0][], handler: () => void): void {
  for (const event of events) { target.events.on(event, handler); stops.push(() => target.events.off(event, handler)) }
}
function syncTable(): void {
  const row = view(tableKey).currentRow, rowid = value(row, 'rowid')
  const previous = table.value?.rowid, desc = value(row, 'tbldesc'), name = value(row, 'tblname')
  table.value = rowid ? {rowid, label: desc ? `${desc}[${name}]` : name} : undefined
  if (rowid !== previous) { message.value = ''; notice.value = ''; void nextTick(loadAll) }
}
function syncColumns(): void {
  columns.value = view(fieldKey).rows.map(row => ({name: value(row, 'enname'), label: value(row, 'cnname') || value(row, 'enname')}))
    .filter(column => column.name)
  columnsEpoch.value++
}
watch(ready, isReady => {
  unbind()
  if (!isReady) return
  listen(view(tableKey), ['currentRowChanged', 'rowsChanged', 'cleared'], syncTable)
  listen(view(fieldKey), ['rowsChanged', 'cleared'], syncColumns)
  syncTable(); syncColumns()
})
onBeforeUnmount(unbind)

/** 全部数据接口遇大表由后端拒绝，只在标签激活时查询；错误由绑定表格显示原因。 */
async function loadAll(): Promise<void> {
  if (tab.value !== 'all' || !table.value) return
  await view(allKey).refresh().catch(() => undefined)
}

/** 原数据身份是来源表物理主键；正式字段元数据未标识主键，只接受唯一存在的rowid或id。 */
function dataId(row: DataRow): string {
  const ids = ['rowid', 'id'].map(field => value(row, field)).filter(Boolean)
  return ids.length === 1 ? ids[0] ?? '' : ''
}
const recoveredView = () => view(recoveredKey)
function recoverBlocker(row: DataRow): string {
  if (!dataId(row)) return '该数据缺少唯一的rowid或id，无法确定来源主键'
  const target = recoveredView()
  if (target.addActionState() !== 'enabled') return '当前无恢复记录新增权限'
  const denied = ['data_id', 'table_id', 'db_id', 'sys_id'].find(field => target.newRowFieldAccess(field).write !== 'allowed')
  return denied ? `恢复记录字段不可新增：${denied}` : ''
}
function undoBlocker(row: DataRow): string {
  const target = recoveredView()
  return target.editActionState(row) === 'enabled' && target.fieldAccess(row, 'status').write === 'allowed' ? '' : '当前无撤销该恢复记录的权限'
}
const deletedActions = computed<RToolbarProps>(() => ({children: [{type: 'r-button', props: {
  label: '恢复', buttonType: 'primary', link: true, disabled: busy.value, onClick: recover,
}}]}))
const recoveredActions = computed<RToolbarProps>(() => ({children: [{type: 'r-button', props: {
  label: '撤销恢复', buttonType: 'warning', link: true, disabled: busy.value, onClick: undo,
}}]}))

async function confirm(text: string): Promise<boolean> {
  return ElMessageBox.confirm(text, '提示', {type: 'warning'}).then(() => true, () => false)
}
/** 一次恢复记录提交：目标视图、记录主键、失败后丢弃本地变更的方式及成功提示。 */
type RecoveryCommit = Readonly<{target: DataView; id: string | number; discard: () => void; done: string}>
async function commit({target, id, discard, done}: RecoveryCommit): Promise<void> {
  const result = await target.dataSet?.saveChanges({views: [{tableName: target.tableName, viewId: target.viewId, ids: [id]}]})
  if (!result) throw new Error('恢复记录视图缺少DataSet')
  if (!result.success) {
    if (!target.hasUnconfirmedSave) discard()
    throw new Error(result.error?.message ?? '保存未确认，请刷新核验')
  }
  notice.value = done
  await Promise.all([view(deletedKey).refresh(), target.refresh()])
}

async function recover(row: DataRow): Promise<void> {
  const current = table.value, blocker = recoverBlocker(row)
  if (busy.value || !current) return
  if (blocker) { message.value = `无法恢复：${blocker}`; return }
  if (!await confirm('确认恢复该条数据吗？')) return
  const db = view(dbKey).currentRow, app = view(appKey).currentRow, target = recoveredView()
  busy.value = true; message.value = ''; notice.value = ''
  try {
    if (!value(db, 'conid') || !value(app, 'rowid')) throw new Error('恢复缺少当前应用系统或数据库')
    const created = await target.addRow({data_id: dataId(row), table_id: current.rowid, db_id: value(db, 'conid'), sys_id: value(app, 'rowid')})
    const pk = target.getPkKey(created)
    if (pk === undefined) throw new Error('恢复记录新增缺少正式行身份')
    await commit({target, id: pk, discard: () => target.discardPendingChanges([pk]), done: '恢复成功'})
  } catch (cause) { message.value = `恢复失败：${failure(cause)}` } finally { busy.value = false }
}

async function undo(row: DataRow): Promise<void> {
  const target = recoveredView(), id = target.rows.includes(row) ? target.getPkKey(row) : undefined
  if (busy.value || id === undefined) return
  const blocker = undoBlocker(row)
  if (blocker) { message.value = `无法撤销恢复：${blocker}`; return }
  if (!await confirm('撤销恢复后，原数据将重新进入回收站。确认继续吗？')) return
  busy.value = true; message.value = ''; notice.value = ''
  try {
    target.updateEditingValue(id, 'status', 1)
    await commit({target, id, discard: () => target.discardEditingRows([id]), done: '撤销恢复成功'})
  } catch (cause) { message.value = `撤销恢复失败：${failure(cause)}` } finally { busy.value = false }
}
</script>

<style scoped>
.recovery-page {padding: 8px}
.recovery-page__body {display: grid; grid-template-columns: minmax(280px, 340px) minmax(0, 1fr); gap: 16px; align-items: start}
</style>
