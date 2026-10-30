/**
 * @module app:views/app/dev-system/composables/useDevFileEditor
 * 职责：提供 DevSystem 的 useDevFileEditor 能力，围绕 模块入口、副作用注册或内部组合逻辑 支撑配置调试、节点编辑、预览或开发态状态管理。
 * 边界：只服务开发系统 UI 和调试流程；工具文件状态与持久化沿正式 DataView/DataSet 链处理。
 * AI用途：需要理解开发系统如何编辑节点和文件时，用本模块定位 views/app/dev-system/composables/useDevFileEditor。
 */
import { computed, type Ref } from 'vue'
import type { DevState } from '../useDevState'
import type { PageToolFileName } from '@spark-appworks/spark-project-model'

/** 页面文件内容与编辑状态经文件 DataView；持久化及回执由 DataSet 与数据层资源适配承接。 */
export function useDevFileEditor(state: DevState, activeFile: Readonly<Ref<PageToolFileName>>) {
  const project = state.project
  function fileState(name:PageToolFileName){
    void state.externalDataViewRevision.value
    const pageId=state.activePageId.value
    if(!pageId)return undefined
    try{return state.pageToolFileDataViewState(pageId,name)}catch{return undefined}
  }

  function alignActivePage(): boolean {
    const pageId = state.activePageId.value.trim()
    if (!pageId) return false
    if (project.getActivePage()?.pageId !== pageId) {
      project.setActivePage(pageId)
    }
    return true
  }

  const isReady = computed(() => {
    const pageId=state.activePageId.value
    return pageId!==''&&project.getActivePage()?.pageId===pageId
  })
  const isDirty = computed(() => fileState(activeFile.value)?.dirty ?? false)
  const isUnconfirmed = computed(() => fileState(activeFile.value)?.unconfirmed ?? false)
  const text = computed(() => {
    void state.projectRevision.value
    void state.externalDataViewRevision.value
    const pageId=state.activePageId.value
    if(!pageId)return ''
    return state.readPageToolFileDataViewText(pageId,activeFile.value)
  })

  async function ensureLoaded(options?: { forceReload?: boolean }) {
    const pageId=state.activePageId.value
    if (!pageId) return
    if (!alignActivePage()) return
    await state.loadPageToolFileDataView({pageId,fileName:activeFile.value,forceReload:options?.forceReload===true})
  }

  function isFileDirty(name: PageToolFileName): boolean {
    void state.projectRevision.value
    return fileState(name)?.dirty ?? false
  }

  async function save() {
    if (state.pageIoBusy.value || state.allSaving.value) return
    const pageId = state.activePageId.value
    const fileName = activeFile.value
    if (!pageId || !alignActivePage()) return

    state.pageIoBusy.value = true
    try {
      await state.savePageToolFile({pageId,fileName})
      state.addStatus(`页面 ${pageId}/${fileName} 本轮提交已确认${isFileDirty(fileName) ? '，仍有新修改待保存' : ''}`, 'success')
    } catch (e) {
      state.addStatus(`保存 ${fileName} 失败: ${String(e)}${isUnconfirmed.value ? '；再次保存先核验原提交' : ''}`, 'error')
      throw e
    } finally {
      state.pageIoBusy.value = false
    }
  }

  async function refresh() {
    try {await ensureLoaded({ forceReload: true })}
    catch (cause) {state.addStatus(`文件重载未完成：${String(cause)}`, 'error'); throw cause}
  }

  return {
    isReady,
    isDirty,
    isUnconfirmed,
    text,
    ensureLoaded,
    isFileDirty,
    save,
    refresh,
  }
}
