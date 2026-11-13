<!--
@module app:views/features/application/enterprise-regist-manager/ui/enterprise-app-auth-dialog
职责：按企业维护应用授权与已授权应用的模块授权：应用列表为主表，授权状态/时间/说明按 app_id 从授权记录视图查值显示。
边界：授权、撤销经 enterprise_app_auth 视图新增/修改并只提交本次记录；模块授权新增、取消删除 enterprise_module_auth 记录。
  模块树随所选应用经数据空间查询级联加载；页面不合并数组，不按身份放行，操作可用性只消费原查询权限。
-->
<template>
  <RendererDialog :model-value="true" :title="title" :width="1080" :append-to-body="true" :close-disabled="busy || unconfirmed"
    @update:model-value="close">
    <p v-if="loading" role="status">正在读取应用授权…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <template v-if="ready">
      <RendererTable :data-view-key="appKey" :children="appFields" :actions="appActions" :auto-columns="false" :stripe="true"
        :highlight-current-row="true" :show-data-view-meta="false" :pagination="{pageSizes: [10]}" />
      <RendererSection title="模块授权" :bordered="true">
        <p v-if="!currentApp" role="status">请选择已授权的应用后进行模块授权。</p>
        <p v-else-if="!currentAuthorized" role="status">请先完成应用授权（生效）后再进行模块授权</p>
        <RendererTable v-else :data-view-key="navigationKey" :children="moduleFields" :actions="moduleActions" :auto-columns="false"
          :show-data-view-meta="false" :show-pagination="false" />
      </RendererSection>
    </template>
    <RendererDialog v-if="revokeId" :model-value="true" title="撤销应用授权" :width="480" :append-to-body="true" :close-disabled="busy"
      @update:model-value="cancelRevoke">
      <RendererForm :data-view-key="authKey" :context-row-id="revokeId" :auto-columns="false" :show-data-view-meta="false" :grid-columns="1">
        <FieldTextarea field="description" label="撤销说明" :autosize="{minRows: 3, maxRows: 6}" placeholder="请输入撤销说明" />
      </RendererForm>
      <template #footer>
        <RendererButton label="取消" :disabled="busy" @click="cancelRevoke" />
        <RendererButton label="确定撤销" button-type="danger" :disabled="busy" @click="confirmRevoke" />
      </template>
    </RendererDialog>
    <template #footer>
      <RendererButton label="关闭" :disabled="busy || unconfirmed" @click="close" />
    </template>
  </RendererDialog>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref} from 'vue'
import {ElMessage, ElMessageBox} from 'element-plus'
import {buildDataViewKey, type DataRow, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import * as Components from '@spark-appworks/spark-component'
const {PAGE_RUNTIME, RendererDialog, RendererSection, RendererTable, RendererForm, RendererButton, FieldTextarea, useSparkComponent} = Components
const props = defineProps<{scenarioId: string; recordId: string; shortName: string; title: string}>()
const emit = defineEmits<{close: []}>()
const {sparkConsume} = useSparkComponent({type: 'enterprise-app-auth-dialog'})
const appKey = buildDataViewKey('Base_AppSystemList', 'default', props.scenarioId)
const authKey = buildDataViewKey('enterprise_app_auth', 'default', props.scenarioId)
const navigationKey = buildDataViewKey('Base_NavigationInfo', 'default', props.scenarioId)
const moduleKey = buildDataViewKey('enterprise_module_auth', 'default', props.scenarioId)
const ROOT_PARENT = '000000'

function resolve(key: string): DataView {
  const view = sparkConsume(PAGE_RUNTIME)?.resolveView(key)
  if (!view) throw new Error(`应用授权缺少数据视图 ${key}`)
  return view
}
const apps = resolve(appKey), auths = resolve(authKey), navigation = resolve(navigationKey), modules = resolve(moduleKey)
const loading = ref(true), ready = ref(false), busy = ref(false), error = ref(''), revision = ref(0), revokeId = ref('')
const bump = () => {revision.value++}
const watched = [apps, auths, navigation, modules]
const events = ['rowsChanged', 'currentRowChanged', 'editingChanged', 'requestStateChanged'] as const

type AuthLookup = Readonly<{label: string; optionLabelField: string; unmatchedText: string; width?: number}>
const lookup = ({width, ...column}: AuthLookup): SparkNode => ({type: 'r-select', props: {
  ...column, field: 'rowid', readonly: true, align: 'center', sortable: false, optionDataViewKey: authKey, optionValueField: 'app_id',
  ...(width === undefined ? {minWidth: 180, showOverflowTooltip: true} : {width}),
}})
const appFields: SparkNode[] = [
  {type: 'r-text', props: {field: 'displayName', label: '应用名称', readonly: true, minWidth: 260, sortable: false, showOverflowTooltip: true}},
  lookup({label: '授权状态', optionLabelField: 'authStatusText', unmatchedText: '未授权', width: 120}),
  lookup({label: '授权时间', optionLabelField: 'authorizedAtText', unmatchedText: '-', width: 170}),
  lookup({label: '说明', optionLabelField: 'descriptionText', unmatchedText: '-'}),
]
const moduleFields: SparkNode[] = [
  {type: 'r-text', props: {field: 'FunName', label: '模块/页面名称', readonly: true, width: 320, sortable: false}},
  {type: 'r-select', props: {field: 'rowid', label: '授权状态', readonly: true, width: 100, align: 'center', sortable: false,
    optionDataViewKey: moduleKey, optionValueField: 'nav_id', optionLabelField: 'authStatusText', unmatchedText: '未授权'}},
]

function readText(view: DataView, row: DataRow, field: string): string {
  const value = row[field]
  if (view.fieldAccess(row, field).read !== 'visible' || (typeof value !== 'string' && typeof value !== 'number')) return ''
  return String(value).trim()
}
function pk(view: DataView, row: DataRow): string {
  const id = view.getPkKey(row)
  if (id === undefined || id === '') throw new Error('授权记录缺少原生身份')
  return String(id)
}
function recordOf(view: DataView, field: string, key: string): DataRow | undefined {
  const matches = view.rows.filter(row => readText(view, row, field) === key)
  if (matches.length > 1) throw new Error('授权记录不唯一，请联系管理员核对数据')
  return matches[0]
}
function isAuthorized(row: DataRow | undefined): boolean {
  return row !== undefined && readText(auths, row, 'authorized') === '1'
}
const authOf = (app: DataRow) => recordOf(auths, 'app_id', readText(apps, app, 'rowid'))
const currentApp = computed(() => {
  revision.value
  return apps.currentRow ?? undefined
})
const currentAuthorized = computed(() => {
  revision.value
  const app = currentApp.value
  try { return app ? isAuthorized(authOf(app)) : false } catch { return false }
})
const unconfirmed = computed(() => {
  revision.value
  return auths.hasUnconfirmedSave || modules.hasUnconfirmedSave
})

const canAuthorize = ({row}: {row?: DataRow | null}) => {
  if (!row || !readText(apps, row, 'rowid')) return false
  try {
    const record = authOf(row)
    if (isAuthorized(record)) return false
    return record ? auths.fieldAccess(record, 'authorized').write === 'allowed' : auths.addActionState() === 'enabled'
  } catch { return false }
}
const canRevoke = ({row}: {row?: DataRow | null}) => {
  if (!row) return false
  try {
    const record = authOf(row)
    return record !== undefined && isAuthorized(record) && auths.fieldAccess(record, 'authorized').write === 'allowed'
  } catch { return false }
}
const isModuleNode = (row: DataRow) => readText(navigation, row, 'rowid') !== '' && readText(navigation, row, 'prowid') !== ROOT_PARENT
const moduleRecordOf = (row: DataRow) => recordOf(modules, 'nav_id', readText(navigation, row, 'rowid'))
const canModuleAuthorize = ({row}: {row?: DataRow | null}) => {
  if (!row || !isModuleNode(row)) return false
  try { return moduleRecordOf(row) === undefined && modules.addActionState() === 'enabled' } catch { return false }
}
const canModuleCancel = ({row}: {row?: DataRow | null}) => {
  if (!row || !isModuleNode(row)) return false
  try {
    const record = moduleRecordOf(row)
    return record !== undefined && modules.deleteActionState(record) === 'enabled'
  } catch { return false }
}
const appActions = computed(() => {
  revision.value
  return {wrap: false, gap: 4, children: [
    {type: 'r-button', props: {dataViewKey: appKey, label: '授权', link: true, buttonType: 'primary', onBeforeRender: canAuthorize, onClick: authorize}},
    {type: 'r-button', props: {dataViewKey: appKey, label: '撤销', link: true, buttonType: 'danger', onBeforeRender: canRevoke, onClick: beginRevoke}},
  ]}
})
const moduleActions = computed(() => {
  revision.value
  return {wrap: false, gap: 4, children: [
    {type: 'r-button', props: {dataViewKey: navigationKey, label: '授权', link: true, buttonType: 'primary', onBeforeRender: canModuleAuthorize, onClick: authorizeModule}},
    {type: 'r-button', props: {dataViewKey: navigationKey, label: '取消授权', link: true, buttonType: 'danger', onBeforeRender: canModuleCancel, onClick: cancelModule}},
  ]}
})

onMounted(async () => {
  for (const view of watched) for (const event of events) view.events.on(event, bump)
  try {
    if ([auths, modules].some(view => view.hasEditingChanges() || view.dirtyTracking.hasPendingChanges() || view.hasUnconfirmedSave)) {
      throw new Error('上一次应用授权尚未保存或取消')
    }
    auths.queryContext = {...auths.queryContext, enterpriseId: props.recordId}
    modules.queryContext = {...modules.queryContext, enterpriseId: props.recordId}
    apps.page = 1
    await Promise.all([apps.refresh(), auths.refresh(), modules.refresh()])
    const failed = [apps, auths, modules].find(view => view.loadingError)
    if (failed?.loadingError) throw failed.loadingError
    ready.value = true
  } catch (cause) {
    error.value = `应用授权读取失败：${cause instanceof Error ? cause.message : String(cause)}`
  } finally {
    loading.value = false
  }
})
onBeforeUnmount(() => {
  for (const view of watched) for (const event of events) view.events.off(event, bump)
})

async function confirmed(message: string, title: string): Promise<boolean> {
  try {
    await ElMessageBox.confirm(message, title, {type: 'warning', confirmButtonText: '确定', cancelButtonText: '取消'})
    return true
  } catch {
    return false
  }
}
async function commit(view: DataView, id: string, success: string): Promise<boolean> {
  if (!view.dataSet) throw new Error('授权视图未接入数据空间')
  try {
    await view.dataSet.saveChanges({views: [{tableName: view.tableName, viewId: view.viewId, ids: [id]}]})
    ElMessage.success(success)
    await view.refresh()
    return true
  } catch (cause) {
    if (!view.hasUnconfirmedSaveFor([id])) view.discardPendingChanges([id])
    error.value = `${view.hasUnconfirmedSaveFor([id]) ? '保存结果未知，请刷新核对，不要重复操作：' : '保存失败：'}${cause instanceof Error ? cause.message : String(cause)}`
    return false
  }
}
const flag = (original: unknown, value: 0 | 1) => typeof original === 'string' ? String(value) : value
async function run(action: () => Promise<void>): Promise<void> {
  if (busy.value) return
  error.value = ''
  busy.value = true
  try { await action() } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    busy.value = false
    bump()
  }
}

function authorize(app: DataRow): Promise<void> {
  return run(async () => {
    const appId = readText(apps, app, 'rowid'), name = readText(apps, app, 'displayName')
    if (!appId) throw new Error('应用身份不可读')
    if (!await confirmed(`确定授权应用"${name || appId}"给本企业吗？`, '应用授权确认')) return
    const record = authOf(app)
    let id: string
    if (record) {
      id = pk(auths, record)
      auths.updateEditingValue(id, 'authorized', flag(record['authorized'], 1))
    } else {
      id = pk(auths, await auths.addRow({enterprise_id: props.recordId, ent_shortname: props.shortName, app_id: appId, authorized: 1}))
    }
    await commit(auths, id, '应用授权成功')
  })
}
function beginRevoke(app: DataRow): Promise<void> {
  return run(async () => {
    const record = authOf(app)
    if (!record) throw new Error('未找到应用授权记录')
    const id = pk(auths, record)
    auths.updateEditingValue(id, 'authorized', flag(record['authorized'], 0))
    revokeId.value = id
  })
}
function cancelRevoke(): void {
  if (busy.value || !revokeId.value) return
  auths.discardPendingChanges([revokeId.value])
  revokeId.value = ''
  bump()
}
function confirmRevoke(): Promise<void> {
  return run(async () => {
    const id = revokeId.value
    if (!id) return
    if (await commit(auths, id, '已撤销应用授权') || auths.hasUnconfirmedSaveFor([id])) revokeId.value = ''
  })
}
function authorizeModule(node: DataRow): Promise<void> {
  return run(async () => {
    const navId = readText(navigation, node, 'rowid'), parentId = readText(navigation, node, 'prowid')
    if (!navId) throw new Error('模块身份不可读')
    const id = pk(modules, await modules.addRow({enterprise_id: props.recordId, nav_id: navId, parent_nav_id: parentId, authorized: 1}))
    await commit(modules, id, '模块授权成功')
  })
}
function cancelModule(node: DataRow): Promise<void> {
  return run(async () => {
    const name = readText(navigation, node, 'FunName')
    if (!await confirmed(`确定取消模块"${name}"的授权吗？`, '取消模块授权')) return
    const record = moduleRecordOf(node)
    if (!record) throw new Error('未找到模块授权记录')
    const id = pk(modules, record)
    await modules.removeRow(id)
    await commit(modules, id, '已取消模块授权')
  })
}
function close(): void {
  if (busy.value || unconfirmed.value) return
  emit('close')
}
</script>
