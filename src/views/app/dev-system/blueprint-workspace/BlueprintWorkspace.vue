<!--
@module app:views/app/dev-system/blueprint-workspace/BlueprintWorkspace
职责：编排选中正式节点的六阶段编辑、真实API保存与三文件交付。
边界：节点分组是领域真源，远端回执不得覆盖等待期间的新编辑。
AI用途：保存策划、原型、场景绑定、估算、交付或发布前定位实际控制链。
-->
<template>
  <el-tabs v-if="state.selectedNode.value" v-model="activeStage" type="border-card" class="blueprint-workspace" v-loading="loading">
    <template #extra>
      <el-button size="small" :disabled="!sessionDirty || saving || loading" @click="cancelEdits">取消节点修改</el-button>
      <el-button size="small" type="primary" :disabled="!sessionDirty || saving || loading" :loading="saving" @click="save('节点修改')">保存节点修改</el-button>
    </template>
    <el-tab-pane label="功能策划" name="planning"><PlanningPane v-model="draft.planningContent" :saving="saving" :field-access="access('memo')" @save="save('功能策划')" /></el-tab-pane>
    <el-tab-pane label="原型设计" name="prototype"><PrototypePane v-model="draft.prototypeHtml" :saving="saving" :field-access="access('htmlDesc')" @save="save('原型设计')" /></el-tab-pane>
    <el-tab-pane label="数据规划" name="data"><DataPlanningPane v-if="activeStage === 'data'" :form="draft" :state="state" :saving="saving" :field-access="access('conid')" @save="save('数据规划')" /></el-tab-pane>
    <el-tab-pane label="节点估算" name="estimate"><EstimatePane :form="draft" :saving="saving" :field-access="estimateAccess" @save="save('节点估算')" /></el-tab-pane>
    <el-tab-pane label="开发交付" name="delivery" :disabled="!state.activePageId.value"><DeliveryPane :state="state" :saving="saving" :can-publish="deliveryAccess" @save="saveDelivery" /></el-tab-pane>
    <el-tab-pane label="发布运行" name="release"><ReleasePane :form="draft" :runtime-summary="runtimeSummary" :saving="saving" :visibility-access="access('IsShowAtNav')" :navigation-access="access('NavigationType')" @save="save('发布运行')" /></el-tab-pane>
  </el-tabs>
  <el-empty v-else description="在左侧 WBS 中选择节点" />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import {
  LowcodeDesignFileUpload,
  encodeLowcodeBlueprintFileVersions,
  lowcodeBlueprintFileVersionKey,
  parseLowcodeBlueprintFileVersions,
  type LowcodeBlueprintFileName,
} from '@spark-appworks/spark-lowcode-api'
import { lowcodeApi } from '@/lowcode/lowcode-runtime'
import { lowcodeHttp } from '@/lowcode/lowcode-runtime'
import { loadLowcodeRuntimeScenario } from '@/lowcode/data-space/lowcode-data-space-runtime'
import { LOWCODE_APPLICATION_CATALOG_FORM_KEY } from '@spark-appworks/spark-lowcode-api'
import type { DataSet } from '@spark-appworks/spark-data'
import type { DevState, ExternalDataViewSession } from '../useDevState'
import { BlueprintWorkspaceDataView } from './blueprint-workspace-dataview'
import PlanningPane from './PlanningPane.vue'
import PrototypePane from './PrototypePane.vue'
import DataPlanningPane from './DataPlanningPane.vue'
import EstimatePane from './EstimatePane.vue'
import DeliveryPane from './DeliveryPane.vue'
import ReleasePane from './ReleasePane.vue'

const props = defineProps<{ state: DevState }>()
const activeStage = ref('planning')
const loading = ref(false)
const saving = ref(false)
let loadRevision = 0
let disposed = false
let dataSet: DataSet | undefined
let dataSetProjectId = ''
let unregisterSession: (() => void) | undefined
const session = shallowRef<BlueprintWorkspaceDataView>()
const dataViewRevision = ref(0)
const sessionDirty = computed(() => {void dataViewRevision.value; return session.value?.dirty ?? false})
const fileVersions = computed(() => {void dataViewRevision.value; return String(session.value?.value('VersionId') ?? '').trim()})
const fileUpload = new LowcodeDesignFileUpload({ http: lowcodeHttp, readScope: () => lowcodeApi.readRequestScope() })
const runtimeSummary = computed(() => {
  void dataViewRevision.value
  const target = String(session.value?.value('NavigationUrl') ?? '')
  return target.startsWith('cfg:') ? '配置页面资源' : target.startsWith('vue:') ? 'Vue 页面资源' : '未配置'
})
const draft = {
  read(field: string) {void dataViewRevision.value; return session.value?.value(field)},
  write(field: string, value: unknown) {session.value?.update(field, value); dataViewRevision.value++; props.state.notifyExternalDataViewChanged()},
  get planningContent() {return String(this.read('memo') ?? '')},
  set planningContent(value: string) {this.write('memo', value)},
  get prototypeHtml() {return String(this.read('htmlDesc') ?? '')},
  set prototypeHtml(value: string) {this.write('htmlDesc', value)},
  get formKey() {return String(this.read('conid') ?? '')},
  set formKey(value: string) {this.write('conid', value)},
  get difficultyFactor() {return Number(this.read('DifficultyFactor') ?? 0)},
  set difficultyFactor(value: number) {this.write('DifficultyFactor', value)},
  get manhour() {return Number(this.read('Manhour') ?? 0)},
  set manhour(value: number) {this.write('Manhour', value)},
  get quantity() {return Number(this.read('Number') ?? 0)},
  set quantity(value: number) {this.write('Number', value)},
  get sum() {return Number(this.read('Sum') ?? 0)},
  set sum(value: number) {this.write('Sum', value)},
  get total() {return Number(this.read('Total') ?? 0)},
  set total(value: number) {this.write('Total', value)},
  get personInCharge() {return String(this.read('personCharge') ?? '')},
  set personInCharge(value: string) {this.write('personCharge', value)},
  get status() {return String(this.read('status') ?? '')},
  set status(value: string) {this.write('status', value)},
  get visible() {return Number(this.read('IsShowAtNav') ?? 0) !== 0},
  set visible(value: boolean) {this.write('IsShowAtNav', value ? 1 : 0)},
  get navigationType() {return Number(this.read('NavigationType') ?? 0)},
  set navigationType(value: number) {this.write('NavigationType', value)},
}
type FieldAccess = Readonly<{read: boolean; write: boolean}>
const access = (field: string): FieldAccess => ({read: session.value?.canRead(field) ?? false, write: session.value?.canWrite(field) ?? false})
const estimateAccess = computed(() => {void dataViewRevision.value; return ({
  DifficultyFactor: access('DifficultyFactor'), Manhour: access('Manhour'), Number: access('Number'),
  Sum: access('Sum'), Total: access('Total'), personCharge: access('personCharge'), status: access('status'),
})})
const deliveryAccess = computed(() => {void dataViewRevision.value; return access('NavigationUrl').write && access('VersionId').read && access('VersionId').write})

function releaseSession(destroyDataSet: boolean): void {
  unregisterSession?.(); unregisterSession = undefined
  session.value?.dispose(); session.value = undefined
  if (destroyDataSet) {dataSet?.destroy(); dataSet = undefined; dataSetProjectId = ''}
}

onBeforeUnmount(() => { disposed = true; loadRevision++; releaseSession(true) })

async function load(): Promise<void> {
  const nodeId = props.state.selectedNode.value?.nodeId
  const projectId = props.state.projectId
  if (!nodeId) {releaseSession(false); return}
  const revision = ++loadRevision
  loading.value = true
  try {
    if (!dataSet || dataSet.scenarioId !== LOWCODE_APPLICATION_CATALOG_FORM_KEY || dataSetProjectId !== projectId) {
      releaseSession(true)
      const loaded = await loadLowcodeRuntimeScenario({projectId, scenarioId: LOWCODE_APPLICATION_CATALOG_FORM_KEY})
      if (disposed || revision !== loadRevision || props.state.projectId !== projectId) {loaded.destroy(); return}
      dataSet = loaded
      dataSetProjectId = projectId
    }
    if (!session.value) {
      const loaded = dataSet
      if (!loaded) throw new Error('蓝图 DataSet 未初始化')
      session.value = new BlueprintWorkspaceDataView(loaded, projectId, () => {
        if (disposed || props.state.projectId !== projectId) throw new Error('蓝图 DataView 项目作用域已失效')
      })
      const registeredSession: ExternalDataViewSession = {isDirty: () => session.value?.dirty ?? false, save: () => session.value?.save() ?? Promise.resolve()}
      unregisterSession = props.state.registerExternalDataViewSession(registeredSession)
    }
    const current = session.value
    if (!current) throw new Error('蓝图 DataView 未初始化')
    await current.load(nodeId)
    dataViewRevision.value++
    props.state.notifyExternalDataViewChanged()
  } catch (error) {
    if (!disposed && revision === loadRevision) props.state.addStatus(`六阶段 DataView 加载失败: ${String(error)}`, 'error')
  } finally { if (!disposed && revision === loadRevision) loading.value = false }
}

async function save(label: string): Promise<void> {
  const nodeId = props.state.selectedNode.value?.nodeId
  const current = session.value
  if (!nodeId || !current || saving.value || loading.value) return
  const projectId = props.state.projectId
  saving.value = true
  try {
    await current.save()
    if (disposed || props.state.projectId !== projectId || props.state.selectedNode.value?.nodeId !== nodeId) throw new Error('保存已提交，但工作区目标随后发生变化')
    props.state.notifyExternalDataViewChanged()
    props.state.addStatus(`${label}已通过 Base_NavigationInfo DataView 保存并读回；保存范围为当前节点全部暂存字段`, 'success')
  } catch (error) {
    props.state.addStatus(`${label} DataView 保存失败或回执待核验: ${String(error)}`, 'error')
  } finally { saving.value = false }
}

function cancelEdits(): void {
  try {session.value?.cancel(); dataViewRevision.value++; props.state.notifyExternalDataViewChanged()}
  catch (error) {props.state.addStatus(`取消蓝图 DataView 修改失败: ${String(error)}`, 'error')}
}

async function saveDelivery() {
  const nodeId = props.state.selectedNode.value?.nodeId
  const pageId = props.state.activePageId.value
  if (!nodeId || !pageId || saving.value || loading.value) return
  const projectId = props.state.projectId
  const current = session.value
  if (!current || !deliveryAccess.value) {props.state.addStatus('发布交付要求当前 DataView 正式返回 NavigationUrl、VersionId 且允许读写', 'warning'); return}
  if (current.dirty || current.hasUnconfirmedSave) {props.state.addStatus('请先保存或取消当前节点字段修改，再提交发布文件', 'warning'); return}
  const scopeToken = lowcodeApi.readRequestScope().token
  const texts = new Map((['rule.json', 'script.js', 'style.css'] as const).map(name => [name, props.state.project.readPageFileText(name)]))
  const written: string[] = []
  const confirmed: string[] = []
  const attemptedSnapshots: string[] = []
  const attemptedReferences: string[] = []
  const assertTarget = () => {
    if (disposed || props.state.selectedNode.value?.nodeId !== nodeId || props.state.activePageId.value !== pageId
      || props.state.projectId !== projectId || lowcodeApi.readRequestScope().token !== scopeToken) throw new Error('交付目标已切换，后续交付已停止')
  }
  saving.value = true
  try {
    const runtimeTarget = String(current.value('NavigationUrl') ?? '')
    const customPath = runtimeTarget.startsWith('cfg:')
      ? runtimeTarget.slice(4)
      : `${projectId}/${pageId}`
    const pathSegments = customPath.split('/')
    if (lowcodeApi.readRequestScope().headers['X-AppId'] !== projectId || pathSegments[0] !== projectId || pathSegments.length < 2
      || /[\\?#]/.test(customPath) || pathSegments.some(segment => !segment || segment.trim() !== segment || segment === '.' || segment === '..')) throw new Error('交付路径必须属于当前请求应用')
    let versions = parseLowcodeBlueprintFileVersions(fileVersions.value)
    for (const fileName of ['rule.json', 'script.js', 'style.css'] as const satisfies readonly LowcodeBlueprintFileName[]) {
      assertTarget()
      const snapshots = await lowcodeApi.design.listFileVersions({ appType: 'designfile', customPath, fileName })
      assertTarget()
      const version = snapshots.reduce((maximum, item) => Math.max(maximum, item.version), 0) + 1
      if (!Number.isSafeInteger(version)) throw new Error('快照编号超出安全范围')
      const versionedName = `${version}__${fileName}`
      const text = texts.get(fileName)
      if (text === undefined) throw new Error('交付文本缺失')
      if (text !== props.state.project.readPageFileText(fileName)) throw new Error(`${fileName} 交付期间已修改`)
      attemptedSnapshots.push(versionedName)
      await fileUpload.uploadTextVersion({ customPath, fileName: versionedName, text })
      written.push(versionedName)
      assertTarget()
      if (text !== props.state.project.readPageFileText(fileName)) throw new Error(`${fileName} 上传期间已修改，未更新发布引用`)
      versions = Object.freeze({ ...versions, [lowcodeBlueprintFileVersionKey(fileName)]: version })
      attemptedReferences.push(versionedName)
      current.update('NavigationUrl', `cfg:${customPath}`)
      current.update('VersionId', encodeLowcodeBlueprintFileVersions(versions))
      dataViewRevision.value++
      props.state.notifyExternalDataViewChanged()
      await current.save()
      const readbackVersions = String(current.value('VersionId') ?? '').trim()
      if (encodeLowcodeBlueprintFileVersions(parseLowcodeBlueprintFileVersions(readbackVersions)) !== encodeLowcodeBlueprintFileVersions(versions)) throw new Error(`${fileName} 发布指针回读不一致`)
      confirmed.push(versionedName)
      assertTarget()
      props.state.notifyExternalDataViewChanged()
    }
    props.state.addStatus('开发交付三个文件已独立上传、切换版本并读回', 'success')
  } catch (error) {
    props.state.addStatus(`开发交付保存失败: ${String(error)}；已确认快照：${written.join('、') || '无'}；已确认发布引用：${confirmed.join('、') || '无'}；已尝试快照：${attemptedSnapshots.join('、') || '无'}；已尝试发布引用：${attemptedReferences.join('、') || '无'}。未确认的请求须核查远端结果`, 'error')
  } finally { saving.value = false }
}

watch([() => props.state.selectedNode.value?.nodeId ?? '', () => props.state.projectId], () => {void load()}, { immediate: true })
</script>

<style scoped>
.blueprint-workspace { height: 100%; display: flex; flex-direction: column; }
.blueprint-workspace :deep(.el-tabs__content) { flex: 1; min-height: 0; overflow: auto; }
.blueprint-workspace :deep(.el-tab-pane) { height: 100%; }
.blueprint-workspace :deep(.stage-pane) { max-width: 960px; padding: 20px; }
.blueprint-workspace :deep(.stage-actions) { display: flex; justify-content: flex-end; margin-top: 18px; }
.blueprint-workspace :deep(.estimate-grid) { display: grid; grid-template-columns: repeat(2, minmax(260px, 1fr)); gap: 0 24px; }
.delivery-pane, .delivery-tabs { height: 100%; }
.delivery-tabs :deep(.el-tabs__content), .delivery-tabs :deep(.el-tab-pane) { height: calc(100% - 28px); }
</style>
