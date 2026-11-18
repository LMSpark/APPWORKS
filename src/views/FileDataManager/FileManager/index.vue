<!--
@module app:views/FileDataManager/FileManager/index
职责：恢复文件管理：按文件名称查询 filedata 文件区、选择本地文件上传、确认后删除文件。
边界：列表、上传与删除都经同一PageRuntime的FileDataCatalog视图提交；上传核原字节、删除回列确认，失败后丢弃本地草稿并按实际目录重读。
AI用途：迁移参考仓 FileDataManager/FileManager 时，核对文件区、导航身份(dataSpaceId)与保存回执。
-->
<template>
  <SparkPageRenderer v-if="catalogRuntime && host" :page-runtime="catalogRuntime" :route-snapshot="routeSnapshot" :host="host" />
  <RendererSection v-else title="文件管理" :bordered="false"
    :status="loading ? '正在读取文件目录…' : ''" :error="error" :retryable="!loading && !ready" retry-text="重试" @retry="loadCurrentRoute" />
</template>

<script setup lang="ts">
import {computed, ref} from 'vue'
import {useRoute} from 'vue-router'
import type {DataRow, DataView} from '@spark-appworks/spark-data'
import {RendererSection, SparkPageRenderer, useSparkComponent, consumeRequiredPageService} from '@spark-appworks/spark-component'
import {useFeaturePageRuntime} from '@/views/features/shared/runtime/use-feature-page-runtime'
import {PageTool} from '@spark-appworks/spark-project-model'
import rule from './rule.json?raw'
import script from './script.js?raw'
import style from './style.css?raw'

const {sparkConsume} = useSparkComponent({type: 'file-manager-page'})
const pageService = consumeRequiredPageService(sparkConsume, 'file-manager-page')
const route = useRoute()
const routeSnapshot = computed(() => {
  const {path,fullPath,name,params,query,hash}=route
  return {path,fullPath,name:name??null,params,query,hash}
})
const navigationId='EDF7DE3E5723E127F98B2A119BE81BF9'
const tool=new PageTool({pageId:navigationId})
tool.hydrateFileText('rule.json',rule)
tool.hydrateFileText('script.js',script)
tool.hydrateFileText('style.css',style)
tool.markLoaded()
const {viewKey, session, ready, loading, error, loadCurrentRoute} = useFeaturePageRuntime({
  scenarioId: '23F469CC96AC4B73BA5AE593C0002BD4', navigationId, tool,
  modelName: 'FileDataCatalog', componentType: 'file-manager-page', title: '文件管理',
})
const busy = ref(false)
const catalogRuntime=computed(()=>ready.value?session.runtime:undefined)
const host=computed(()=>{
  const runtime=catalogRuntime.value
  if(!runtime)return undefined
  const assertCurrent=()=>{if(!session.isCurrent(runtime))throw new Error('文件目录视图已失效')}
  return {runtime,assertCurrent,async invoke(command:string,input:unknown){
    assertCurrent()
    if(command==='files.connect')return {busy:()=>busy.value,error:()=>error.value}
    if(command==='files.upload')await pickAndUpload()
    if(command==='files.remove'||command==='files.download'){
      const view=runtime.resolveView(viewKey.value)
      const row=view?.rows.find(item=>view.getPkKey(item)===input)
      if(row){
        if(command==='files.download')await download(row)
        else await remove(row)
      }
    }
    return undefined
  }}
})

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

async function download(row: DataRow): Promise<void> {
  await runFileAction(async (view, assertCurrent) => {
    const fileName = view.getPkKey(row)
    if (typeof fileName !== 'string' || !fileName) throw new Error('文件记录缺少正式身份')
    const assertRow = view.captureReadRow(row, ['fileName', 'path'])
    const content = view.dataSet?.getView(view.tableName, 'download')
    if (!content) throw new Error('文件下载视图缺失')
    content.queryContext = {fileName}
    try {
      await content.refresh()
      assertCurrent()
      assertRow()
      if (content.loadingError) throw content.loadingError
      const snapshot = content.readSnapshot()
      const result = snapshot.rows[0]
      const bytes = result?.['content']
      if (snapshot.total !== 1 || result?.['fileName'] !== fileName || !ArrayBuffer.isView(bytes) || Object.prototype.toString.call(bytes) !== '[object Uint8Array]') {
        throw new Error('文件下载结果与原记录不一致')
      }
      const url = URL.createObjectURL(new Blob([new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength).slice()]))
      try {
        const link = document.createElement('a')
        link.href = url
        link.download = fileName
        link.click()
      } finally {
        window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      }
    } finally {
      if (!content.destroyed) content.queryContext = {fileName:''}
    }
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
