<!--
@module app:views/features/application/enterprise-app-auth-application/ui/apply-app-auth-content
职责：列出其他企业已发布的应用（C06D 应用主表常驻范围：已发布且排除本企业发布），按行发起应用授权申请。
边界：列表、关键字筛选与分页均由绑定DataView承接；申请在 0221 的 enterprise_app_auth 视图新增一行并只提交该行，取消或明确失败撤销新增。
-->
<template>
  <div class="apply-app-auth" :class="{'apply-app-auth--embedded': embedded}">
    <p v-if="loading" role="status">正在读取已发布应用…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <RendererButton v-if="error && !loading && !ready" label="重试" @click="load" />
    <RendererTable v-if="ready" :data-view-key="publishedKey" :children="fields" :filter="filter" :actions="actions"
      :auto-columns="false" :stripe="true" :show-row-index="true" :show-data-view-meta="false"
      :pagination="{pageSizes: [10, 20]}" />
    <RendererDialog v-if="applyId !== undefined" :model-value="true" title="申请应用授权" :width="520" :append-to-body="true"
      :close-disabled="busy" @update:model-value="cancelApply">
      <p class="apply-app-auth__app">应用：{{ applyName }}</p>
      <p v-if="applyError" role="alert">{{ applyError }}</p>
      <RendererForm :data-view-key="authKey" :context-row-id="applyId" :auto-columns="false" :show-data-view-meta="false" :grid-columns="1">
        <FieldTextarea field="review_comment" label="申请说明" :rows="4" :maxlength="500" :show-word-limit="true"
          placeholder="请填写申请说明（可选）" />
      </RendererForm>
      <template #footer>
        <RendererButton label="取消" :disabled="busy" @click="cancelApply" />
        <RendererButton label="提交申请" button-type="primary" :disabled="busy || unconfirmed" @click="submitApply" />
      </template>
    </RendererDialog>
  </div>
</template>

<script setup lang="ts">
import {computed, onBeforeUnmount, onMounted, ref} from 'vue'
import {ElMessage} from 'element-plus'
import {buildDataViewKey, type DataRow, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import * as Components from '@spark-appworks/spark-component'
import {APP_AUTH_SCENARIOS, commitAppAuthRecord, readAppAuthSession} from '../model/enterprise-app-auth-application-model'
const {PAGE_RUNTIME, RendererButton, RendererDialog, RendererForm, RendererTable, FieldTextarea, useSparkComponent} = Components

const props = defineProps<{
  /** 嵌入“我的申请”对话框时缩小高度；提交成功只通知宿主，由宿主刷新。 */
  embedded?: boolean
}>()
const emit = defineEmits<{applied: []}>()
const {sparkConsume} = useSparkComponent({type: 'apply-app-auth-content'})
const publishedKey = buildDataViewKey('Base_AppSystemList', 'published', APP_AUTH_SCENARIOS.review)
const authKey = buildDataViewKey('enterprise_app_auth', 'default', APP_AUTH_SCENARIOS.apply)

function resolve(key: string): DataView {
  const view = sparkConsume(PAGE_RUNTIME)?.resolveView(key)
  if (!view) throw new Error(`申请应用授权缺少数据视图 ${key}`)
  return view
}
const published = resolve(publishedKey), auths = resolve(authKey)
const loading = ref(false), ready = ref(false), busy = ref(false), error = ref(''), applyError = ref('')
const applyId = ref<string | number>(), applyName = ref(''), revision = ref(0)
const bump = () => {revision.value++}
const events = ['rowsChanged', 'editingChanged', 'requestStateChanged'] as const
const unconfirmed = computed(() => {
  revision.value
  return auths.hasUnconfirmedSave
})

const fields: SparkNode[] = [
  {type: 'r-text', props: {field: 'displayName', label: '应用名称', readonly: true, minWidth: 240, sortable: false, showOverflowTooltip: true}},
  {type: 'r-text', props: {field: 'publisher_ent', label: '发布企业', readonly: true, width: 140, sortable: false, showOverflowTooltip: true, emptyText: '-'}},
  {type: 'r-text', props: {field: 'Memo', label: '备注', readonly: true, minWidth: 160, sortable: false, showOverflowTooltip: true}},
]
const filter: Components.RFilterProps = {
  autoQuery: false, queryOnReset: true, firstPageOnSearch: true, showExpressionEditor: false, showDataViewMeta: false,
  children: [{type: 'r-text', props: {field: 'AppName', label: '应用名称', placeholder: '搜索应用名称', filterTrim: true, clearable: true,
    filterAlternatives: [{field: 'AppDesc', operator: 'contains'}, {field: 'AppName', operator: 'contains'}]}}],
}
const canApply = ({row}: {row?: DataRow | null}) => Boolean(row && readText(published, row, 'rowid')
  && !auths.hasUnconfirmedSave && auths.addActionState() === 'enabled')
const actions = computed(() => {
  revision.value
  return {wrap: false, gap: 4, children: [
    {type: 'r-button', props: {dataViewKey: publishedKey, label: '申请', link: true, buttonType: 'primary', onBeforeRender: canApply, onClick: openApply}},
  ]}
})

function readText(view: DataView, row: DataRow, field: string): string {
  const value = row[field]
  if (view.fieldAccess(row, field).read !== 'visible' || (typeof value !== 'string' && typeof value !== 'number')) return ''
  return String(value).trim()
}
/** 每次挂载按当前会话重读列表与新增视图；新增视图常驻 id 为空，只取得正式新增身份。 */
async function load(): Promise<void> {
  loading.value = true; error.value = ''
  try {
    if (auths.hasEditingChanges() || auths.dirtyTracking.hasPendingChanges() || auths.hasUnconfirmedSave) throw new Error('上一次申请尚未提交或取消')
    const {entShortName} = readAppAuthSession()
    published.queryContext = {...published.queryContext, entShortName}
    published.page = 1
    await Promise.all([published.refresh(), auths.refresh()])
    const failed = [published, auths].find(view => view.loadingError)
    if (failed?.loadingError) throw failed.loadingError
    ready.value = true
  } catch (cause) {
    error.value = `已发布应用读取失败：${cause instanceof Error ? cause.message : String(cause)}`
  } finally {
    loading.value = false
  }
}
onMounted(() => {
  for (const view of [published, auths]) for (const event of events) view.events.on(event, bump)
  void load()
})
onBeforeUnmount(() => {
  for (const view of [published, auths]) for (const event of events) view.events.off(event, bump)
})

async function openApply(row: DataRow): Promise<void> {
  if (busy.value || applyId.value !== undefined) return
  busy.value = true; error.value = ''; applyError.value = ''
  try {
    if (auths.hasUnconfirmedSave) throw new Error('上一次申请结果未知，请刷新核对')
    const appId = readText(published, row, 'rowid')
    if (!appId) throw new Error('缺少应用 ID')
    const {userId} = readAppAuthSession()
    const added = await auths.addRow({app_id: appId, operator: userId})
    const id = auths.getPkKey(added)
    if (id === undefined || id === '') throw new Error('新增申请缺少原生身份')
    applyName.value = readText(published, row, 'displayName') || appId
    applyId.value = id
  } catch (cause) {
    error.value = `申请无法打开：${cause instanceof Error ? cause.message : String(cause)}`
  } finally {
    busy.value = false
  }
}
/** 结果未知时只关闭对话框并保留待核对状态，不撤销也不允许再次提交。 */
function cancelApply(): void {
  const id = applyId.value
  if (busy.value || id === undefined) return
  if (unconfirmed.value) error.value = applyError.value
  else auths.discardPendingChanges([id])
  applyId.value = undefined; applyError.value = ''
}
async function submitApply(): Promise<void> {
  const id = applyId.value
  if (busy.value || id === undefined) return
  busy.value = true; applyError.value = ''
  try {
    await commitAppAuthRecord(auths, id)
    ElMessage.success('已提交申请，等待审批')
    applyId.value = undefined
    await auths.refresh()
    emit('applied')
    if (!props.embedded) await published.refresh()
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    if (auths.hasUnconfirmedSaveFor([id])) applyError.value = message
    else {applyId.value = undefined; error.value = message}
  } finally {
    busy.value = false; bump()
  }
}
</script>

<style scoped>
.apply-app-auth {display: grid; gap: 12px}
.apply-app-auth--embedded {min-height: 480px}
.apply-app-auth__app {margin: 0 0 12px; font-weight: 500}
</style>
