<template>
  <el-tabs v-if="state.selectedNode.value" v-model="activeStage" type="border-card" class="blueprint-workspace" v-loading="loading">
    <el-tab-pane label="功能策划" name="planning"><PlanningPane v-model="draft.planningContent" :saving="saving" @save="save({ memo: draft.planningContent }, '功能策划')" /></el-tab-pane>
    <el-tab-pane label="原型设计" name="prototype"><PrototypePane v-model="draft.prototypeHtml" :saving="saving" @save="save({ htmlDesc: draft.prototypeHtml }, '原型设计')" /></el-tab-pane>
    <el-tab-pane label="数据规划" name="data"><DataPlanningPane :form="draft" :saving="saving" @save="save({ conid: draft.formKey, conType: draft.dataSpaceType }, '数据规划')" /></el-tab-pane>
    <el-tab-pane label="节点估算" name="estimate"><EstimatePane :form="draft" :saving="saving" @save="saveEstimate" /></el-tab-pane>
    <el-tab-pane label="开发交付" name="delivery" :disabled="!state.activePageId.value"><DeliveryPane :state="state" :saving="saving" @save="saveDelivery" /></el-tab-pane>
    <el-tab-pane label="发布运行" name="release"><ReleasePane :form="draft" :runtime-summary="runtimeSummary" :saving="saving" @save="save({ IsShowAtNav: draft.visible ? 1 : 0, NavigationType: draft.navigationType }, '发布运行')" /></el-tab-pane>
  </el-tabs>
  <el-empty v-else description="在左侧 WBS 中选择节点" />
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import {
  LowcodeDesignFileUpload,
  encodeLowcodeBlueprintFileVersions,
  lowcodeBlueprintFileVersionKey,
  nextLowcodeBlueprintFileVersions,
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

type MutablePatch = Readonly<Record<string, string | number>>
const props = defineProps<{ state: DevState }>()
const activeStage = ref('planning')
const loading = ref(false)
const saving = ref(false)
const draft = reactive({ planningContent: '', prototypeHtml: '', formKey: '', dataSpaceType: '', difficultyFactor: 0, manhour: 0, quantity: 0, sum: 0, total: 0, personInCharge: '', status: '', visible: false, navigationType: 0, runtimeTarget: '' })
const fileVersions = ref('')
const fileUpload = new LowcodeDesignFileUpload(lowcodeHttp)
const runtimeSummary = computed(() => draft.runtimeTarget.startsWith('cfg:') ? '配置页面资源' : draft.runtimeTarget.startsWith('vue:') ? 'Vue 页面资源' : '未配置')

function applyRecord(record: Awaited<ReturnType<typeof lowcodeApi.blueprint.readRecords>>[number]) {
  Object.assign(draft, {
    planningContent: record.planningContent, prototypeHtml: record.prototypeHtml,
    formKey: record.formKey, dataSpaceType: record.dataSpaceType,
    difficultyFactor: record.difficultyFactor, manhour: record.manhour, quantity: record.quantity,
    sum: record.sum, total: record.total, personInCharge: record.personInCharge, status: record.status,
    visible: record.runtimeNavigationCandidate, navigationType: record.navigationType, runtimeTarget: record.runtimeTarget,
  })
  fileVersions.value = record.fileVersionId
}

async function load() {
  const nodeId = props.state.selectedNode.value?.id
  if (!nodeId) return
  loading.value = true
  try {
    const record = (await lowcodeApi.blueprint.readRecords(props.state.projectId)).find(item => item.id === nodeId)
    if (record) applyRecord(record)
  } catch (error) {
    props.state.addStatus(`六阶段内容加载失败: ${String(error)}`, 'error')
  } finally { loading.value = false }
}

async function save(patch: MutablePatch, label: string) {
  const nodeId = props.state.selectedNode.value?.id
  if (!nodeId) return
  saving.value = true
  try {
    const record = await lowcodeApi.blueprint.updateNodeFields(props.state.projectId, nodeId, patch)
    applyRecord(record)
    props.state.addStatus(`${label}已保存并从远程后端读回`, 'success')
  } catch (error) {
    props.state.addStatus(`${label}保存失败: ${String(error)}`, 'error')
  } finally { saving.value = false }
}

function saveEstimate() {
  void save({ DifficultyFactor: draft.difficultyFactor, Manhour: draft.manhour, Number: draft.quantity, Sum: draft.sum, Total: draft.total, personCharge: draft.personInCharge, status: draft.status }, '节点估算')
}

async function saveDelivery() {
  const nodeId = props.state.selectedNode.value?.id
  const pageId = props.state.activePageId.value
  if (!nodeId || !pageId) return
  saving.value = true
  try {
    const customPath = draft.runtimeTarget.startsWith('cfg:')
      ? draft.runtimeTarget.slice(4)
      : `${props.state.projectId}/${pageId}`
    let versions = parseLowcodeBlueprintFileVersions(fileVersions.value)
    for (const fileName of ['rule.json', 'script.js', 'style.css'] as const satisfies readonly LowcodeBlueprintFileName[]) {
      versions = nextLowcodeBlueprintFileVersions(versions, fileName)
      const version = versions[lowcodeBlueprintFileVersionKey(fileName)]
      const versionedName = `${version}__${fileName}`
      const sourceText = props.state.project.readPageFileText(fileName)
      const text = sourceText === '' ? '\n' : sourceText
      await fileUpload.uploadTextVersion({ customPath, fileName: versionedName, text })
      const readback = await lowcodeApi.design.readTextFile({ appType: 'designfile', customPath, fileName: versionedName })
      if (readback !== text) throw new Error(`${fileName} 上传后读回不一致`)
      const record = await lowcodeApi.blueprint.updateNodeFields(props.state.projectId, nodeId, {
        NavigationUrl: `cfg:${customPath}`,
        VersionId: encodeLowcodeBlueprintFileVersions(versions),
      })
      applyRecord(record)
    }
    props.state.addStatus('开发交付三个文件已独立上传、切换版本并读回', 'success')
  } catch (error) {
    props.state.addStatus(`开发交付保存失败: ${String(error)}`, 'error')
  } finally { saving.value = false }
}

watch(() => props.state.selectedNode.value?.id ?? '', () => { void load() }, { immediate: true })
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
