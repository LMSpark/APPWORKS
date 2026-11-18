<!--
@module app:views/FileDataManager/FileManager/index
职责：恢复文件管理：按文件名称查询 filedata 文件区、选择本地文件上传、确认后删除文件。
边界：列表、上传与删除都经同一PageRuntime的FileDataCatalog视图提交；上传核原字节、删除回列确认，失败后丢弃本地草稿并按实际目录重读。
AI用途：迁移参考仓 FileDataManager/FileManager 时，核对文件区、导航身份(dataSpaceId)与保存回执。
-->
<template>
  <RendererSection class="file-page" title="文件管理" :bordered="false" :grid-columns="1" :grid-gap="16"
    :status="loading ? '正在读取文件目录…' : ''" :error="error" :retryable="!loading && !ready" retry-text="重试" @retry="loadCurrentRoute">
    <template v-if="ready" #header-actions>
      <RendererButton label="上传" button-type="primary" :disabled="busy" @click="pickAndUpload" />
      <RendererButton :data-view-key="viewKey" label="刷新" action="refresh" :disabled="busy" />
    </template>
    <RendererTable v-if="ready" :data-view-key="viewKey" :children="fields" :filter="filter" :actions="actions"
      :stripe="true" :border="true" :show-row-index="true" :show-data-view-meta="false"
      :pagination="{pageSizes: [15, 30, 50, 100], showJumper: true}" />
  </RendererSection>
</template>

<script setup lang="ts">
import {computed, ref} from 'vue'
import type {DataRow, DataView, SparkNode} from '@spark-appworks/spark-data'
import {RendererButton, RendererSection, RendererTable, useSparkComponent, type RFilterProps, type RToolbarProps, consumeRequiredPageService} from '@spark-appworks/spark-component'
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

async function runFileAction(action: (view: DataView, assertCurrent: () => void) => Promise<void>): Promise<void> {
  const runtime = session.runtime
  const key = viewKey.value
  const view = runtime?.resolveView(key)
  if (busy.value || !runtime || !view || view.hasUnconfirmedSave) return
  const assertCurrent = () => {
    if (!session.isCurrent(runtime) || viewKey.value !== key || view.destroyed || runtime.resolveView(key) !== view) {
      throw new Error('文件目录视图已失效')
    }
  }
  busy.value = true
  try {
    await action(view, assertCurrent)
  } catch (cause) {
    if (session.isCurrent(runtime)) pageService.showMessage(cause instanceof Error ? cause.message : String(cause), 'error')
  } finally {
    busy.value = false
  }
}

async function commit(view: DataView, assertCurrent: () => void, change: () => Promise<unknown>, done: string): Promise<void> {
  assertCurrent()
  try {
    await change()
    assertCurrent()
    const result = await view.saveChanges()
    assertCurrent()
    if (!result.success) throw new Error(result.message || '保存失败')
    await view.refresh()
    assertCurrent()
    if (view.loadingError) throw view.loadingError
    pageService.showMessage(done, 'success')
  } catch (cause) {
    if (!view.destroyed && !view.hasUnconfirmedSave) {
      try {assertCurrent(); await view.discardAndReload()} catch (reload) {
        if (!view.destroyed) error.value = reload instanceof Error ? reload.message : String(reload)
      }
    }
    throw cause
  }
}

async function pickAndUpload(): Promise<void> {
  await runFileAction(async (view, assertCurrent) => {
    const selected = await pageService.browseFiles({multiple: false})
    assertCurrent()
    if (selected.length > 1) throw new Error('每次只能上传一个文件')
    const file = selected[0]?.file
    if (file) await commit(view, assertCurrent, () => view.addRow({content: file}), `${file.name} 已上传`)
  })
}

async function remove(row: DataRow): Promise<void> {
  await runFileAction(async (view, assertCurrent) => {
    const key = view.rows.includes(row) ? view.getPkKey(row) : undefined
    if (key === undefined) throw new Error('文件记录缺少正式身份')
    const assertRow = view.captureReadRow(row, ['fileName', 'path'])
    if (!await pageService.showConfirm(`确定删除文件“${String(key)}”？`, '删除确认', {type: 'warning'})) return
    assertCurrent()
    assertRow()
    if (view.deleteActionState(row) !== 'enabled') throw new Error('当前文件不允许删除')
    await commit(view, assertCurrent, async () => {
      if (!await view.removeRow(key)) throw new Error('文件删除未暂存')
    }, `${String(key)} 已删除`)
  })
}
</script>

<style scoped>
.file-page {padding: 8px}
</style>