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
import {buildDataViewKey, getSparkNodeChildren, isDataRow, nodeId, type DataRow, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import * as Components from '@spark-appworks/spark-component'
import {useFeaturePageRuntime} from '@/views/features/shared/runtime/use-feature-page-runtime'
import {DataRecoverySession} from './data-recovery-session'

import rule from './tool/rule.json?raw'
import script from './tool/script.js?raw'
import style from './tool/style.css?raw'

const {RendererSection, SparkPageRenderer, SparkComponentRenderer, RendererButton, consumeRequiredPageService} = Components
const scenarioId = '70D5D8FACCC201A822F64B16A441BE8F'
const {sparkConsume} = Components.useSparkComponent({type: 'data-recovery-page'})
const pageService = consumeRequiredPageService(sparkConsume, 'data-recovery-page')
const recoverySession = shallowRef<DataRecoverySession>()
const locked = computed(() => recoverySession.value?.locked === true)
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
  const recovery = recoverySession.value
  if (!current || !recovery) return undefined
  return {runtime: current, assertCurrent() {
    if (!session.isCurrent(current)) throw new Error('数据恢复运行实例已失效')
  }, async invoke(command: string, input: unknown) {
    if (!session.isCurrent(current)) throw new Error('数据恢复运行实例已失效')
    if (command === 'recovery.connect') return {
      selectionLocked: () => locked.value || reloadBlocked.value,
      status: () => ({title: table.value?.label ?? '数据',
        status: table.value ? recovery.notice : '请先选择应用系统和数据库，再选择数据表', error: recovery.message}),
      selected: () => table.value !== undefined,
      tab: () => tab.value,
      canRestore: (row: DataRow | null | undefined) => !reloadBlocked.value && recovery.canRestore(row),
      canUndo: (row: DataRow | null | undefined) => !reloadBlocked.value && recovery.canUndo(row),
      verification: () => recovery.verification(),
    }
    if (command === 'recovery.tab' && (input === 'deleted' || input === 'recovered' || input === 'all')) {
      tab.value = input
      await loadAll()
    }
    if (command === 'recovery.verify') await recovery.verify()
    if (isDataRow(input)) {
      if (command === 'recovery.restore') await recovery.restore(input)
      if (command === 'recovery.undo') await recovery.undo(input)
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

let stops: (() => void)[] = []
function unbind(): void { for (const stop of stops) stop(); stops = [] }
function listen(target: DataView, events: readonly Parameters<DataView['events']['on']>[0][], handler: () => void): void {
  for (const event of events) { target.events.on(event, handler); stops.push(() => target.events.off(event, handler)) }
}
function syncTable(): void {
  const tables = view(tableKey), row = tables.currentRow
  const visible = (field: string) => row && tables.fieldAccess(row, field).read === 'visible' ? value(row, field) : ''
  const rowid = visible('rowid')
  const previous = table.value?.rowid, desc = visible('tbldesc'), name = visible('tblname')
  table.value = rowid ? {rowid, label: desc ? `${desc}[${name}]` : name} : undefined
  if (rowid !== previous) { syncColumns(); recoverySession.value?.clearMessage(); void nextTick(loadAll) }
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
  recoverySession.value = undefined
  if (!isReady) {
    table.value = undefined
    columns.value = []
    tab.value = 'deleted'
    return
  }
  const current = session.runtime
  if (!current) return
  const ownedRuntime=current
  const target = view(recoveredKey), source = view(deletedKey)
  recoverySession.value = new DataRecoverySession({
    target, source,
    owners: {table: view(tableKey), database: view(dbKey), application: view(appKey)},
    confirm,
    assertCurrent: () => {
      if (!session.isCurrent(ownedRuntime) || ownedRuntime.resolveView(recoveredKey) !== target
        || ownedRuntime.resolveView(deletedKey) !== source || target.destroyed) {
        throw new Error('数据恢复运行实例已失效')
      }
    },
    assertOperationCurrent: () => {
      if (reloadBlocked.value) throw new Error('导航已变化，请重新选择恢复记录')
      if (!session.isCurrent(ownedRuntime) || target.destroyed) throw new Error('数据恢复运行实例已失效')
    },
    isCurrentTable: tableId => !reloadBlocked.value && !target.destroyed
      && session.isCurrent(ownedRuntime) && ownedRuntime.resolveView(recoveredKey) === target && table.value?.rowid === tableId,
  })
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

async function confirm(text: string): Promise<boolean> {
  return pageService.showConfirm(text, '提示', {type: 'warning'})
}
</script>

<style scoped>
.recovery-page {padding: 8px}
</style>
