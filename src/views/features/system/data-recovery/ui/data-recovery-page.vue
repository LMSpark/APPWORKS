<!--
@module app:views/features/system/data-recovery/ui/data-recovery-page
职责：按应用系统、数据库及数据表浏览软删除数据，恢复单条数据或撤销已恢复记录，并查看表全部数据。
边界：选择、表列表、动态字段、三类数据及恢复记录均绑定同一PageRuntime的正式DataView；恢复与撤销经DataSet保存。
AI用途：迁移系统运维数据恢复时，核对级联输入、data_id取值与恢复记录的权限及保存回执。
-->
<template>
  <RendererSection class="recovery-page" :bordered="false" :grid-columns="1" :grid-gap="16"
    :status="loading ? '正在读取应用系统…' : reloadBlocked ? '当前显示原导航的数据恢复记录。' : ''"
    :error="error" :retryable="!loading && !ready" @retry="loadCurrentRoute">
    <RendererButton v-if="reloadBlocked" label="切换到当前导航" :disabled="locked" @click="loadCurrentRoute" />
    <SparkPageRenderer v-if="runtime && toolHost" :page-runtime="runtime" :route-snapshot="routeSnapshot" :host="toolHost" :auto-load="false">
      <template #content="{children}">
        <div class="recovery-page__body">
          <SparkComponentRenderer v-for="(node, index) in children" :key="nodeId(node) ?? index" :config="bindDataFields(node)" />
        </div>
      </template>
    </SparkPageRenderer>
  </RendererSection>
</template>

<script setup lang="ts">
import {computed, nextTick, onBeforeUnmount, ref, shallowRef, watch} from 'vue'
import {PageTool} from '@spark-appworks/spark-project-model'
import {useRoute} from 'vue-router'
import {useSystemPageDirtySource} from '@spark-appworks/spark-app'
import {buildDataViewKey, getSparkNodeChildren, nodeId, type DataRow, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import * as Components from '@spark-appworks/spark-component'
import {useFeaturePageRuntime} from '@/views/features/shared/runtime/use-feature-page-runtime'

import rule from './tool/rule.json?raw'
import script from './tool/script.js?raw'
import style from './tool/style.css?raw'

const {RendererSection, SparkPageRenderer, SparkComponentRenderer, RendererButton, consumeRequiredPageService} = Components
const scenarioId = '70D5D8FACCC201A822F64B16A441BE8F'
const {sparkConsume} = Components.useSparkComponent({type: 'data-recovery-page'})
const pageService = consumeRequiredPageService(sparkConsume, 'data-recovery-page')
const busy = ref(false)
const unconfirmed = shallowRef<RecoveryCommit>()
const locked = computed(() => busy.value || unconfirmed.value !== undefined)
const {session, ready, loading, error, reloadBlocked, loadCurrentRoute} = useFeaturePageRuntime({
  scenarioId, modelName: 'Base_AppSystemList', componentType: 'data-recovery-page', title: '数据恢复',
  tool: pageId => {
    const tool = new PageTool({pageId})
    tool.hydrateFileText('rule.json', rule)
    tool.hydrateFileText('script.js', script)
    tool.hydrateFileText('style.css', style)
    tool.markLoaded()
    return tool
  },
  preserveRuntime: () => locked.value,
})
const route = useRoute()
const routeSnapshot = computed(() => {
  const {path, fullPath, name, params, query, hash} = route
  return {path, fullPath, name: name ?? null, params, query, hash}
})
const runtime = computed(() => ready.value ? session.runtime : undefined)
const toolHost = computed(() => {
  const current = runtime.value
  if (!current) return undefined
  return {runtime: current, assertCurrent() {
    if (!session.isCurrent(current)) throw new Error('数据恢复运行实例已失效')
  }, async invoke(command: string, input: unknown) {
    if (!session.isCurrent(current)) throw new Error('数据恢复运行实例已失效')
    if (command === 'recovery.connect') return {
      selectionLocked: () => locked.value || reloadBlocked.value,
      status: () => ({title: table.value?.label ?? '数据',
        status: table.value ? notice.value : '请先选择应用系统和数据库，再选择数据表', error: message.value}),
      selected: () => table.value !== undefined,
      tab: () => tab.value,
      verification: () => ({visible: unconfirmed.value !== undefined, disabled: busy.value}),
    }
    if (command === 'recovery.tab' && (input === 'deleted' || input === 'recovered' || input === 'all')) {
      tab.value = input
      await loadAll()
    }
    if (command === 'recovery.verify') await verifyOriginalSave()
    if (input && typeof input === 'object') {
      if (command === 'recovery.restore') await recover(input as DataRow)
      if (command === 'recovery.undo') await undo(input as DataRow)
    }
    return undefined
  }}
})
const key = (model: string) => buildDataViewKey(model, 'default', scenarioId)
const appKey = key('Base_AppSystemList'), dbKey = key('Base_AppAndSource_Relation'), tableKey = key('_Base_TblList')
const fieldKey = key('Base_TblField'), deletedKey = key('获取软删除的数据'), allKey = key('获取表数据')
const recoveredKey = key('Base_TableData_Recovery')
const text = (field: string, label: string, minWidth = 140): SparkNode =>
  ({type: 'r-text', props: {field, label, readonly: true, minWidth, showOverflowTooltip: true}})
const tab = ref<string | number>('deleted')
const table = shallowRef<{rowid: string; label: string}>()
const columns = shallowRef<readonly {name: string; label: string}[]>([])
const message = ref(''), notice = ref('')
useSystemPageDirtySource({get isDirty() {return locked.value}})
/** 软删除读取适配器拒绝排序，表数据列为运行时生成、不在视图输出合同内，二者均不提供表头排序。 */
const dataFields = computed(() => columns.value.map(column => {
  const node = text(column.name, column.label)
  return {...node, props: {...node.props, sortable: false}}
}))
function bindDataFields(node: SparkNode): SparkNode {
  if (nodeId(node) === 'recovery-deleted-table' || nodeId(node) === 'recovery-all-table') {
    return {...node, children: dataFields.value}
  }
  if (!node.children) return node
  return {...node, children: getSparkNodeChildren(node.children).map(bindDataFields)}
}
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
  if (rowid !== previous) { syncColumns(); message.value = ''; notice.value = ''; void nextTick(loadAll) }
}
function syncColumns(): void {
  const tableId = table.value?.rowid
  const source = view(fieldKey)
  if (!tableId || source.loadingError || source.nextPageAvailable === true || (source.countReported && source.total !== source.rows.length)) {
    columns.value = []
    return
  }
  columns.value = source.rows.flatMap(row => {
    if (source.fieldAccess(row, 'tblid').read !== 'visible' || value(row, 'tblid') !== tableId
      || source.fieldAccess(row, 'enname').read !== 'visible') return []
    const name = value(row, 'enname')
    if (!name) return []
    const label = source.fieldAccess(row, 'cnname').read === 'visible' ? value(row, 'cnname') : ''
    return [{name, label: label || name}]
  })
}
watch(ready, isReady => {
  unbind()
  if (!isReady) {
    table.value = undefined
    columns.value = []
    tab.value = 'deleted'
    return
  }
  listen(view(tableKey), ['currentRowChanged', 'rowsChanged', 'cleared'], syncTable)
  listen(view(fieldKey), ['rowsChanged', 'cleared', 'requestStateChanged'], syncColumns)
  syncTable(); syncColumns()
})
onBeforeUnmount(unbind)

/** 全部数据接口遇大表由后端拒绝，只在标签激活时查询；错误由绑定表格显示原因。 */
async function loadAll(): Promise<void> {
  if (!ready.value || reloadBlocked.value || tab.value !== 'all' || !table.value) return
  const tables = view(tableKey), databases = view(dbKey)
  const selectedTable = tables.currentRow, selectedDatabase = databases.currentRow
  if (!selectedTable || !selectedDatabase || tables.fieldAccess(selectedTable, 'tblname').read !== 'visible'
    || databases.fieldAccess(selectedDatabase, 'conid').read !== 'visible') return
  const tableName = value(selectedTable, 'tblname'), dbId = value(selectedDatabase, 'conid')
  const target = view(allKey)
  if (!tableName || !dbId || target.queryContext['TbName'] !== selectedTable['tblname']
    || target.queryContext['DbId'] !== selectedDatabase['conid']) return
  await target.refresh().catch(() => undefined)
}

/** 只接受正式查询声明并由 DataView 识别的单字段主键。 */
function dataIdentity(source: DataView, row: DataRow) {
  const [field] = source.effectivePkFields
  if (!source.requiresExplicitIdentitySubmission || source.effectivePkFields.length !== 1 || !field
    || !source.rows.includes(row) || source.fieldAccess(row, field).read !== 'visible') return undefined
  const id = source.getPkKey(row)
  if (id === undefined || id === '') return undefined
  return {field, id}
}
const recoveredView = () => view(recoveredKey)
function recoverBlocker(row: DataRow): string {
  if (!dataIdentity(view(deletedKey), row)) return '正式查询未返回可读取的唯一来源主键'
  const target = recoveredView()
  if (target.addActionState() !== 'enabled') return '当前无恢复记录新增权限'
  const denied = ['data_id', 'table_id', 'db_id', 'sys_id'].find(field => target.newRowFieldAccess(field).write !== 'allowed')
  return denied ? `恢复记录字段不可新增：${denied}` : ''
}
function undoBlocker(row: DataRow): string {
  const target = recoveredView()
  return target.editActionState(row) === 'enabled' && target.fieldAccess(row, 'status').write === 'allowed' ? '' : '当前无撤销该恢复记录的权限'
}
async function confirm(text: string): Promise<boolean> {
  return pageService.showConfirm(text, '提示', {type: 'warning'})
}
/** 一次恢复记录提交：目标视图、记录主键、失败后丢弃本地变更的方式及成功提示。 */
type RecoveryCommit = Readonly<{target: DataView; id: string | number; tableId: string; discard: () => void; done: string}>
async function refreshAfterCommit({target, tableId, done}: RecoveryCommit): Promise<void> {
  const isCurrent = () => !reloadBlocked.value && !target.destroyed && table.value?.rowid === tableId && target === recoveredView()
  if (!isCurrent()) return
  notice.value = done
  const views = [view(deletedKey), target]
  const results = await Promise.allSettled(views.map(item => item.refresh()))
  if (!isCurrent()) return
  const rejected = results.find(result => result.status === 'rejected')
  const readError = rejected?.reason ?? views.find(item => item.loadingError)?.loadingError
  if (readError) message.value = `恢复记录已确认，列表回读失败：${failure(readError)}`
}
async function commit(operation: RecoveryCommit): Promise<void> {
  const {target, id, discard} = operation
  const result = await target.dataSet?.saveChanges({views: [{tableName: target.tableName, viewId: target.viewId, ids: [id]}]})
  if (!result) throw new Error('恢复记录视图缺少DataSet')
  if (!result.success) {
    if (target.hasUnconfirmedSave) unconfirmed.value = operation
    else discard()
    throw new Error(result.error?.message ?? '保存未确认，请刷新核验')
  }
  await refreshAfterCommit(operation)
}

async function verifyOriginalSave(): Promise<void> {
  const operation = unconfirmed.value
  if (!operation || busy.value) return
  busy.value = true; message.value = ''
  try {
    const {target} = operation
    if (target.destroyed || target !== recoveredView() || !target.hasUnconfirmedSaveFor([operation.id])) throw new Error('原保存查询已失效')
    const result = await target.saveChanges([operation.id])
    if (!result.success) throw new Error(result.message || '原保存结果尚未核定')
    unconfirmed.value = undefined
    await refreshAfterCommit(operation)
  } catch (cause) { message.value = failure(cause) } finally { busy.value = false }
}

async function recover(row: DataRow): Promise<void> {
  if (locked.value || reloadBlocked.value || !table.value) return
  const blocker = recoverBlocker(row)
  if (blocker) { message.value = `无法恢复：${blocker}`; return }
  busy.value = true; message.value = ''; notice.value = ''
  try {
    const source = view(deletedKey), identity = dataIdentity(source, row), target = recoveredView()
    const owners = [view(tableKey), view(dbKey), view(appKey)] as const
    const [selectedTable, db, app] = owners.map(owner => owner.currentRow)
    const tableId = value(selectedTable, 'rowid'), dbId = value(db, 'conid'), appId = value(app, 'rowid')
    if (!identity || !selectedTable || !db || !app || !tableId || !dbId || !appId) throw new Error('恢复缺少当前来源身份')
    const checks = [source.captureReadRow(row, [identity.field]), owners[0].captureReadRow(selectedTable, ['rowid']),
      owners[1].captureReadRow(db, ['conid']), owners[2].captureReadRow(app, ['rowid'])]
    if (!await confirm('确认恢复该条数据吗？')) return
    if (reloadBlocked.value) throw new Error('导航已变化，请重新选择恢复记录')
    checks.forEach(check => check())
    if (owners[0].currentRow !== selectedTable || owners[1].currentRow !== db || owners[2].currentRow !== app || recoveredView() !== target) {
      throw new Error('恢复对象已变化，请重新选择')
    }
    const currentBlocker = recoverBlocker(row)
    if (currentBlocker) throw new Error(currentBlocker)
    const created = await target.addRow({data_id: String(identity.id), table_id: tableId, db_id: dbId, sys_id: appId})
    const pk = target.getPkKey(created)
    if (pk === undefined) throw new Error('恢复记录新增缺少正式行身份')
    await commit({target, id: pk, tableId, discard: () => target.discardPendingChanges([pk]), done: '恢复登记已确认'})
  } catch (cause) { message.value = `恢复失败：${failure(cause)}` } finally { busy.value = false }
}

async function undo(row: DataRow): Promise<void> {
  const tableId = table.value?.rowid
  if (locked.value || reloadBlocked.value || !tableId) return
  const target = recoveredView(), id = target.rows.includes(row) ? target.getPkKey(row) : undefined
  if (id === undefined) return
  const blocker = undoBlocker(row)
  if (blocker) { message.value = `无法撤销恢复：${blocker}`; return }
  busy.value = true; message.value = ''; notice.value = ''
  try {
    const original = target.captureReadRow(row, ['status'])
    if (!await confirm('撤销恢复后，原数据将重新进入回收站。确认继续吗？')) return
    if (reloadBlocked.value) throw new Error('导航已变化，请重新选择恢复记录')
    original()
    if (table.value?.rowid !== tableId || recoveredView() !== target) throw new Error('恢复记录视图已变化，请重新选择')
    const currentBlocker = undoBlocker(row)
    if (currentBlocker) throw new Error(currentBlocker)
    target.updateEditingValue(id, 'status', 1)
    await commit({target, id, tableId, discard: () => target.discardEditingRows([id]), done: '撤销恢复登记已确认'})
  } catch (cause) { message.value = `撤销恢复失败：${failure(cause)}` } finally { busy.value = false }
}
</script>

<style scoped>
.recovery-page {padding: 8px}
</style>
