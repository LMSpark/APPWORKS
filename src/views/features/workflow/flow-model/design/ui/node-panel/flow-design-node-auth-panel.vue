<!--
@module app:views/features/workflow/flow-model/design/ui/node-panel/flow-design-node-auth-panel
职责：选中节点的 FunctionNodeAuth 授权行，绑定设计场景 nodeAuth 视图。
-->
<template>
  <RendererSection title="节点功能权限" :bordered="true" :grid-columns="1">
    <DisplayAlert v-if="!selectedNodeId" alert-type="info" :closable="false" :show-icon="true"
      title="请先在画布或节点表选中一个节点，再维护 FunctionNodeAuth 授权。" />
    <DisplayAlert v-else-if="modelMissing" alert-type="warning" :closable="false" :show-icon="true"
      title="设计场景未装配 FunctionNodeAuth 模型；请完成 G0 modelId 回写或检查元数据空间。" />
    <RendererTable v-else-if="viewKey" :data-view-key="viewKey" :children="columns" :toolbar="toolbar"
      :stripe="true" :show-data-view-meta="false" :highlight-current-row="true"
      :pagination="{pageSizes: [5, 10, 20], showJumper: true}" />
  </RendererSection>
</template>

<script setup lang="ts">
import {computed, ref} from 'vue'
import {buildDataViewKey, type DataView, type SparkNode} from '@spark-appworks/spark-data'
import {
  DisplayAlert,
  PAGE_RUNTIME,
  RendererSection,
  RendererTable,
  consumeRequiredPageService,
  useSparkComponent,
  type RToolbarProps,
} from '@spark-appworks/spark-component'
import {
  FLOW_DESIGN_SCENARIO_ID,
  defaultFlowDesignNodeAuthRow,
} from '@/lowcode/resources/system/workflow/manage'
import {
  featureTableToolbar,
  runFeatureTableAction,
  type FeatureTableAction,
} from '@/views/features/shared/table/feature-table-actions'

const props = defineProps<{viewKey: string; selectedNodeId: string; flowModelId: string}>()
const {sparkConsume} = useSparkComponent({type: 'flow-design-node-auth-panel'})
const pageService = consumeRequiredPageService(sparkConsume, 'flow-design-node-auth-panel')
const busy = ref(false)

const optionDataViewKey = buildDataViewKey('_Base_FunctionNode', 'flowDesignOptions', FLOW_DESIGN_SCENARIO_ID)

const modelMissing = computed(() => {
  const runtime = sparkConsume(PAGE_RUNTIME)
  if (!runtime || !props.viewKey) return false
  const view = runtime.resolveView(props.viewKey)
  return !view || view.destroyed
})

function authView(): DataView {
  const runtime = sparkConsume(PAGE_RUNTIME)
  if (!runtime) throw new Error('流程设计缺少运行实例')
  const view = runtime.resolveView(props.viewKey)
  if (!view || view.destroyed) throw new Error('节点权限视图尚未就绪')
  return view
}

const columns: SparkNode[] = [
  {type: 'r-select', props: {field: 'functionoption', label: '功能标签', minWidth: 160, filterable: true, optionDataViewKey}},
  {type: 'r-text', props: {field: 'QID', label: '主体', minWidth: 120}},
  {type: 'r-text', props: {field: 'granttype', label: '授权类型', minWidth: 100}},
  {type: 'r-text', props: {field: 'masterId', label: '组织', minWidth: 120}},
  {type: 'r-text', props: {field: 'mastervaluefield', label: '组织字段', minWidth: 120}},
  {type: 'r-text', props: {field: 'status', label: '状态', minWidth: 80}},
  {type: 'r-text', props: {field: 'businessId', label: '业务标识', minWidth: 120, showOverflowTooltip: true}},
]

const toolbar = computed((): RToolbarProps => {
  const runtime = sparkConsume(PAGE_RUNTIME)
  const view = props.viewKey ? runtime?.resolveView(props.viewKey) : undefined
  if (!view || view.destroyed) return {children: []}
  return featureTableToolbar({
    view,
    order: ['add', 'remove', 'save', 'cancel'],
    locked: busy.value,
    addBlocked: !props.selectedNodeId.trim(),
    run: action => void runAuthAction(action),
  })
})

async function runAuthAction(action: FeatureTableAction): Promise<void> {
  if (busy.value) return
  busy.value = true
  try {
    const view = authView()
    if (action === 'add') {
      const defaults = defaultFlowDesignNodeAuthRow({
        flowModelId: props.flowModelId,
        selectedNodeId: props.selectedNodeId,
      })
      view.setCurrentRow(await view.addRow(defaults))
      return
    }
    await runFeatureTableAction(view, action, pageService)
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    pageService.showMessage(message, 'error')
  } finally {
    busy.value = false
  }
}
</script>