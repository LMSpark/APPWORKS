<!--
@module app:views/platform/PlatformApps
职责：通过正式应用目录 DataView 展示应用并编排应用切换。
边界：目录数据与字段权限由 SPARK DataView 提供；本页不推导租户授权或直接读取旧目录接口。
-->
<template>
  <section class="platform-apps">
    <header class="page-toolbar">
      <div>
        <h2>应用管理</h2>
        <p>当前企业：{{ enterpriseName || '未登录' }}</p>
      </div>
      <p v-if="loading" role="status">正在读取应用目录…</p>
      <p v-if="runtimeError" role="alert">{{ runtimeError }}</p>
    </header>
    <RendererButton v-if="runtimeError && !ready" label="重新加载" :disabled="loading" @click="loadCatalog" />
    <RendererTable v-if="ready && !runtimeError" :data-view-key="catalogKey" :children="fields"
      :toolbar="toolbar" :actions="actions" :show-pagination="false" :show-data-view-meta="true"
      :stripe="true" row-key="rowid" />

    <el-dialog v-model="dialogVisible" title="新建应用" width="500px">
      <el-form :model="form" label-width="90px">
        <el-form-item label="应用 ID"><el-input v-model="form.projectId" placeholder="例如 crm" /></el-form-item>
        <el-form-item label="应用名称"><el-input v-model="form.name" placeholder="显示名称" /></el-form-item>
        <el-form-item label="图标"><el-input v-model="form.icon" placeholder="例如 Box" /></el-form-item>
        <el-form-item label="描述"><el-input v-model="form.description" type="textarea" :rows="3" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitting" @click="submitProject">创建</el-button>
      </template>
    </el-dialog>
  </section>
</template>

<script setup lang="ts">
import {computed, inject, onBeforeUnmount, onMounted, reactive, ref, shallowRef} from 'vue'
import {useRouter} from 'vue-router'
import {ElMessage, ElMessageBox} from 'element-plus'
import {getNavHomePath} from '@spark-appworks/spark-app'
import {PageRuntime} from '@spark-appworks/spark-project-model'
import {buildDataViewKey, type DataRow, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import {PAGE_RUNTIME, RendererButton, RendererTable, useSparkComponent, type RToolbarProps} from '@spark-appworks/spark-component'
import {lowcodeApi, lowcodeEnterpriseDisplayName, readLowcodePrincipal} from '@/lowcode/lowcode-runtime'
import {getFormalModelView, loadLowcodeApplicationCatalog} from '@/lowcode/lowcode-application-catalog'
import {getBuiltinScenarioResource} from '@/registries/builtin-application-registry'
import {buildTenantPath} from '@/services/tenant-scope'
import {PROJECT_SWITCH_KEY} from '@/services/project/project-shell'

const MODEL = 'Base_AppSystemList'
const {sparkProvide, sparkRemove} = useSparkComponent({type: 'platform-apps'})
const router = useRouter()
const projectSwitch = inject(PROJECT_SWITCH_KEY)
const view = shallowRef<DataView>()
const ready = ref(false), loading = ref(false), runtimeError = ref(''), submitting = ref(false), dialogVisible = ref(false)
const form = reactive({projectId: '', name: '', icon: 'Box', description: ''})
let runtime: PageRuntime | undefined
let unsubscribe: (() => void) | undefined
let active = true
let generation = 0

const enterpriseName = computed(() => {
  const enterprise = lowcodeApi.session.get()?.enterprise
  return enterprise ? lowcodeEnterpriseDisplayName(enterprise) : ''
})
const catalogScenarioId = getBuiltinScenarioResource('projectBlueprint').scenarioId
const catalogKey = buildDataViewKey(MODEL, 'catalogApps', catalogScenarioId)
const fields = computed<SparkNode[]>(() => [
  {type: 'r-text', props: {dataViewKey: catalogKey, field: 'rowid', label: '项目 ID', width: 190}},
  {type: 'r-text', props: {dataViewKey: catalogKey, field: 'AppDesc', label: '名称', displayFallbackFields: ['AppName', 'rowid'], width: 220}},
  ...(view.value?.queryColumns.some(column => column.name === 'IsSys')
    ? [{type: 'r-text', props: {dataViewKey: catalogKey, field: 'IsSys', label: '类型', width: 120,
      displayFormatter: (value: unknown) => value === 1 || value === '1' ? '应用工场' : value === 0 || value === '0' ? '应用' : ''}} satisfies SparkNode]
    : []),
  {type: 'r-text', props: {dataViewKey: catalogKey, field: 'Memo', label: '描述', emptyText: '暂无描述', showOverflowTooltip: true}},
])
const toolbar = computed<RToolbarProps>(() => ({wrap: true, children: [
  {type: 'r-button', props: {dataViewKey: catalogKey, label: '刷新', action: 'refresh', disabled: loading.value}},
  {type: 'r-button', props: {dataViewKey: catalogKey, label: '新建应用', disabled: loading.value, onClick: openCreateDialog}},
]}))
const actions: RToolbarProps = {children: [
  {type: 'r-button', props: {dataViewKey: catalogKey, label: '进入', buttonType: 'primary', onClick: (row: DataRow) => enterProject(projectFromRow(row))}},
  {type: 'r-button', props: {dataViewKey: catalogKey, label: '删除', buttonType: 'danger', text: true,
    onBeforeRender: ({row, dataSource}: {row?: DataRow | null; dataSource?: DataView | null}) => Boolean(row && dataSource
      && Object.hasOwn(row, 'IsSys') && dataSource.fieldAccess(row, 'IsSys').read === 'visible'
      && (row['IsSys'] === 0 || row['IsSys'] === '0')),
    onClick: (row: DataRow) => deleteProject(projectFromRow(row))}},
]}

function projectFromRow(row: DataRow): {projectId: string; name: string} {
  const current = view.value
  if (!current || current.fieldAccess(row, 'rowid').read !== 'visible') throw new Error('应用目录缺少可读的应用身份')
  const projectId = row['rowid']
  if (typeof projectId !== 'string' || !projectId.trim()) throw new Error('应用目录返回了无效主键')
  const description = Object.hasOwn(row, 'AppDesc') && current.fieldAccess(row, 'AppDesc').read === 'visible' ? String(row['AppDesc'] ?? '') : ''
  const name = Object.hasOwn(row, 'AppName') && current.fieldAccess(row, 'AppName').read === 'visible' ? String(row['AppName'] ?? '') : ''
  return {projectId, name: description || name || projectId}
}

async function loadCatalog(): Promise<void> {
  const own = ++generation
  ready.value = false; loading.value = true; runtimeError.value = ''
  unsubscribe?.(); unsubscribe = undefined; view.value = undefined
  sparkRemove(PAGE_RUNTIME); runtime?.dispose(); runtime = undefined
  try {
    const dataSet = await loadLowcodeApplicationCatalog()
    if (!active || own !== generation) {dataSet.destroy(); return}
    const current = new PageRuntime({pageId: 'platform-applications', scenarioIds: [catalogScenarioId],
      loadScenario: async () => dataSet})
    runtime = current
    await current.load()
    if (!active || own !== generation || current.destroyed) {current.dispose(); return}
    const dataView = getFormalModelView(dataSet, MODEL, 'catalogApps')
    if (!dataView || dataView.queryConfig.allPages !== true || dataView.queryConfig.distinct !== true) {
      throw new Error('正式应用目录 DataView 配置无效')
    }
    const assertCurrent = () => {
      if (!active || own !== generation || current.destroyed) return
      for (const row of dataView.rows) {
        if (dataView.fieldAccess(row, 'rowid').read !== 'visible' || typeof row['rowid'] !== 'string' || !row['rowid'].trim()) {
          throw new Error('应用目录缺少可读的应用身份')
        }
      }
    }
    unsubscribe = dataSet.onAnyViewChange({rowsChanged: () => {
      try {assertCurrent(); runtimeError.value = ''}
      catch (cause) {runtimeError.value = cause instanceof Error ? cause.message : String(cause); ready.value = false}
    }})
    const result = await dataView.requestRefresh()
    if (!active || own !== generation || current.destroyed) return
    if (!result.success) throw new Error(result.message ?? '应用目录查询未成功')
    assertCurrent()
    view.value = dataView
    sparkProvide(PAGE_RUNTIME, current)
    ready.value = true
  } catch (cause) {
    if (active && own === generation) {
      runtimeError.value = cause instanceof Error ? cause.message : String(cause)
      unsubscribe?.(); unsubscribe = undefined
      sparkRemove(PAGE_RUNTIME); runtime?.dispose(); runtime = undefined; view.value = undefined
    }
  } finally {if (active && own === generation) loading.value = false}
}

function openCreateDialog(): void {
  form.projectId = ''; form.name = ''; form.icon = 'Box'; form.description = ''
  dialogVisible.value = true
}
async function submitProject(): Promise<void> {
  if (!form.projectId.trim()) {ElMessage.warning('请输入应用 ID'); return}
  submitting.value = true
  try {throw new Error('lowcode 现有应用写接口不满足写前镜像、journal、readback 与补偿门禁')}
  catch (cause) {ElMessage.error(`创建失败: ${cause instanceof Error ? cause.message : String(cause)}`)}
  finally {submitting.value = false}
}
async function enterProject(project: {projectId: string; name: string}): Promise<void> {
  try {
    const principal = readLowcodePrincipal()
    if (!principal) throw new Error('未登录，无法切换应用')
    if (!projectSwitch) throw new Error('应用管理页缺少项目切换服务')
    const receipt = await projectSwitch.switchAndReload(project.projectId)
    receipt.assertCurrent()
    const failure = await router.push(buildTenantPath({tenantId: principal.enterpriseName, projectId: project.projectId}, getNavHomePath()))
    receipt.assertCurrent()
    if (failure) throw new Error('应用页面导航未完成')
  } catch (cause) {ElMessage.error(`进入应用失败: ${cause instanceof Error ? cause.message : String(cause)}`)}
}
async function deleteProject(project: {projectId: string; name: string}): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定删除应用「${project.name}」？`, '删除应用', {type: 'warning'})
    throw new Error('lowcode 现有应用删除接口不满足写前镜像、journal、readback 与补偿门禁')
  } catch (cause) {if (cause !== 'cancel') ElMessage.error(`删除失败: ${cause instanceof Error ? cause.message : String(cause)}`)}
}
onMounted(() => {void loadCatalog()})
onBeforeUnmount(() => {
  active = false; generation++; unsubscribe?.(); sparkRemove(PAGE_RUNTIME); runtime?.dispose(); runtime = undefined; view.value = undefined
})
</script>

<style scoped>
.platform-apps {display: grid; gap: 16px; padding: 20px; color: var(--el-text-color-primary);}
.page-toolbar {display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;}
.page-toolbar h2 {margin: 0 0 6px; font-size: 22px;}
.page-toolbar p {margin: 0; color: var(--el-text-color-secondary);}
</style>
