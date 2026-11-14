<!--
@module app:views/FileDataManager/FileManager/index
职责：恢复文件管理：按文件名称查询 filedata 文件区、选择本地文件上传、确认后删除文件。
边界：列表、上传与删除都经同一PageRuntime的FileDataCatalog视图提交；上传核原字节、删除回列确认，失败后丢弃本地草稿并按实际目录重读。
AI用途：迁移参考仓 FileDataManager/FileManager 时，核对文件区、导航身份(dataSpaceId)与保存回执。
-->
<template>
  <section class="file-page">
    <header class="file-page__header">
      <h1>文件管理</h1>
      <div class="file-page__tools">
        <RendererButton v-if="ready" label="上传" button-type="primary" :disabled="busy" @click="pickAndUpload" />
        <RendererButton v-if="ready" :data-view-key="viewKey" label="刷新" action="refresh" :disabled="busy" />
      </div>
    </header>
    <p v-if="loading" role="status">正在读取文件目录…</p>
    <p v-if="error" role="alert">{{ error }}</p>
    <RendererButton v-if="error && !loading && !ready" label="重试" @click="loadCurrentRoute" />
    <RendererTable v-if="ready" :data-view-key="viewKey" :children="fields" :filter="filter" :actions="actions"
      :stripe="true" :show-row-index="true" :show-data-view-meta="false"
      :pagination="{pageSizes: [15, 30, 50, 100], showJumper: true}" />
  </section>
</template>

<script setup lang="ts">
import {computed, ref} from 'vue'
import type {DataRow, DataView, SparkNode} from '@spark-appworks/spark-data'
import {RendererButton, RendererTable, useSparkComponent, type RFilterProps, type RToolbarProps, consumeRequiredPageService} from '@spark-appworks/spark-component'
import {useFeaturePageRuntime} from '@/views/features/shared/runtime/use-feature-page-runtime'

const {sparkConsume} = useSparkComponent({type: 'file-manager-page'})
const pageService = consumeRequiredPageService(sparkConsume, 'file-manager-page')
const {viewKey, session, ready, loading, error, loadCurrentRoute} = useFeaturePageRuntime({
  scenarioId: '23F469CC96AC4B73BA5AE593C0002BD4', navigationId: 'EDF7DE3E5723E127F98B2A119BE81BF9',
  modelName: 'FileDataCatalog', componentType: 'file-manager-page', title: '文件管理',
})
const busy = ref(false)
const text = (field: string, label: string, minWidth: number): SparkNode =>
  ({type: 'r-text', props: {field, label, readonly: true, minWidth, showOverflowTooltip: true}})
const fields: SparkNode[] = [text('fileName', '文件名称', 200), text('path', '存储路径', 260), text('lastModified', '上传时间', 180)]
const filter: RFilterProps = {
  autoQuery: false, queryOnReset: true, firstPageOnSearch: true, showExpressionEditor: false, showDataViewMeta: false,
  children: [{type: 'r-text', props: {field: 'fileName', label: '文件名称', placeholder: '请输入文件名称', filterTrim: true}}],
}
const actions = computed<RToolbarProps>(() => ({children: [{type: 'r-button', props: {
  label: '删除', buttonType: 'danger', link: true, permAction: 'delete', disabled: busy.value, onClick: remove,
}}]}))

function currentView(): DataView {
  const view = session.runtime?.resolveView(viewKey)
  if (!view) throw new Error('文件目录视图已失效')
  return view
}

async function commit(view: DataView, change: () => Promise<unknown>, done: string): Promise<boolean> {
  busy.value = true
  try {
    await change()
    const result = await view.saveChanges()
    if (!result.success) throw new Error(result.message || '保存失败')
    await view.refresh()
    pageService.showMessage(done, 'success')
    return true
  } catch (cause) {
    pageService.showMessage(cause instanceof Error ? cause.message : String(cause), 'error')
    try {await view.discardAndReload()} catch (reload) {error.value = reload instanceof Error ? reload.message : String(reload)}
    return false
  } finally {busy.value = false}
}

async function pickAndUpload(): Promise<void> {
  const selected = await pageService.browseFiles({multiple: false})
  const file = selected[0]?.file
  if (!file) return
  const view = currentView()
  await commit(view, () => view.addRow({content: file}), `${file.name} 已上传`)
}

async function remove(row: DataRow): Promise<void> {
  const view = currentView()
  const key = view.rows.includes(row) ? view.getPkKey(row) : undefined
  if (key === undefined) {error.value = '文件记录缺少正式身份'; return}
  if (!await pageService.showConfirm(`确定删除文件“${String(key)}”？`, '删除确认', {type: 'warning'})) return
  await commit(view, () => view.removeRow(key), `${String(key)} 已删除`)
}
</script>

<style scoped>
.file-page {display: grid; gap: 16px; padding: 24px; color: var(--el-text-color-primary)}
.file-page__header {display: flex; align-items: center; justify-content: space-between; gap: 16px}
.file-page__header h1 {margin: 0; font-size: 20px}
.file-page__tools {display: flex; gap: 8px}
</style>