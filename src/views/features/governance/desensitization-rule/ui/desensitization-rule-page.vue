<!--
@module app:views/features/governance/desensitization-rule/ui/desensitization-rule-page
职责：脱敏规则列表、筛选、单条维护和样例计算。
边界：规则及字典均来自本次PageRuntime，修改和原保存核验只经所属DataView/DataSet。
-->
<template>
  <RendererSection title="脱敏规则列表" :bordered="false" :grid-columns="1" :grid-gap="16"
    :status="loading ? '正在读取脱敏规则…' : reloadBlocked ? '请先处理原操作，再切换导航。' : ''"
    :error="error || message" :retryable="!loading && !ready" @retry="loadCurrentRoute">
    <RendererButton v-if="reloadBlocked" label="切换到当前导航" :disabled="hasPending()" @click="loadCurrentRoute" />
    <SparkPageRenderer v-if="runtime && host" :page-runtime="runtime" :route-snapshot="routeSnapshot" :host="host" :auto-load="false" />
  </RendererSection>
</template>

<script setup lang="ts">
import {computed, ref, shallowRef} from 'vue'
import {onBeforeRouteLeave, onBeforeRouteUpdate, useRoute} from 'vue-router'
import {useSystemPageDirtySource} from '@spark-appworks/spark-app'
import {buildDataViewKey, isDataRow, type DataRow, type DataView} from '@spark-appworks/spark-data'
import {RendererButton, RendererSection, SparkComponentRenderer, SparkPageRenderer, useSparkComponent, consumeRequiredPageService} from '@spark-appworks/spark-component'
import {PageTool} from '@spark-appworks/spark-project-model'
import {useFeaturePageRuntime} from '@/views/features/shared/runtime/use-feature-page-runtime'
import FeatureRecordDialog from '@/views/features/shared/record/feature-record-dialog.vue'
import RuleDeleteDialog from './desensitization-rule-delete.vue'
import {buildRuleSample} from './desensitization-rule-sample'
import rule from './tool/rule.json?raw'
import script from './tool/script.js?raw'
import style from './tool/style.css?raw'

const scenarioId = '3A45C53F29C2C005FF21AA06B2BCA133'
const categoryKey = buildDataViewKey('脱敏分类', 'default', scenarioId)
const globalKey = buildDataViewKey('脱敏全局替换', 'default', scenarioId)
const {sparkConsume} = useSparkComponent({type: 'desensitization-rule-page'})
const pageService = consumeRequiredPageService(sparkConsume, 'desensitization-rule-page')
const {viewKey, session, ready, loading, error, reloadBlocked, loadCurrentRoute} = useFeaturePageRuntime({
  scenarioId, modelName: 'Base_Desensitization_Rule', componentType: 'desensitization-rule-page', title: '脱敏规则列表',
  optionModels: ['脱敏分类', '脱敏全局替换'], preserveRuntime: () => hasPending(),
  tool: pageId => {
    const tool = new PageTool({pageId})
    tool.hydrateFileText('rule.json', rule)
    tool.hydrateFileText('script.js', script)
    tool.hydrateFileText('style.css', style)
    tool.markLoaded()
    return tool
  },
})
type Dialog = Readonly<{kind: 'edit'; id: string | number; created: boolean; epoch: number}>
  | Readonly<{kind: 'delete'; id: string | number; epoch: number}>
const dialog = shallowRef<Dialog>()
const deletion = shallowRef<{owner: Dialog; target: InstanceType<typeof RuleDeleteDialog>}>()
const busy = ref(false), message = ref(''), revision = ref(0)
let epoch = 0
function hasPending(): boolean { return busy.value || session.runtime?.isDirty === true }
useSystemPageDirtySource({get isDirty() {return hasPending()}})
onBeforeRouteLeave(() => !hasPending())
onBeforeRouteUpdate(() => !hasPending())

function view(key: string): DataView {
  const found = session.runtime?.resolveView(key)
  if (!found) throw new Error(`脱敏规则缺少正式视图 ${key}`)
  return found
}
const list = () => view(viewKey.value)
const unconfirmed = computed(() => {void revision.value; return ready.value && list().hasUnconfirmedSave})
function assertSettled(): void {
  const target = list()
  if (target.hasUnconfirmedSave) throw new Error('原保存结果待核验，不能重复操作')
  if (target.mutating || target.hasPendingSavedRowPermissions || target.hasEditingChanges() || target.dirtyTracking.hasPendingChanges()) {
    throw new Error('存在待处理的记录修改')
  }
}
const failure = (cause: unknown) => cause instanceof Error ? cause.message : String(cause)
async function guarded(action: () => Promise<void>): Promise<void> {
  if (busy.value) return
  busy.value = true; message.value = ''
  try {await action()} catch (cause) {message.value = failure(cause)} finally {busy.value = false; revision.value++}
}
const runtime = computed(() => ready.value ? session.runtime : undefined)
const route = useRoute()
const routeSnapshot = computed(() => {
  const {path, fullPath, name, params, query, hash} = route
  return {path, fullPath, name: name ?? null, params, query, hash}
})
const host = computed(() => {
  const current = runtime.value
  if (!current) return undefined
  const assertCurrent = () => {if (!session.isCurrent(current)) throw new Error('脱敏规则运行实例已失效')}
  return {runtime: current, assertCurrent, async invoke(command: string, input: unknown) {
    assertCurrent()
    if (command === 'rules.connect') return {
      node: SparkComponentRenderer,
      editor: FeatureRecordDialog,
      deleteDialog: RuleDeleteDialog,
      capture: (kind: Dialog['kind']) => {
        const opened = dialog.value
        if (!opened || opened.kind !== kind) return undefined
        const isCurrent = () => session.isCurrent(current) && dialog.value === opened
        const common = {key: opened.epoch, dataViewKey: viewKey.value, recordId: opened.id,
          onClose: () => isCurrent() ? closeDialog() : undefined}
        if (opened.kind === 'edit') return {...common, created: opened.created,
          validate: (row: Readonly<DataRow>) => isCurrent() ? validateRule(opened, row) : '原规则编辑实例已失效'}
        return {...common, bind: (target: InstanceType<typeof RuleDeleteDialog> | null) => {
          if (isCurrent()) deletion.value = target ? {owner: opened, target} : undefined
        }}
      },
      deletion: () => deletion.value?.owner === dialog.value && session.isCurrent(current) ? deletion.value?.target : undefined,
      locked: () => reloadBlocked.value || busy.value || !!dialog.value || unconfirmed.value,
      canEdit: (row: DataRow | null | undefined) => !!row && list().editActionState(row) === 'enabled',
      canDelete: (row: DataRow | null | undefined) => !!row && list().deleteActionState(row) === 'enabled',
      verification: () => ({visible: !dialog.value && unconfirmed.value, disabled: busy.value}),
    }
    if (command === 'rules.verify' && unconfirmed.value && !dialog.value) return await verifySave()
    if (reloadBlocked.value || busy.value || dialog.value || unconfirmed.value) return undefined
    if (command === 'rules.create') return await create()
    if (!isDataRow(input) || !list().rows.includes(input)) return undefined
    if (command === 'rules.edit') openEdit(input)
    if (command === 'rules.remove') openDelete(input)
    return undefined
  }}
})

function selectedOption(key: string, value: unknown): boolean {
  if ((typeof value !== 'string' || value === '') && (typeof value !== 'number' || !Number.isFinite(value))) return false
  const options = view(key)
  options.captureReadResult()()
  const matches = options.rows.filter(row => options.fieldAccess(row, 'val').read === 'visible'
    && options.fieldAccess(row, 'txt').read === 'visible'
    && (typeof row['val'] === 'string' || typeof row['val'] === 'number') && String(row['val']) === String(value))
  if (matches.length > 1) throw new Error('字典选项编码不唯一')
  return matches.length === 1
}
function validateRule(current: Extract<Dialog, {kind: 'edit'}>, row: Readonly<DataRow>): string | undefined {
  try {
    if (!selectedOption(categoryKey, row['type'])) return '请选择有效的分类'
    if (!current.created && !selectedOption(globalKey, row['is_gabale'])) return '请选择有效的全局匹配方式'
    if (!current.created && row['is_gabale'] !== '0' && row['is_gabale'] !== '1'
      && row['is_gabale'] !== 0 && row['is_gabale'] !== 1) return '不支持的全局匹配值'
    const sample = buildRuleSample({regex: row['regex'], template: row['template'], original: row['original_sample'],
      global: !current.created && (row['is_gabale'] === '1' || row['is_gabale'] === 1)})
    if (sample.error) return sample.error
    if (row['desensitized_sample'] !== sample.sample) list().updateEditingValue(current.id, 'desensitized_sample', sample.sample)
    return undefined
  } catch (cause) {return failure(cause)}
}
const create = () => guarded(async () => {
  assertSettled()
  const target = list()
  if (target.addActionState() !== 'enabled') throw new Error('当前查询不允许新增脱敏规则')
  const row = await target.addRow({})
  const id = target.getPkKey(row)
  if (id === undefined) throw new Error('新增脱敏规则缺少原生身份')
  dialog.value = {kind: 'edit', id, created: true, epoch: ++epoch}
})
function openEdit(row: DataRow): void {
  try {
    assertSettled()
    const target = list(), id = target.getPkKey(row)
    if (id === undefined || target.editActionState(row) !== 'enabled') throw new Error('原规则身份或编辑权限已失效')
    dialog.value = {kind: 'edit', id, created: false, epoch: ++epoch}
  } catch (cause) {message.value = failure(cause)}
}
async function closeDialog(): Promise<void> {
  dialog.value = undefined
  deletion.value = undefined
  await guarded(async () => {
    if (list().hasUnconfirmedSave || list().dirtyTracking.hasPendingChanges()) return
    await list().refresh()
    if (list().loadingError) throw list().loadingError
  })
}
function openDelete(row: DataRow): void {
  try {
    assertSettled()
    const target = list(), id = target.getPkKey(row)
    if (id === undefined || target.deleteActionState(row) !== 'enabled') throw new Error('原规则身份或删除权限已失效')
    dialog.value = {kind: 'delete', id, epoch: ++epoch}
  } catch (cause) {message.value = failure(cause)}
}
const verifySave = () => guarded(async () => {
  const target = list()
  if (!target.hasUnconfirmedSave) throw new Error('没有待核验的原保存')
  const owner = target.dataSet
  if (!owner) throw new Error('脱敏规则缺少所属数据空间')
  const result = await owner.verifySaveJournal()
  const original = result.views.find(item => item.tableName === target.tableName && item.viewId === target.viewId)
  if (original?.state !== 'applied') throw new Error(original?.originalError?.message ?? '原保存结果仍未确认')
  await target.refresh()
  if (target.loadingError) throw target.loadingError
  pageService.showMessage('原保存结果已确认', 'success')
})
</script>
