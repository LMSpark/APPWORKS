<!--
@module app:views/features/application/application-context/ui/application-database-relations-content
职责：应用关联数据库的业务内容：列出所给应用已关联的数据库，从可选数据库中添加关联，删除非默认关联。
边界：消费宿主提供的PageRuntime中93DF场景正式DataView；新增与删除经DataSet保存，默认数据库(isRef=0)不可删除。应用身份只来自sysid属性。
AI用途：关联数据库页与应用管理弹窗复用本组件；迁移时核对sysid来源、候选视图输入参数与关联记录写入字段。
-->
<template>
  <div class="database-relations-content">
    <p v-if="message" role="alert">{{ message }}</p>
    <RendererButton v-if="receiptBatch" label="核验原提交" :disabled="busy" @click="verifyOriginal" />
    <RendererTable v-if="currentTarget" :data-view-key="relationKey" :children="relationFields" :toolbar="toolbar" :stripe="true"
      :highlight-current-row="true" :show-data-view-meta="false" />
    <RendererDialog v-if="choosing" :model-value="true" title="选择数据库" width="min(1200px, 94vw)" :append-to-body="true"
      :close-disabled="busy" @update:model-value="choosing = false">
      <RendererTable :data-view-key="candidateKey" :children="candidateFields" :actions="candidateActions"
        :stripe="true" :show-data-view-meta="false" />
      <template #footer><RendererButton label="取消" :disabled="busy" @click="choosing = false" /></template>
    </RendererDialog>
  </div>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref, watch} from 'vue'
import {buildDataViewKey, RequestState, type DataRow, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import {PAGE_RUNTIME, RendererButton, RendererDialog, RendererTable, useSparkComponent, type RToolbarProps, consumeRequiredPageService} from '@spark-appworks/spark-component'

const props = defineProps<{sysid: string}>()
const scenarioId = '93DF05182084B1F0E8DA7283E83BBE0C'
const key = (model: string) => buildDataViewKey(model, 'default', scenarioId)
const databaseKey = key('_base_dbInfo'), relationKey = key('Base_AppAndSource_Relation'), candidateKey = key('db_relation_sel')
const {sparkConsume} = useSparkComponent({type: 'application-database-relations-content'})
const pageService = consumeRequiredPageService(sparkConsume, 'application-database-relations-content')

const busy = ref(false), choosing = ref(false), message = ref(''), revision = ref(0)
const view = (dataViewKey: string): DataView => {
  const found = sparkConsume(PAGE_RUNTIME)?.resolveView(dataViewKey)
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
  {type: 'r-text', props: {field: 'conName', label: '数据库名', readonly: true, minWidth: 160, showOverflowTooltip: true}},
  {type: 'r-text', props: {field: 'cnName', label: '数据库中文名', readonly: true, minWidth: 180, showOverflowTooltip: true}},
  fromDatabase('ServerName', '服务器地址', 180), fromDatabase('Port', '端口', 100), fromDatabase('Type', '类型', 100),
  fromDatabase('SchemaName', '架构名称', 120), fromDatabase('Remark', '备注', 200),
]
const candidateText = (field: string, label: string, minWidth = 120): SparkNode =>
  ({type: 'r-text', props: {field, label, readonly: true, minWidth, sortable: false, showOverflowTooltip: true}})
const candidateFields: SparkNode[] = [candidateText('Name', '数据库名', 180), candidateText('Remark', '描述', 220),
  candidateText('Port', '端口', 100), candidateText('Type', '类型', 100)]

const current = computed(() => {revision.value; return view(relationKey).currentRow})
let active = true

function isCurrentTarget(relations: DataView, sysid = props.sysid): boolean {
  return active && !relations.destroyed && !!sysid && props.sysid === sysid && relations.queryContext['sysid'] === sysid
}

const currentTarget = computed(() => {revision.value; return isCurrentTarget(view(relationKey))})
const writeBlocked = computed(() => {
  revision.value
  const relations = view(relationKey)
  return busy.value || relations.mutating || relations.hasUnconfirmedSave || !currentTarget.value
})
const receiptBatch = computed(() => {
  revision.value
  const relations = view(relationKey), journal = relations.dataSet?.saveJournal
  const [record] = journal?.views ?? []
  return currentTarget.value && relations.hasUnconfirmedSave && journal?.currentRecoverableAction === 'verify-original-receipt'
    && journal.views.length === 1 && record?.state === 'unknown' && record.ids.length === 1
    && record.tableName === relations.tableName && record.viewId === relations.viewId ? journal.batchId : null
})
const toolbar = computed<RToolbarProps>(() => ({children: [
  {type: 'r-button', props: {label: '添加', buttonType: 'primary', disabled: writeBlocked.value, onClick: openChoose}},
  {type: 'r-button', props: {label: '删除', buttonType: 'danger', onClick: remove,
    disabled: writeBlocked.value || !current.value || Number(current.value['isRef']) === 0}},
]}))
const candidateActions = computed<RToolbarProps>(() => ({children: [{type: 'r-button', props: {
  label: '选择', buttonType: 'primary', link: true, disabled: writeBlocked.value, onClick: choose}}]}))

let stops: (() => void)[] = []
function unbind(): void { for (const stop of stops) stop(); stops = [] }
function listen(target: DataView): void {
  const bump = () => {revision.value++}
  for (const event of ['currentRowChanged', 'rowsChanged', 'cleared', 'configChanged', 'mutatingChanged'] as const) {
    target.events.on(event, bump); stops.push(() => target.events.off(event, bump))
  }
}
async function loadRelations(): Promise<void> {
  const relations = view(relationKey), sysid = props.sysid
  message.value = ''
  if (!sysid) { message.value = '缺少应用系统身份，无法读取关联数据库'; return }
  if (busy.value || relations.mutating || relations.hasUnconfirmedSave) {
    message.value = !isCurrentTarget(relations) ? '请返回原应用核验关联提交'
      : relations.hasUnconfirmedSave ? '原关联提交结果未知，待核验' : '原关联提交正在处理'
    return
  }
  relations.queryContext = {sysid}
  try {
    await relations.refresh()
    if (isCurrentTarget(relations, sysid) && relations.loadingError) throw relations.loadingError
  } catch (cause) {
    if (isCurrentTarget(relations, sysid)) message.value = `获取已关联数据库列表失败：${failure(cause)}`
  }
}
/** 嵌入其他页时宿主未装载数据库信息，首次使用时读取；已装载则复用。 */
async function loadDatabases(): Promise<void> {
  const databases = view(databaseKey)
  if (databases.requestState !== RequestState.Idle) return
  await databases.refresh()
  if (databases.loadingError) message.value = `获取数据库信息失败：${databases.loadingError.message}`
}
onMounted(() => {
  try {
    listen(view(relationKey)); listen(view(databaseKey))
    void loadDatabases()
    void loadRelations()
  } catch (cause) { message.value = failure(cause) }
})
watch(() => props.sysid, () => {
  choosing.value = false
  void loadRelations()
})
onBeforeUnmount(() => {active = false; unbind()})

async function openChoose(): Promise<void> {
  if (writeBlocked.value) return
  const candidates = view(candidateKey)
  const conids = view(relationKey).rows.map(row => text(row, 'conid')).filter(Boolean)
  candidates.queryContext = {conidsArray: conids, database: 'database', sysid: props.sysid}
  choosing.value = true
  await candidates.refresh()
}

/** 一次关联记录提交：保存范围仅本记录，失败且结果明确时丢弃本地变更。 */
async function commit(relations: DataView, id: string | number): Promise<void> {
  const dataSet = relations.dataSet
  if (!dataSet) throw new Error('关联视图缺少DataSet')
  try {
    await dataSet.saveRecord(relations, id)
  } catch (cause) {
    if (!relations.hasUnconfirmedSave) relations.discardPendingChanges([id])
    throw cause
  }
}

async function reportReadback(relations: DataView, operation: '关联' | '删除' | '原关联提交', sysid: string): Promise<void> {
  if (!isCurrentTarget(relations, sysid)) return
  try {
    const result = await relations.requestRefresh({defer: false})
    if (result.refreshStatus !== 'read') throw new Error(result.message ?? '目录未完成读取')
    if (isCurrentTarget(relations, sysid)) message.value = operation === '原关联提交' ? '原关联提交已确认' : `${operation}成功`
  } catch (cause) {
    if (isCurrentTarget(relations, sysid)) message.value = `${operation}已确认，关联列表回读失败：${failure(cause)}`
  }
}

async function verifyOriginal(): Promise<void> {
  const relations = view(relationKey), dataSet = relations.dataSet
  const batchId = receiptBatch.value, sysid = props.sysid
  if (busy.value || !dataSet || !batchId || !isCurrentTarget(relations, sysid)) return
  busy.value = true
  try {
    const result = await dataSet.verifySaveJournalAndRead({batchId, receiptViews: [relations], readbackViews: [], discardNotApplied: true})
    if (!isCurrentTarget(relations, sysid)) return
    if (result.settlement === 'confirmed') await reportReadback(relations, '原关联提交', sysid)
    else if (result.settlement === 'not-applied') {
      message.value = result.draftCleanup === 'discarded' ? '原关联提交未生效，已撤销原草稿' : '原关联提交未生效，草稿仍保留'
    } else message.value = result.verificationError ? `原关联提交仍待核验：${result.verificationError.message}` : '原关联提交仍待核验'
  } catch (cause) {
    if (isCurrentTarget(relations, sysid)) message.value = `原关联提交核验失败：${failure(cause)}`
  } finally {
    busy.value = false
    revision.value++
  }
}

async function choose(row: DataRow): Promise<void> {
  const relations = view(relationKey), conid = text(row, 'Id'), sysid = props.sysid
  if (writeBlocked.value || !conid) return
  if (relations.addActionState() !== 'enabled') { message.value = '当前无新增数据库关联的权限'; return }
  busy.value = true; message.value = ''
  try {
    const created = await relations.addRow({conid, type: 'database', sysid,
      conName: text(row, 'Name'), cnName: text(row, 'Remark'), isRef: 1})
    const pk = relations.getPkKey(created)
    if (pk === undefined) throw new Error('关联记录新增缺少正式行身份')
    await commit(relations, pk)
    choosing.value = false
    await reportReadback(relations, '关联', sysid)
  } catch (cause) {
    if (relations.hasUnconfirmedSave) choosing.value = false
    if (isCurrentTarget(relations, sysid)) message.value = relations.hasUnconfirmedSave ? '关联结果未知，原提交待核验' : `添加数据库关联失败：${failure(cause)}`
  } finally {
    busy.value = false
    revision.value++
  }
}

async function remove(): Promise<void> {
  const relations = view(relationKey), row = relations.currentRow, sysid = props.sysid
  const id = row ? relations.getPkKey(row) : undefined
  if (writeBlocked.value || !row || id === undefined) return
  if (Number(row['isRef']) === 0) { message.value = '默认数据库不可删除'; return }
  if (relations.deleteActionState(row) !== 'enabled') { message.value = '当前无删除该关联的权限'; return }
  busy.value = true; message.value = ''
  try {
    const originalRead = relations.captureReadRow(row, ['sysid', 'isRef'])
    const confirmed = await pageService.showConfirm(`确定要删除数据库关联"${text(row, 'conName')}"吗？`, '删除确认', {type: 'warning'})
    if (!confirmed || !isCurrentTarget(relations, sysid)) return
    originalRead()
    await relations.removeRow(id)
    await commit(relations, id)
    await reportReadback(relations, '删除', sysid)
  } catch (cause) {
    if (isCurrentTarget(relations, sysid)) message.value = relations.hasUnconfirmedSave ? '删除结果未知，原提交待核验' : `删除数据库关联失败：${failure(cause)}`
  } finally {
    busy.value = false
    revision.value++
  }
}
</script>

<style scoped>
.database-relations-content {display: grid; gap: 16px}
</style>
