<template>
  <RendererSection title="小程序申请" :grid-columns="1" :bordered="false">
    <p v-if="loading" role="status">正在读取申请列表…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="selectionError" role="alert">{{ selectionError }}</p>
    <RendererButton v-if="error && !loading" label="重试" @click="loadCurrentRoute" />
    <RendererTable v-if="ready" :data-view-key="viewKey" :children="columns" :filter="filter" :actions="actions" :auto-columns="false"
      :pagination="{pageSizes: [10, 20, 50], showJumper: true}" />
    <RendererDialog v-if="ready && detailKey !== null" :key="detailKey" :model-value="true" :append-to-body="true"
      title="申请详情" @update:model-value="closeDetail">
      <ApplicationDetail :application-key="detailKey" />
    </RendererDialog>
  </RendererSection>
</template>

<script setup lang="ts">
import {computed, ref, watch} from 'vue'
import {buildDataViewKey, ensureDataSetStaticInputTable, type DataRow, type DataView} from '@spark-appworks/spark-data'
import {RendererButton, RendererDialog, RendererSection, RendererTable, type RFilterProps, type RToolbarProps} from '@spark-appworks/spark-component'
import {useFeaturePageRuntime} from '@/views/features/shared/runtime/use-feature-page-runtime'
import {applicationPageScope, listFields, textFields} from './application-fields'
import ApplicationDetail from './application-detail.vue'

/** 模板安装申请的状态目录。部署状态走自己的正式模型。 */
const applicationStates = [
  {code:'PENDING',label:'待审批'}, {code:'APPROVED',label:'已通过，等待上传'},
  {code:'DEPLOY_QUEUED',label:'排队上传'}, {code:'DEPLOYING',label:'上传中'},
  {code:'EXPERIENCE_READY',label:'体验版就绪'}, {code:'DEPLOY_FAILED',label:'上传失败'},
  {code:'REJECTED',label:'已驳回'}, {code:'CANCELLED',label:'已取消'},
] as const
const stateTable = 'MiniappTemplateApplicationStatus'
const stateViewKey = buildDataViewKey(stateTable, 'default', applicationPageScope.scenarioId)
const filter: RFilterProps = {
  autoQuery: false, queryOnReset: true, firstPageOnSearch: true, showExpressionEditor: false,
  showDataViewMeta: false,
  children: [
    {type:'r-select', props:{field:'status', label:'状态', filterOp:'eq', placeholder:'选择申请状态',
      optionDataViewKey:stateViewKey, optionValueField:'code', optionLabelField:'label'}},
    {type:'r-text', props:{field:'user_version', label:'版本号', filterOp:'contains',
      filterTrim:true, placeholder:'输入版本号'}},
  ],
}

const {viewKey, session, ready, loading, error, loadCurrentRoute} = useFeaturePageRuntime({
  ...applicationPageScope,
  componentType: 'mp-template-application-list',
  title: '小程序申请',
  prepareView(view: DataView) {
    view.queryConfig = {fields: Object.keys(listFields), pagination: 'paged', allPages: false, autoQuery: false}
    view.page = 1
    view.pageSize = 10
    const dataSet = view.dataSet
    if (!dataSet) throw new Error('申请状态选项缺少本次数据空间')
    ensureDataSetStaticInputTable(dataSet, stateTable, [{name:'code',primary:true},{name:'label'}])
    const catalog = dataSet.getTable(stateTable)
    if (!catalog) throw new Error('申请状态选项未装配')
    if (catalog.rows.length === 0) catalog.addRows(applicationStates.map(state => ({...state})))
  },
})
const detailKey = ref<number | null>(null)
const selectionError = ref('')
const columns = textFields(listFields)
const actions = computed<RToolbarProps>(() => ({children: [{
  type: 'r-button',
  props: {dataViewKey: viewKey.value, label: '详情', link: true, onClick: openDetail},
}]}))
function openDetail(row: DataRow): void {
  selectionError.value = ''
  const source = ready.value ? session.runtime?.resolveView(viewKey.value) : undefined
  const key = row['id']
  try {
    if (!source || typeof key !== 'number' || !Number.isSafeInteger(key) || source.primaryKey !== 'id') {
      throw new Error('当前申请缺少可读的正式记录键')
    }
    source.captureReadRow(row, ['id'])()
    detailKey.value = key
  } catch (cause) {
    selectionError.value = cause instanceof Error ? cause.message : '无法读取当前申请'
  }
}
function closeDetail(open: boolean): void {
  if (!open) detailKey.value = null
}
watch(ready, value => {
  if (!value) {
    detailKey.value = null
    selectionError.value = ''
  }
})
</script>
