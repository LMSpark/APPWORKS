<!--
@module app:views/app/dev-system/blueprint-workspace/BlueprintWorkspace
职责：编排选中正式节点的六阶段编辑、真实API保存与三文件交付。
边界：节点分组是领域真源，远端回执不得覆盖等待期间的新编辑。
AI用途：保存策划、原型、场景绑定、估算、交付或发布前定位实际控制链。
-->
<template>
  <el-tabs v-if="state.selectedNode.value" v-model="activeStage" type="border-card" class="blueprint-workspace" v-loading="loading">
    <el-tab-pane label="功能策划" name="planning"><PlanningPane v-model="draft.planningContent" :saving="saving" @save="save({ memo: draft.planningContent }, '功能策划')" /></el-tab-pane>
    <el-tab-pane label="原型设计" name="prototype"><PrototypePane v-model="draft.prototypeHtml" :saving="saving" @save="save({ htmlDesc: draft.prototypeHtml }, '原型设计')" /></el-tab-pane>
    <el-tab-pane label="数据规划" name="data"><DataPlanningPane :form="draft" :state="state" :saving="saving" @save="save({ conid: draft.formKey }, '数据规划')" /></el-tab-pane>
    <el-tab-pane label="节点估算" name="estimate"><EstimatePane :form="draft" :saving="saving" @save="saveEstimate" /></el-tab-pane>
    <el-tab-pane label="开发交付" name="delivery" :disabled="!state.activePageId.value"><DeliveryPane :state="state" :saving="saving" @save="saveDelivery" /></el-tab-pane>
    <el-tab-pane label="发布运行" name="release"><ReleasePane :form="draft" :runtime-summary="runtimeSummary" :saving="saving" @save="save({ IsShowAtNav: draft.visible ? 1 : 0, NavigationType: draft.navigationType }, '发布运行')" /></el-tab-pane>
  </el-tabs>
  <el-empty v-else description="在左侧 WBS 中选择节点" />
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import {
  LowcodeDesignFileUpload,
  encodeLowcodeBlueprintFileVersions,
  lowcodeBlueprintFileVersionKey,
  parseLowcodeBlueprintFileVersions,
  type LowcodeBlueprintFileName,
} from '@spark-appworks/spark-lowcode-api'
import { lowcodeApi } from '@/lowcode/lowcode-runtime'
import { lowcodeHttp } from '@/lowcode/lowcode-runtime'
import type { DevState } from '../useDevState'
import PlanningPane from './PlanningPane.vue'
import PrototypePane from './PrototypePane.vue'
import DataPlanningPane from './DataPlanningPane.vue'
import EstimatePane from './EstimatePane.vue'
import DeliveryPane from './DeliveryPane.vue'
import ReleasePane from './ReleasePane.vue'

/** 六阶段提交给真实后端的可写字段载荷，不作为独立节点真源。 */
type MutablePatch = Readonly<Record<string, string | number>>
const props = defineProps<{ state: DevState }>()
const activeStage = ref('planning')
const loading = ref(false)
const saving = ref(false)
let loadRevision = 0
let disposed = false
onBeforeUnmount(() => { disposed = true; loadRevision++ })
function emptyDraft() {
  return { planningContent: '', prototypeHtml: '', formKey: '', difficultyFactor: 0, manhour: 0, quantity: 0, sum: 0, total: 0, personInCharge: '', status: '', visible: false, navigationType: 0, runtimeTarget: '' }
}
const draft = reactive(emptyDraft())
const fileVersions = ref('')
const fileUpload = new LowcodeDesignFileUpload({ http: lowcodeHttp, readScope: () => lowcodeApi.readRequestScope() })
const runtimeSummary = computed(() => draft.runtimeTarget.startsWith('cfg:') ? '配置页面资源' : draft.runtimeTarget.startsWith('vue:') ? 'Vue 页面资源' : '未配置')

function estimateNumber(value: unknown): number {
  const number = Number(value ?? 0)
  return Number.isFinite(number) ? number : 0
}

function applyRecord(record: Awaited<ReturnType<typeof lowcodeApi.blueprint.readRecords>>[number]) {
  const source = record.source
  Object.assign(draft, {
    planningContent: record.capability.description ?? '', prototypeHtml: record.prototype?.htmlDescription ?? '',
    formKey: record.dataSpace?.scenarioId ?? '',
    difficultyFactor: estimateNumber(source['DifficultyFactor'] ?? source['difficultyFactor']),
    manhour: estimateNumber(source['Manhour'] ?? source['manhour']), quantity: estimateNumber(source['Number'] ?? source['number']),
    sum: estimateNumber(source['Sum'] ?? source['sum']), total: estimateNumber(source['Total'] ?? source['total']),
    personInCharge: record.capability.ownerId ?? '', status: record.capability.deliveryStatus ?? '',
    visible: record.navigation?.publishInMenu ?? false,
    navigationType: estimateNumber(source['NavigationType'] ?? source['navigationType']), runtimeTarget: record.navigation?.target ?? '',
  })
  fileVersions.value = String(source['versionId'] ?? source['VersionId'] ?? source['VERSIONID'] ?? '').trim()
}

async function load() {
  const nodeId = props.state.selectedNode.value?.nodeId
  if (!nodeId) return
  const revision = ++loadRevision
  const initialDraft = JSON.stringify(draft)
  loading.value = true
  try {
    const record = (await lowcodeApi.blueprint.readRecords(props.state.projectId)).find(item => item.nodeId === nodeId)
    if (!record) throw new Error(`远程节点不存在：${nodeId}`)
    if (!disposed && revision === loadRevision) {
      if (initialDraft === JSON.stringify(draft)) applyRecord(record)
      else {
        fileVersions.value = String(record.source['versionId'] ?? record.source['VersionId'] ?? record.source['VERSIONID'] ?? '').trim()
        draft.runtimeTarget = record.navigation?.target ?? ''
      }
    }
  } catch (error) {
    if (!disposed && revision === loadRevision) props.state.addStatus(`六阶段内容加载失败: ${String(error)}`, 'error')
  } finally { if (!disposed && revision === loadRevision) loading.value = false }
}

async function save(patch: MutablePatch, label: string) {
  const nodeId = props.state.selectedNode.value?.nodeId
  if (!nodeId || saving.value || loading.value) return
  if ('conid' in patch && props.state.pageDataDirty.value) { props.state.addStatus('请先保存场景视图编辑，再修改场景绑定', 'warning'); return }
  const initialDraft = JSON.stringify(draft)
  const initialNode = JSON.stringify(props.state.selectedNode.value)
  const projectId = props.state.projectId
  saving.value = true
  try {
    const record = await lowcodeApi.blueprint.updateNodeFields(projectId, nodeId, patch)
    if (!disposed && props.state.projectId === projectId && props.state.selectedNode.value?.nodeId === nodeId && initialDraft === JSON.stringify(draft)) {
      applyRecord(record)
      if ('conid' in patch && initialNode === JSON.stringify(props.state.selectedNode.value) && !props.state.blueprintDirty.value) {
        props.state.project.applyBlueprintNodeEdit({node:{...props.state.selectedNode.value,...record}})
        props.state.project.markBlueprintClean('node')
        try { await props.state.loadSelectedScenarioViews() }
        catch(error){props.state.addStatus(`场景绑定已保存；视图配置加载失败: ${String(error)}`,'error')}
      }
    }
    props.state.addStatus(`${label}已保存并从远程后端读回`, 'success')
  } catch (error) {
    props.state.addStatus(`${label}保存失败: ${String(error)}`, 'error')
  } finally { saving.value = false }
}

function saveEstimate() {
  void save({ DifficultyFactor: draft.difficultyFactor, Manhour: draft.manhour, Number: draft.quantity, Sum: draft.sum, Total: draft.total, personCharge: draft.personInCharge, status: draft.status }, '节点估算')
}

async function saveDelivery() {
  const nodeId = props.state.selectedNode.value?.nodeId
  const pageId = props.state.activePageId.value
  if (!nodeId || !pageId || saving.value || loading.value) return
  const projectId = props.state.projectId
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
    const customPath = draft.runtimeTarget.startsWith('cfg:')
      ? draft.runtimeTarget.slice(4)
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
      const record = await lowcodeApi.blueprint.updateNodeFields(projectId, nodeId, {
        NavigationUrl: `cfg:${customPath}`,
        VersionId: encodeLowcodeBlueprintFileVersions(versions),
      })
      const readbackVersions = String(record.source['versionId'] ?? record.source['VersionId'] ?? record.source['VERSIONID'] ?? '').trim()
      if (encodeLowcodeBlueprintFileVersions(parseLowcodeBlueprintFileVersions(readbackVersions)) !== encodeLowcodeBlueprintFileVersions(versions)) throw new Error(`${fileName} 发布指针回读不一致`)
      confirmed.push(versionedName)
      assertTarget()
      fileVersions.value = readbackVersions
      draft.runtimeTarget = record.navigation?.target ?? ''
    }
    props.state.addStatus('开发交付三个文件已独立上传、切换版本并读回', 'success')
  } catch (error) {
    props.state.addStatus(`开发交付保存失败: ${String(error)}；已确认快照：${written.join('、') || '无'}；已确认发布引用：${confirmed.join('、') || '无'}；已尝试快照：${attemptedSnapshots.join('、') || '无'}；已尝试发布引用：${attemptedReferences.join('、') || '无'}。未确认的请求须核查远端结果`, 'error')
  } finally { saving.value = false }
}

watch([() => props.state.selectedNode.value?.nodeId ?? '', () => props.state.projectId], () => {
  loadRevision++
  loading.value = false
  Object.assign(draft, emptyDraft())
  fileVersions.value = ''
  void load()
}, { immediate: true })
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
