<!--
@module app:views/features/system/bug-manage/ui/bug-manage-page
职责：恢复BUG列表、按简述查询、分页及单条BUG详情编辑。
边界：列表、选项与编辑均绑定同一PageRuntime的正式DataView；处理时间字段在正式模型中缺失，不以其他字段替代。
AI用途：迁移系统运维BUG管理时，核对导航身份、选项视图及处理人姓名同步。
-->
<template>
  <RendererSection class="bug-page" title="BUG管理" :bordered="false" :grid-columns="1" :grid-gap="16"
    :status="loading ? '正在读取BUG列表…' : ''" :error="error" :retryable="!loading && !ready" @retry="loadCurrentRoute">
    <RendererTable v-if="ready" :data-view-key="viewKey" :children="fields" :filter="filter" :actions="actions"
      :stripe="true" :show-row-index="true" :show-data-view-meta="false"
      :pagination="{pageSizes: [15, 30, 50, 100], showJumper: true}" />
    <BugDetailDialog v-if="ready && editing" :key="editing.epoch" :data-view-key="viewKey" :record-id="editing.id"
      :system-key="systemKey" :type-key="typeKey" :state-key="stateKey" :user-key="userKey" @close="editing = undefined" />
  </RendererSection>
</template>

<script setup lang="ts">
import {computed, ref} from 'vue'
import {buildDataViewKey, type DataRow, type SparkNode} from '@spark-appworks/spark-data'
import {RendererSection, RendererTable, type RFilterProps, type RToolbarProps} from '@spark-appworks/spark-component'
import {useFeaturePageRuntime} from '@/views/features/shared/runtime/use-feature-page-runtime'
import BugDetailDialog from './bug-detail-dialog.vue'

const scenarioId = '5B54AEBD5BD1BBC72710D4022589A404'
const {viewKey, session, ready, loading, error, loadCurrentRoute} = useFeaturePageRuntime({
  scenarioId, modelName: 'Base_Bug_Info', componentType: 'bug-manage-page', title: 'BUG管理',
  optionModels: ['Base_AppSystemList', 'FkType_Zd', 'bug_State', 'Base_UserInfo'],
})
const systemKey = buildDataViewKey('Base_AppSystemList', 'default', scenarioId)
const typeKey = buildDataViewKey('FkType_Zd', 'default', scenarioId)
const stateKey = buildDataViewKey('bug_State', 'default', scenarioId)
const userKey = buildDataViewKey('Base_UserInfo', 'default', scenarioId)
const editing = ref<{id: string | number; epoch: number}>()
let epoch = 0
const text = (field: string, label: string, minWidth = 140): SparkNode =>
  ({type: 'r-text', props: {field, label, readonly: true, minWidth, sortable: false, showOverflowTooltip: true}})
const option = (field: string, label: string, optionDataViewKey: string): SparkNode =>
  ({type: 'r-select', props: {field, label, readonly: true, minWidth: 120, sortable: false, optionDataViewKey}})
const fields: SparkNode[] = [
  option('SystemID', '系统名称', systemKey), text('Title', 'BUG简述', 220), text('FormPath', '表单路径', 200),
  option('FkType', '反馈类型', typeKey), text('checkName', '核查人', 100), text('CompleteUserName', '完成人', 100),
  option('State', '状态', stateKey), text('CreateTime', '创建时间', 170), text('CreateUserName', '创建人', 100),
]
const filter: RFilterProps = {
  autoQuery: false, queryOnReset: true, firstPageOnSearch: true, showExpressionEditor: false, showDataViewMeta: false,
  children: [{type: 'r-text', props: {field: 'Title', label: 'BUG简述', placeholder: '请输入BUG简述', filterTrim: true}}],
}
const actions = computed<RToolbarProps>(() => ({children: [{type: 'r-button', props: {
  label: '详情', disabled: !!editing.value, onClick: openDetail,
}}]}))

function openDetail(row: DataRow): void {
  const view = session.runtime?.resolveView(viewKey)
  const id = view?.rows.includes(row) ? view.getPkKey(row) : undefined
  if (id === undefined) { error.value = 'BUG记录缺少原生身份'; return }
  editing.value = {id, epoch: ++epoch}
}
</script>

<style scoped>
.bug-page {padding: 8px}
</style>
