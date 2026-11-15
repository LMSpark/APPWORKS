<!--
@module app:views/features/workflow/flow-runtime/bus-detail/ui/bus-flow-detail-page
职责：业务表单 + 流程摘要只读页，与办理页共用监控场景装配。
-->
<template>
  <RendererSection class="bus-flow-detail-page" title="业务流程详情" :bordered="false" :grid-columns="1"
    :status="loading ? '正在加载…' : ''" :error="error" :retryable="!loading" @retry="loadPage">
    <template v-if="prepared" #header-actions>
      <RendererButton label="办理" button-type="primary" @click="openRun" />
      <RendererButton label="运行详情" @click="openDetail" />
    </template>
  <p v-if="prepared" class="bus-flow-detail-page__title">{{ prepared.instanceTitle }}</p>
    <RendererTable v-if="prepared && instanceViewKey" :data-view-key="instanceViewKey" :children="summaryColumns"
      :stripe="true" :show-data-view-meta="false" />
    <el-empty v-if="prepared && businessTabs.length === 0" description="未查询到业务表单" />
    <el-tabs v-else-if="prepared" v-model="activeFormId" class="bus-flow-detail-page__tabs">
      <el-tab-pane v-for="tab in businessTabs" :key="tab.tabKey" :label="tab.label" :name="tab.tabKey" lazy>
        <el-empty v-if="!tab.routeFound" :description="tab.routeError" />
        <FlowRunRouteRenderer v-else-if="tab.routeLocation" :route="tab.routeLocation" :cache-key="tab.cacheKey"
          :tab-key="tab.tabKey" :registry="businessRegistry" />
      </el-tab-pane>
    </el-tabs>
  </RendererSection>
</template>

<script setup lang="ts">
import {computed, ref, shallowRef, watch} from 'vue'
import {useRoute, useRouter} from 'vue-router'
import {buildDataViewKey, type SparkNode} from '@spark-appworks/spark-data'
import {PAGE_RUNTIME, RendererButton, RendererSection, RendererTable, useSparkComponent} from '@spark-appworks/spark-component'
import {
  FLOW_DESIGN_SCENARIO_ID,
  FLOW_MONITOR_SCENARIO_ID,
  buildFlowRunDetailRoute,
  buildFlowRunPageRoute,
  prepareFlowRunPage,
  readFlowRuntimeRouteQuery,
  type FlowRunPreparedPage,
} from '@/lowcode/resources/system/workflow/manage'
import {useFeaturePageRuntime} from '@/views/features/shared/runtime/use-feature-page-runtime'
import {
  createFlowBusinessPageRegistry,
  createFlowBusinessTabBuilder,
} from '../../run-page/model/flow-run-business-tab'
import {getVuePageOptions} from '@/registries/vue-page-registry'
import FlowRunRouteRenderer from '../../run-page/ui/flow-run-route-renderer.vue'

const scenarioId = FLOW_MONITOR_SCENARIO_ID
const route = useRoute()
const router = useRouter()
const routeQuery = () => readFlowRuntimeRouteQuery(route.query)
const {sparkConsume} = useSparkComponent({type: 'bus-flow-detail-page'})
const prepared = shallowRef<FlowRunPreparedPage>()
const loading = ref(false)
const error = ref('')
const activeFormId = ref('')
const businessRegistry = createFlowBusinessPageRegistry()
const registeredPaths = computed(() => new Set(getVuePageOptions().map(item => item.path)))
const buildTab = createFlowBusinessTabBuilder(() => registeredPaths.value)
let generation = 0

const {ready: runtimeReady} = useFeaturePageRuntime({
  scenarioId,
  modelName: 'View_FlowObjList',
  componentType: 'bus-flow-detail-page',
  title: '业务流程详情',
  peerScenarioIds: [FLOW_DESIGN_SCENARIO_ID],
  queryContext: () => ({rowid: routeQuery().wfid, WFOBJID: routeQuery().wfid}),
})

const instanceViewKey = computed(() => buildDataViewKey('WFOBJ_FLOW', 'default', scenarioId))
const businessTabs = computed(() => (prepared.value?.formTabs ?? []).map(tab => buildTab({
  tabKey: tab.tabKey,
  label: tab.label,
  sourcePath: tab.sourcePath,
  queryString: tab.queryString,
}, router)))

const summaryColumns: SparkNode[] = [
  {type: 'r-text', props: {field: 'TITLE', label: '流程标题', readonly: true, minWidth: 200}},
  {type: 'r-text', props: {field: 'status', label: '状态', readonly: true, minWidth: 100}},
  {type: 'r-text', props: {field: 'BusTblObjID', label: '业务行', readonly: true, minWidth: 160}},
]

async function loadPage(): Promise<void> {
  const own = ++generation
  loading.value = true
  error.value = ''
  prepared.value = undefined
  try {
    if (!runtimeReady.value) throw new Error('业务详情场景尚未就绪')
    const runtime = sparkConsume(PAGE_RUNTIME)
    if (!runtime) throw new Error('缺少页面运行实例')
    const query = routeQuery()
    prepared.value = await prepareFlowRunPage({
      runtime,
      wfid: query.wfid,
      flowid: query.flowid,
      assertCurrent: () => own === generation,
    })
    if (own !== generation) return
    activeFormId.value = prepared.value.formTabs[0]?.tabKey ?? ''
  } catch (err) {
    if (own === generation) error.value = err instanceof Error ? err.message : '加载失败'
  } finally {
    if (own === generation) loading.value = false
  }
}

function openRun(): void {
  const query = routeQuery()
  if (!query.wfid || !query.flowid) return
  void router.push(buildFlowRunPageRoute(query))
}

function openDetail(): void {
  const query = routeQuery()
  if (!query.wfid || !query.flowid) return
  void router.push(buildFlowRunDetailRoute(query))
}

watch(() => [runtimeReady.value, routeQuery().wfid, routeQuery().flowid] as const, () => {
  if (runtimeReady.value) void loadPage()
}, {immediate: true})
</script>

<style scoped>
.bus-flow-detail-page__title {margin: 0 0 12px; font-weight: 600}
.bus-flow-detail-page__tabs {margin-top: 12px}
</style>